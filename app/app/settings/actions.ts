"use server";

/**
 * app/app/settings/actions.ts
 * Server Actions for the Settings surface.
 *
 * Exports:
 *   disconnectIntegration(provider)         — delete integration + clear mirror data (T-2-08-05)
 *   saveBrandVoice(markdown)                — encrypt + persist brand voice (SET-02, T-4-03-01)
 *   getBrandVoice(userId)                   — decrypt with legacy-plaintext fallback (SET-02, A2)
 *   regenerateBrandVoice()                  — return AI-generated draft only, no DB write (SET-02, T-4-03-04)
 *   addMemoryItem(content, category)        — store new memory item (SET-04)
 *   editMemoryItem(id, content)             — update memory item content (SET-04)
 *   deleteMemoryItem(id)                    — soft-delete memory item (SET-04)
 *   undoDeleteMemoryItem(id)                — restore soft-deleted item (SET-04)
 *   getMemoryItems(userId)                  — list all non-deleted items for user (SET-04)
 *   updateProfile(data)                     — update display_name / avatar_url (SET-05)
 *   updateEmail(email)                      — update auth email via supabase.auth.updateUser (SET-05)
 *   updatePassword(password)                — update auth password via supabase.auth.updateUser (SET-05)
 *   saveAutonomyThresholds(level, overrides)— persist default level + curated overrides (SET-03, D-05/D-06)
 *   getAutonomyThresholds(userId)           — load autonomy thresholds for a user (SET-03)
 *   revokeSession(sessionId)               — mark session revoked_at + Supabase signOut (AUTH-04)
 *   signOutEverywhere()                    — revoke all sessions + Supabase global signOut (AUTH-05)
 *   listSessions(userId)                   — list non-revoked sessions (AUTH-04)
 *
 * SECURITY:
 *   - user_id ALWAYS from getClaims().sub — never from client input (T-4-03-02)
 *   - Brand voice encrypted at rest via encryptToken (libsodium) — T-4-03-01
 *   - regenerateBrandVoice returns draft only — no silent overwrite — T-4-03-04
 *   - Memory CRUD delegated to lib/agent/memory.ts with ownership bound to userId — T-4-03-02
 *   - Memory category restricted to allowed enum — T-4-03-05
 *   - Zod validates all inputs
 *   - revalidatePath("/app/settings") after every mutation
 *
 * THREAT MODEL (Phase 4):
 *   T-4-03-01: brand_voice_profiles at rest — encryptToken before write; try-catch decrypt
 *   T-4-03-02: cross-tenant write — getValidatedClaims; userId from claims.sub only
 *   T-4-03-03: XSS via markdown — react-markdown without rehype-raw in UI (enforced in component)
 *   T-4-03-04: silent overwrite — regenerateBrandVoice returns draft only
 *   T-4-03-05: memory category injection — category restricted to enum in Zod
 *   T-4-04-03: cross-tenant session revoke — listSessions/revokeSession filter by user_id
 *   T-4-04-05: injected override key (non-curated tool) — Zod restricts keys to D-05 set
 */
import { createClient } from "@/lib/auth/server";
import { withUserRls, integrations } from "@/lib/db";
import { serviceDb } from "@/lib/db/client";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  shopifyProducts,
  shopifyProductVariants,
  shopifyOrders,
  shopifyPages,
  shopifyRedirects,
  shopifySyncState,
  gmailThreads,
  gmailMessages,
  gmailSyncState,
  brandVoiceProfiles,
  brandVoiceSamples,
  memoryItems,
  userProfiles,
  autonomyThresholds,
  userSessions,
  workflowRuns,
  userExports,
} from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import { encryptToken, decryptToken } from "@/lib/integrations/crypto";
import {
  storeMemoryItem,
  updateMemoryItem,
  softDeleteMemoryItem,
} from "@/lib/agent/memory";
import { revokeSession as registryRevokeSession, signOutEverywhere as registrySignOutEverywhere } from "@/lib/auth/session-registry";
import { generateText } from "ai";
import { resolveModel } from "@/lib/agent/llm/models";
import { isSandboxClaims, DEMO_DISABLED_MESSAGE } from "@/lib/auth/demo";
import { CURATED_OVERRIDE_TOOLS } from "@/lib/workflows/autonomy";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const providerSchema = z.enum(["shopify", "gmail"]);

const BrandVoiceSchema = z.object({
  markdown: z.string().max(20000, "Brand voice must be 20,000 characters or less."),
});

// T-4-03-05: category restricted to allowed enum — prevents injection
const MemoryCategorySchema = z.enum([
  "brand",
  "catalog",
  "policy",
  "preference",
  "decision_history",
]);

const AddMemoryItemSchema = z.object({
  content: z.string().min(1).max(5000),
  category: MemoryCategorySchema,
});

const EditMemoryItemSchema = z.object({
  id: z.string().uuid("Invalid memory item ID"),
  content: z.string().min(1).max(5000),
});

const DeleteMemoryItemSchema = z.object({
  id: z.string().uuid("Invalid memory item ID"),
});

const UpdateProfileSchema = z.object({
  displayName: z.string().max(100).optional(),
  avatarUrl: z.string().url("Invalid avatar URL").optional(),
});

const UpdateEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const UpdatePasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

// T-4-04-05: restrict override keys to the D-05 curated tool set
const AutomationLevelEnum = z.enum(["L1", "L2", "L3"]);

// Zod enum requires a mutable tuple with at least one element — cast via unknown
const curatedToolsTuple = [...CURATED_OVERRIDE_TOOLS] as unknown as [string, ...string[]];

const SaveAutonomySchema = z.object({
  defaultLevel: AutomationLevelEnum,
  overrides: z
    .record(z.enum(curatedToolsTuple), AutomationLevelEnum)
    .default({}),
});

const RevokeSessionSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getValidatedClaims() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  if (!claims?.sub) {
    return { claims: null, error: "Not authenticated." };
  }
  return { claims, error: null };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * disconnectIntegration — delete an integration + clear its mirror data.
 *
 * DESTRUCTIVE: Deletes the integrations row and all associated mirror data.
 * Requires confirm dialog in the UI before calling (T-2-08-05).
 *
 * Ownership is re-checked via RLS + explicit user_id filter — a race
 * condition or forged call cannot delete another user's integration.
 *
 * @param provider 'shopify' | 'gmail'
 * @returns void on success, { error } on auth/ownership failure
 */
export async function disconnectIntegration(
  provider: string
): Promise<{ error: string } | void> {
  // 1. Validate provider input
  const parsed = providerSchema.safeParse(provider);
  if (!parsed.success) {
    return { error: `Invalid provider: must be 'shopify' or 'gmail'.` };
  }

  // 2. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }

  const userId = claims.sub as string;
  const providerValue = parsed.data;

  // Demo guard (WS8): block ANY sandbox/demo identity from disconnecting,
  // period. The old guard here read `isDemoUser(userId) &&
  // isDemoConnectionLocked()`, which let an ANONYMOUS sandbox visitor
  // disconnect Shopify unconditionally (isDemoUser only matches the shared
  // demo account, and DEMO_SHOPIFY_LOCKED defaults unset) — clearShopifyMirror()
  // then wiped that visitor's demo dataset with no way to reconnect. The
  // old demo-lock-flag nuance is intentionally dropped: this now matches the
  // other five destructive actions in this file (isSandboxClaims — see
  // updateEmail, updatePassword, revokeSession, signOutEverywhere,
  // requestAccountDeletion below).
  if (isSandboxClaims(claims)) return { error: DEMO_DISABLED_MESSAGE };

  // 3. Delete integration row via RLS (ownership enforced at DB layer)
  await withUserRls(claims, async (tx) => {
    await tx
      .delete(integrations)
      .where(
        and(
          eq(integrations.user_id, userId),
          eq(integrations.provider, providerValue)
        )
      );
  });

  // 4. Clear mirror data via serviceDb (RLS bypass — explicit user_id filter)
  // This is intentional: mirror data is owned by the user and should be cleared
  // on disconnect. We use serviceDb here because mirror tables may not have
  // the authenticated role set up for deletion at this point.
  if (providerValue === "shopify") {
    // Clear all Shopify mirror tables for this user
    await clearShopifyMirror(userId);
  } else if (providerValue === "gmail") {
    // Clear all Gmail mirror tables for this user
    await clearGmailMirror(userId);
  }

  revalidatePath("/app/settings");
}

/**
 * clearShopifyMirror — delete all Shopify mirror data for a user.
 * Uses serviceDb with explicit user_id filter (RLS bypassed intentionally).
 */
async function clearShopifyMirror(userId: string): Promise<void> {
  await Promise.all([
    serviceDb.delete(shopifyProducts).where(eq(shopifyProducts.user_id, userId)),
    serviceDb.delete(shopifyOrders).where(eq(shopifyOrders.user_id, userId)),
    serviceDb.delete(shopifyPages).where(eq(shopifyPages.user_id, userId)),
    serviceDb.delete(shopifyRedirects).where(eq(shopifyRedirects.user_id, userId)),
    serviceDb.delete(shopifySyncState).where(eq(shopifySyncState.user_id, userId)),
  ]);
  // Variants are FK-cascaded from products, but delete explicitly for safety
  await serviceDb.delete(shopifyProductVariants).where(eq(shopifyProductVariants.user_id, userId));
}

/**
 * clearGmailMirror — delete all Gmail mirror data for a user.
 * Uses serviceDb with explicit user_id filter (RLS bypassed intentionally).
 */
async function clearGmailMirror(userId: string): Promise<void> {
  await Promise.all([
    serviceDb.delete(gmailMessages).where(eq(gmailMessages.user_id, userId)),
    serviceDb.delete(gmailSyncState).where(eq(gmailSyncState.user_id, userId)),
  ]);
  // Threads contain messages — delete threads after messages
  await serviceDb.delete(gmailThreads).where(eq(gmailThreads.user_id, userId));
}

// ─── Brand Voice ─────────────────────────────────────────────────────────────

/**
 * saveBrandVoice — encrypt markdown and persist to brand_voice_profiles.
 *
 * Security: encryptToken (libsodium XSalsa20-Poly1305) before DB write — T-4-03-01.
 * The plaintext markdown NEVER reaches the database column.
 *
 * @param markdown - the raw markdown string to save
 * @returns void on success, { error } on auth/validation failure
 */
export async function saveBrandVoice(
  markdown: string
): Promise<{ error: string } | void> {
  // 1. Validate input
  const parsed = BrandVoiceSchema.safeParse({ markdown });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  // 2. Get authenticated user claims (T-4-03-02)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 3. Encrypt before storing (T-4-03-01 — plaintext never persisted)
  const encrypted = await encryptToken(parsed.data.markdown);

  // 4. Upsert via serviceDb — insert if no row exists, update if it does (CR-01).
  //    user_id is the PK on brand_voice_profiles so it is a valid upsert target.
  await serviceDb
    .insert(brandVoiceProfiles)
    .values({
      user_id: userId,
      profile_markdown: encrypted,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: brandVoiceProfiles.user_id,
      set: { profile_markdown: encrypted, updated_at: new Date() },
    });

  revalidatePath("/app/settings");
}

/**
 * getBrandVoice — load and decrypt brand voice markdown for a user.
 *
 * Legacy plaintext tolerance (A2 / Pitfall 6):
 *   Onboarding writes profile_markdown as plaintext (no encryptToken).
 *   This read path wraps decryptToken in try-catch and falls back to the
 *   raw stored value when decryption fails — ensuring existing rows still render.
 *
 * @param userId - the authenticated user's UUID
 * @returns the decrypted (or raw legacy) markdown string, or null if no row exists
 */
export async function getBrandVoice(
  userId: string
): Promise<{ profile_markdown: string; tone_tags: string[] | null; forbidden_phrases: string[] | null } | null> {
  // CR-05: assert the caller is the authenticated user before issuing a serviceDb query
  const { claims, error } = await getValidatedClaims();
  if (error || !claims || claims.sub !== userId) return null;

  const [row] = await serviceDb
    .select()
    .from(brandVoiceProfiles)
    .where(eq(brandVoiceProfiles.user_id, userId))
    .limit(1);

  if (!row) return null;

  // A2 / Pitfall 6: try decryptToken; fall back to raw value for legacy plaintext rows
  let decrypted: string;
  try {
    decrypted = await decryptToken(row.profile_markdown);
  } catch {
    // Legacy plaintext written by onboarding — return raw value
    decrypted = row.profile_markdown;
  }

  return {
    ...row,
    profile_markdown: decrypted,
  };
}

/**
 * regenerateBrandVoice — generate an AI draft from brand_voice_samples.
 *
 * CRITICAL (T-4-03-04, SET-02): Returns { draft } ONLY. Does NOT write to the DB.
 * The client must explicitly call saveBrandVoice() to persist the regenerated draft.
 * This enforces the confirm-before-replace pattern — no silent overwrite.
 *
 * @returns { draft: string } — the AI-generated draft markdown
 */
export async function regenerateBrandVoice(): Promise<
  { draft: string } | { error: string }
> {
  // 1. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 2. Load brand voice samples for this user
  const samples = await serviceDb
    .select({ sample_text: brandVoiceSamples.sample_text, source: brandVoiceSamples.source })
    .from(brandVoiceSamples)
    .where(eq(brandVoiceSamples.user_id, userId))
    .limit(10);

  const samplesText =
    samples.length > 0
      ? samples.map((s, i) => `Sample ${i + 1}:\n${s.sample_text}`).join("\n\n")
      : "(No samples available — generate based on a generic ecommerce brand voice.)";

  // 3. Call the DRAFTER model to produce a draft markdown (no DB write — T-4-03-04)
  const result = await generateText({
    model: resolveModel("DRAFTER"),
    maxOutputTokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are helping a Shopify store owner define their brand voice profile. Based on the following writing samples, produce a brand voice profile in markdown format. The profile should cover: tone, vocabulary preferences, phrases to avoid, and example sentences that embody the voice. Keep it concise and actionable — this document will be read by an AI agent before every content-generating task.\n\nSamples:\n${samplesText}\n\nReturn only the markdown — no preamble, no code fences.`,
      },
    ],
  });

  const draftText = result.text ?? "";
  if (!draftText) {
    return { error: "Failed to generate brand voice draft. Please try again." };
  }

  // T-4-03-04: return draft only — caller must explicitly save
  return { draft: draftText };
}

// ─── Memory CRUD ─────────────────────────────────────────────────────────────

/**
 * addMemoryItem — store a new memory item for the authenticated user.
 *
 * Delegates to storeMemoryItem (embeddings + DB insert).
 * Category restricted to allowed enum (T-4-03-05).
 *
 * @param content  - the memory content text
 * @param category - 'brand' | 'catalog' | 'policy' | 'preference' | 'decision_history'
 */
export async function addMemoryItem(
  content: string,
  category: string
): Promise<{ id: string } | { error: string }> {
  // 1. Validate inputs (T-4-03-05: category enum enforced)
  const parsed = AddMemoryItemSchema.safeParse({ content, category });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  // 2. Get authenticated user (T-4-03-02)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 3. Delegate to lib/agent/memory.ts (embeds + inserts)
  const result = await storeMemoryItem(userId, parsed.data.content, parsed.data.category);

  revalidatePath("/app/settings");
  return result;
}

/**
 * editMemoryItem — update the content of an existing memory item.
 *
 * Ownership bound to authenticated user's userId — T-4-03-02.
 * Re-embeds the new content via updateMemoryItem.
 *
 * @param id      - the memory item UUID
 * @param content - the new content string
 */
export async function editMemoryItem(
  id: string,
  content: string
): Promise<{ error: string } | void> {
  // 1. Validate inputs
  const parsed = EditMemoryItemSchema.safeParse({ id, content });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  // 2. Get authenticated user (T-4-03-02)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 3. Delegate to lib/agent/memory.ts (ownership scoped by userId)
  await updateMemoryItem(userId, parsed.data.id, parsed.data.content);

  revalidatePath("/app/settings");
}

/**
 * deleteMemoryItem — soft-delete a memory item (sets soft_deleted_at).
 *
 * The item is NOT hard-deleted. A Sonner undo toast in the UI allows reversal
 * within 24h (undoDeleteMemoryItem). recallMemory already excludes soft-deleted rows.
 *
 * Ownership bound to authenticated user's userId — T-4-03-02.
 *
 * @param id - the memory item UUID
 */
export async function deleteMemoryItem(
  id: string
): Promise<{ error: string } | void> {
  // 1. Validate input
  const parsed = DeleteMemoryItemSchema.safeParse({ id });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  // 2. Get authenticated user (T-4-03-02)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 3. Soft-delete (sets soft_deleted_at, does NOT hard-delete)
  await softDeleteMemoryItem(userId, parsed.data.id);

  revalidatePath("/app/settings");
}

/**
 * undoDeleteMemoryItem — restore a soft-deleted memory item within the 24h undo window.
 *
 * Clears soft_deleted_at so the item reappears in recall results.
 * Ownership bound to authenticated user's userId — T-4-03-02.
 *
 * @param id - the memory item UUID to restore
 */
export async function undoDeleteMemoryItem(
  id: string
): Promise<{ error: string } | void> {
  // 1. Validate input
  const parsed = DeleteMemoryItemSchema.safeParse({ id });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  // 2. Get authenticated user (T-4-03-02)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 3. Clear soft_deleted_at — restores item for recall
  await serviceDb
    .update(memoryItems)
    .set({ soft_deleted_at: null, updated_at: new Date() })
    .where(and(eq(memoryItems.id, parsed.data.id), eq(memoryItems.user_id, userId)));

  revalidatePath("/app/settings");
}

/**
 * getMemoryItems — list all non-deleted memory items for a user, grouped by category.
 *
 * Excludes soft-deleted rows (soft_deleted_at IS NULL filter).
 * Uses serviceDb with explicit user_id filter (T-4-03-02: serviceDb bypasses RLS).
 *
 * @param userId - the authenticated user's UUID
 */
export async function getMemoryItems(userId: string): Promise<Array<{
  id: string;
  category: string;
  content: string;
  source_type: string | null;
  created_at: Date;
  updated_at: Date;
}>> {
  // CR-05: assert the caller is the authenticated user (serviceDb bypasses RLS)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims || claims.sub !== userId) return [];

  return serviceDb
    .select({
      id: memoryItems.id,
      category: memoryItems.category,
      content: memoryItems.content,
      source_type: memoryItems.source_type,
      created_at: memoryItems.created_at,
      updated_at: memoryItems.updated_at,
    })
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.user_id, userId),
        isNull(memoryItems.soft_deleted_at)
      )
    )
    .orderBy(memoryItems.category, memoryItems.created_at);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * updateProfile — update display_name and/or avatar_url in user_profiles.
 *
 * At least one field must be provided.
 * Ownership bound to authenticated user's userId — T-4-03-02.
 *
 * @param data - { displayName?, avatarUrl? }
 */
export async function updateProfile(data: {
  displayName?: string;
  avatarUrl?: string;
}): Promise<{ error: string } | void> {
  // 1. Validate inputs
  const parsed = UpdateProfileSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  if (!parsed.data.displayName && !parsed.data.avatarUrl) {
    return { error: "At least one field must be provided." };
  }

  // 2. Get authenticated user (T-4-03-02)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 3. Build update set
  const updateSet: Partial<{ display_name: string; avatar_url: string; updated_at: Date }> = {
    updated_at: new Date(),
  };
  if (parsed.data.displayName !== undefined) {
    updateSet.display_name = parsed.data.displayName;
  }
  if (parsed.data.avatarUrl !== undefined) {
    updateSet.avatar_url = parsed.data.avatarUrl;
  }

  // 4. Update user_profiles row
  await serviceDb
    .update(userProfiles)
    .set(updateSet)
    .where(eq(userProfiles.user_id, userId));

  revalidatePath("/app/settings");
}

/**
 * updateEmail — change the user's email via Supabase Auth.
 *
 * Uses supabase.auth.updateUser({ email }) — sends a confirmation email.
 * Ownership is implicit: operates on the authenticated session's user.
 *
 * @param email - the new email address
 */
export async function updateEmail(
  email: string
): Promise<{ error: string } | void> {
  // 1. Validate input
  const parsed = UpdateEmailSchema.safeParse({ email });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid email." };
  }

  // 2. Get authenticated user
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // Demo guard: block destructive action for the demo user
  if (isSandboxClaims(claims)) return { error: DEMO_DISABLED_MESSAGE };

  // 3. Update via Supabase Auth (sends confirmation email)
  const supabase = await createClient();
  const { error: authError } = await supabase.auth.updateUser({
    email: parsed.data.email,
  });

  if (authError) {
    return { error: authError.message };
  }

  revalidatePath("/app/settings");
}

/**
 * updatePassword — change the user's password via Supabase Auth.
 *
 * Uses supabase.auth.updateUser({ password }).
 * Ownership is implicit: operates on the authenticated session's user.
 *
 * @param password - the new password (min 8 chars)
 */
export async function updatePassword(
  password: string
): Promise<{ error: string } | void> {
  // 1. Validate input
  const parsed = UpdatePasswordSchema.safeParse({ password });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid password." };
  }

  // 2. Get authenticated user
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // Demo guard: block destructive action for the demo user
  if (isSandboxClaims(claims)) return { error: DEMO_DISABLED_MESSAGE };

  // 3. Update via Supabase Auth
  const supabase = await createClient();
  const { error: authError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (authError) {
    return { error: authError.message };
  }

  revalidatePath("/app/settings");
}

// ─── Autonomy Thresholds ──────────────────────────────────────────────────────

/**
 * saveAutonomyThresholds — persist global default automation level and curated
 * per-action overrides for the authenticated user.
 *
 * D-05: overrides are restricted to the curated tool set (price, status,
 *       redirects, inventory, send-email, page-content) — Zod enforces keys.
 * D-06: override one-directionality is enforced in the engine (execute-workflow-run.ts),
 *       not here. The UI copy makes this clear ("overrides only add friction").
 * D-07: default_level applies to NEW workflows only — this action does NOT
 *       retroactively update existing workflows' automation_level columns.
 *
 * @param defaultLevel - 'L1' | 'L2' | 'L3'
 * @param overrides    - { [curatedToolName]: 'L1' | 'L2' | 'L3' }
 */
export async function saveAutonomyThresholds(
  defaultLevel: string,
  overrides: Record<string, string>
): Promise<{ error: string } | void> {
  // 1. Validate inputs (T-4-04-05: curated key restriction enforced by Zod)
  const parsed = SaveAutonomySchema.safeParse({ defaultLevel, overrides });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  // 2. Get authenticated user claims (T-4-04-03)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 3. Upsert autonomy_thresholds row — apply to this user's global defaults.
  //    D-07: does NOT mutate existing workflows' automation_level columns.
  await serviceDb
    .insert(autonomyThresholds)
    .values({
      user_id: userId,
      default_level: parsed.data.defaultLevel,
      per_action_overrides: parsed.data.overrides,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: autonomyThresholds.user_id,
      set: {
        default_level: parsed.data.defaultLevel,
        per_action_overrides: parsed.data.overrides,
        updated_at: new Date(),
      },
    });

  revalidatePath("/app/settings");
}

/**
 * getAutonomyThresholds — load autonomy thresholds for a user.
 *
 * Returns null if no row exists (user has never saved custom thresholds).
 * Callers should fall back to { default_level: "L2", per_action_overrides: {} }.
 *
 * @param userId - the authenticated user's UUID
 */
export async function getAutonomyThresholds(
  userId: string
): Promise<{ default_level: string; per_action_overrides: Record<string, string> } | null> {
  // CR-05: assert the caller is the authenticated user (serviceDb bypasses RLS)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims || claims.sub !== userId) return null;

  const [row] = await serviceDb
    .select()
    .from(autonomyThresholds)
    .where(eq(autonomyThresholds.user_id, userId))
    .limit(1);

  if (!row) return null;

  return {
    default_level: row.default_level,
    per_action_overrides: (row.per_action_overrides ?? {}) as Record<string, string>,
  };
}

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * revokeSession — mark a specific session revoked and call Supabase Auth signOut.
 *
 * Ownership re-checked: the sessionId + userId must match (T-4-04-03).
 * Note: JWT access tokens remain valid for up to ~15 min after revocation
 * (Supabase documented window). UI surfaces this caveat honestly (D-10).
 *
 * @param sessionId - the user_sessions.id UUID to revoke
 */
export async function revokeSession(
  sessionId: string
): Promise<{ success: true } | { error: string }> {
  // 1. Validate input
  const parsed = RevokeSessionSchema.safeParse({ sessionId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid session ID." };
  }

  // 2. Get authenticated user claims (T-4-04-03)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // Demo guard: block destructive action for the demo user
  if (isSandboxClaims(claims)) return { error: DEMO_DISABLED_MESSAGE };

  // 3. Delegate to session-registry helper (ownership re-check inside)
  const result = await registryRevokeSession(userId, parsed.data.sessionId);
  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath("/app/settings");
  return { success: true };
}

/**
 * signOutEverywhere — revoke all sessions for the authenticated user.
 *
 * Marks all non-revoked rows with revoked_at and calls supabase.auth.signOut
 * with scope 'global'. JWT window honesty: up to ~15 min for other devices
 * to fully expire.
 */
export async function signOutEverywhere(): Promise<{ success: true } | { error: string }> {
  // 1. Get authenticated user claims (T-4-04-03)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // Demo guard: block destructive action for the demo user
  if (isSandboxClaims(claims)) return { error: DEMO_DISABLED_MESSAGE };

  // 2. Delegate to session-registry helper
  const result = await registrySignOutEverywhere(userId);
  if (!result.success) {
    return { error: result.error };
  }

  // No revalidatePath — user will be signed out and redirected to /login
  return { success: true };
}

/**
 * listSessions — return non-revoked user_sessions rows for the settings page.
 *
 * Ordered by last_seen_at descending (most recently active first).
 * T-4-04-03: filtered by userId only.
 *
 * @param userId - the authenticated user's UUID
 */
export async function listSessions(
  userId: string
): Promise<Array<{
  id: string;
  device_label: string;
  ip_geo_label: string | null;
  last_seen_at: Date;
  created_at: Date;
}>> {
  // CR-05: assert the caller is the authenticated user (serviceDb bypasses RLS)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims || claims.sub !== userId) return [];

  return serviceDb
    .select({
      id: userSessions.id,
      device_label: userSessions.device_label,
      ip_geo_label: userSessions.ip_geo_label,
      last_seen_at: userSessions.last_seen_at,
      created_at: userSessions.created_at,
    })
    .from(userSessions)
    .where(and(eq(userSessions.user_id, userId), isNull(userSessions.revoked_at)))
    .orderBy(desc(userSessions.last_seen_at));   // WR-01: desc — most recent first
}

// ─── Account Export (SET-06, D-08) ───────────────────────────────────────────

/**
 * exportAccountData — initiate a background data export for the authenticated user.
 *
 * Sends an account.export_requested event to Inngest which runs the durable
 * export-account-data job (lib/inngest/functions/export-account-data.ts).
 * The job assembles a JSON bundle, uploads it to the private "user-exports"
 * bucket, and surfaces a 24h signed URL via a user_exports row.
 *
 * This action returns immediately (within 60s) — the export runs in the background.
 * The UI polls/reads the latest user_exports row for status + download link (A5).
 *
 * SECURITY:
 *   T-4-05-01: userId from claims.sub only — never from client input
 *   T-4-05-02: export job targets PRIVATE bucket; download via signed URL only
 *
 * @returns { status: "initiated" } on success, { error } on auth failure
 */
export async function exportAccountData(): Promise<
  { status: "initiated" } | { error: string }
> {
  // 1. Get authenticated user claims (T-4-05-01: userId from claims.sub)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 2. Fire Inngest event — job assembles + uploads in background
  await inngest.send({ name: "account.export_requested", data: { userId } });

  // 3. Return immediately — avoids Vercel timeout (export can take minutes for large accounts)
  return { status: "initiated" };
}

/**
 * getLatestExport — load the most recent user_exports row for the settings page.
 *
 * Used by the Danger Zone UI to surface export status + download link (A5).
 *
 * @param userId - the authenticated user's UUID
 */
export async function getLatestExport(userId: string): Promise<{
  id: string;
  status: string;
  signed_url: string | null;
  object_path: string | null;
  error: string | null;
  created_at: Date;
  completed_at: Date | null;
} | null> {
  // CR-05: assert the caller is the authenticated user (serviceDb bypasses RLS)
  const { claims, error: authError } = await getValidatedClaims();
  if (authError || !claims || claims.sub !== userId) return null;

  const [row] = await serviceDb
    .select({
      id: userExports.id,
      status: userExports.status,
      signed_url: userExports.signed_url,
      object_path: userExports.object_path,
      error: userExports.error,
      created_at: userExports.created_at,
      completed_at: userExports.completed_at,
    })
    .from(userExports)
    .where(eq(userExports.user_id, userId))
    .orderBy(desc(userExports.created_at))   // CR-03: descending — most recent first
    .limit(1);

  return row ?? null;
}

// ─── Account Deletion (SET-07, D-09) ─────────────────────────────────────────

/**
 * requestAccountDeletion — gate-checked deletion request that initiates the
 * purge-account Inngest job.
 *
 * Gate (D-09, Pitfall 4): Blocks deletion if any workflow run is in
 * 'running' or 'paused_for_approval' status. Prevents data corruption from
 * deleting while the agent is mid-execution.
 *
 * On success: sends account.deletion_requested to Inngest. The purge job
 * immediately locks the account (sets deletion_requested_at) then sleeps 7d.
 * Signing back in during the grace window triggers cancelDeletionIfPending (D-09).
 *
 * SECURITY:
 *   T-4-05-03: active-run gate enforced server-side; lock step in Inngest also aborts runs
 *   T-4-05-04: purge scoped to userId only; cascades via auth.users FK
 *
 * @returns void on success, { error } on auth/gate failure
 */
export async function requestAccountDeletion(): Promise<
  { error: string } | void
> {
  // 1. Get authenticated user claims (T-4-05-01)
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // Demo guard: block destructive action for the demo user
  if (isSandboxClaims(claims)) return { error: DEMO_DISABLED_MESSAGE };

  // 2. Active-run gate (D-09, Pitfall 4): block if any run is mid-execution
  const activeRuns = await serviceDb
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.user_id, userId),
        inArray(workflowRuns.status, ["running", "paused_for_approval"])
      )
    )
    .limit(1);

  if (activeRuns.length > 0) {
    return {
      error:
        "Cannot delete while a workflow run is in progress. Wait for all runs to complete and try again.",
    };
  }

  // 3. Send Inngest event — purge job locks account immediately, then sleeps 7d
  await inngest.send({ name: "account.deletion_requested", data: { userId } });

  revalidatePath("/app/settings");
}

/**
 * cancelDeletion — cancel a pending account deletion request.
 *
 * Sends account.deletion_cancelled to Inngest (which cancels the purge-account
 * job via cancelOn CEL) and clears deletion_requested_at on the user profile.
 *
 * This is the in-app cancel variant. The sign-in path variant lives in
 * lib/auth/session-registry.ts (cancelDeletionIfPending).
 *
 * @returns void on success, { error } on auth failure
 */
export async function cancelDeletion(): Promise<{ error: string } | void> {
  // 1. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }
  const userId = claims.sub as string;

  // 2. Send Inngest cancellation event (purge-account cancelOn will pick this up)
  await inngest.send({ name: "account.deletion_cancelled", data: { userId } });

  // 3. Clear deletion_requested_at — shows the pending state is lifted in the UI
  await serviceDb
    .update(userProfiles)
    .set({ deletion_requested_at: null, updated_at: new Date() })
    .where(eq(userProfiles.user_id, userId));

  revalidatePath("/app/settings");
}
