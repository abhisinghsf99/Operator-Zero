"use server";

/**
 * app/onboarding/actions.ts
 * Server Actions for the onboarding wizard.
 *
 * Exports:
 *   saveOnboardingStep(step)         — persists user_profiles.onboarding_step
 *   completeOnboarding()             — sets onboarding_completed_at; redirects to /app/workflows
 *   checkShopifyConnected()          — checks real integrations row (T-2-08-02)
 *   skipGmailStep()                  — marks Gmail as explicitly skipped
 *   saveBrandVoiceProfile(answers)   — saves brand_voice_profiles row (ONBOARD-03)
 *   createStarterWorkflows(starters) — creates Draft L2 workflows (ONBOARD-05)
 *
 * SECURITY:
 *   - user_id ALWAYS from getClaims().sub — never from client input (T-2-08-02)
 *   - Shopify gate checks the real integrations table row, not a client flag
 *   - All DB writes go through withUserRls (RLS enforced at DB layer)
 *   - Zod validates all inputs before any DB access
 *
 * Exports:
 *   saveOnboardingStep(step) — persists user_profiles.onboarding_step
 *   completeOnboarding()     — sets onboarding_completed_at; redirects to /app/workflows
 *   checkShopifyConnected()  — checks real integrations row (T-2-08-02)
 *   skipGmailStep()          — marks Gmail as explicitly skipped
 *
 * SECURITY:
 *   - user_id ALWAYS from getClaims().sub — never from client input (T-2-08-02)
 *   - Shopify gate checks the real integrations table row, not a client flag
 *   - All DB writes go through withUserRls (RLS enforced at DB layer)
 *   - Zod validates all inputs before any DB access
 */
import { createClient } from "@/lib/auth/server";
import { withUserRls, userProfiles, integrations, workflows, workflowVersions, brandVoiceProfiles } from "@/lib/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { WorkflowSuggestion } from "@/app/onboarding/_steps/catalog-audit";

// ─── Schemas ──────────────────────────────────────────────────────────────────

/** Valid step values: 0 = not started, 1-5 = in progress */
const stepSchema = z.number().int().min(0).max(5);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * getValidatedClaims — extract + validate JWT claims.
 * Returns error string if unauthenticated.
 */
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
 * saveOnboardingStep — persist the current onboarding step to user_profiles.
 *
 * Called from each step's "Next" button.
 * Validates the step is in range [0, 5] before writing.
 *
 * @param step The step number to save (0-5)
 * @returns void on success, { error } on validation/auth failure
 */
export async function saveOnboardingStep(
  step: number
): Promise<{ error: string } | void> {
  // 1. Validate step input (Zod — T-2-08-02)
  const parsed = stepSchema.safeParse(step);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid step." };
  }

  // 2. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }

  // 3. Persist onboarding_step inside RLS-enforced transaction
  await withUserRls(claims, async (tx) => {
    await tx
      .update(userProfiles)
      .set({ onboarding_step: parsed.data })
      .where(eq(userProfiles.user_id, claims.sub as string));
  });
}

/**
 * completeOnboarding — finalize onboarding by setting onboarding_completed_at.
 *
 * Sets onboarding_completed_at to now(), resets onboarding_step to 5 (done),
 * then redirects to /app/workflows — the default landing surface (D-16).
 *
 * @returns { error } on auth failure; redirects to /app/workflows on success
 */
export async function completeOnboarding(): Promise<{ error: string } | never> {
  // 1. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }

  // 2. Set onboarding_completed_at + final step inside RLS transaction
  await withUserRls(claims, async (tx) => {
    await tx
      .update(userProfiles)
      .set({
        onboarding_completed_at: new Date(),
        onboarding_step: 5,
      })
      .where(eq(userProfiles.user_id, claims.sub as string));
  });

  revalidatePath("/app");

  // 3. Redirect to the Workflows surface — default landing surface (D-16, ONBOARD-08)
  redirect("/app/workflows");
}

/**
 * checkShopifyConnected — verify Shopify integration exists with status='active'.
 *
 * Checks the REAL integrations table row — never trusts a client-supplied flag.
 * user_id is always from getClaims().sub (T-2-08-02).
 *
 * @returns { connected: true } | { connected: false } | { error }
 */
export async function checkShopifyConnected(): Promise<
  { connected: boolean } | { error: string }
> {
  // 1. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }

  // 2. Query integrations table for active Shopify row
  const result = await withUserRls(claims, async (tx) => {
    return tx
      .select({ status: integrations.status })
      .from(integrations)
      .where(
        and(
          eq(integrations.user_id, claims.sub as string),
          eq(integrations.provider, "shopify")
        )
      )
      .limit(1);
  });

  const row = result[0];
  const connected = row?.status === "active";

  return { connected };
}

/**
 * skipGmailStep — explicitly record that the user skipped Gmail.
 *
 * Saves step=3 (post-Gmail step) so resume picks up at brand-voice.
 * Gmail connection is optional per ONBOARD-02.
 *
 * @returns void on success, { error } on auth failure
 */
export async function skipGmailStep(): Promise<{ error: string } | void> {
  // Advance to step 3 (skipping Gmail, moving to brand-voice)
  return saveOnboardingStep(3);
}

// ─── Brand voice ──────────────────────────────────────────────────────────────

/** Schema for brand voice answers from the wizard conversation */
const brandVoiceAnswersSchema = z.record(z.string().min(1)).refine(
  (answers) => Object.keys(answers).length >= 1,
  { message: "At least one brand voice answer is required." }
);

/**
 * saveBrandVoiceProfile — persist the brand voice profile from onboarding conversation.
 *
 * Builds a markdown profile from the Q&A answers and upserts brand_voice_profiles.
 * Blocks entry to Conversation until saved (ONBOARD-03).
 *
 * @param answers Key-value pairs of question ID to answer text
 * @returns void on success, { error } on failure
 */
export async function saveBrandVoiceProfile(
  answers: Record<string, string>
): Promise<{ error: string } | void> {
  // 1. Validate inputs
  const parsed = brandVoiceAnswersSchema.safeParse(answers);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid answers." };
  }

  // 2. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }

  const userId = claims.sub as string;

  // 3. Build a simple markdown profile from answers
  const writingSample = answers["writing"] ?? "";
  const customerDesc = answers["customer"] ?? "";
  const avoidPhrases = answers["avoid"] ?? "";

  const profileMarkdown = [
    writingSample ? `# Writing sample\n\n${writingSample}` : null,
    customerDesc ? `# Our customer\n\n${customerDesc}` : null,
    avoidPhrases ? `# Phrases we avoid\n\n${avoidPhrases}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  // 4. Upsert brand_voice_profiles row
  await withUserRls(claims, async (tx) => {
    await tx
      .insert(brandVoiceProfiles)
      .values({
        user_id: userId,
        profile_markdown: profileMarkdown,
      })
      .onConflictDoUpdate({
        target: brandVoiceProfiles.user_id,
        set: {
          profile_markdown: profileMarkdown,
          updated_at: new Date(),
        },
      });
  });

  // 5. Advance onboarding step to 4 (catalog audit)
  await saveOnboardingStep(4);
}

// ─── Starter workflows ────────────────────────────────────────────────────────

const starterWorkflowsSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      domain: z.enum(["catalog", "seo", "qa", "inventory", "content"]),
      level: z.literal("L2"),
    })
  )
  .min(1, "At least one workflow must be selected.");

// ─── Starter workflow definitions (WS11) ───────────────────────────────────────
// The old shape was `{ steps: [], version: 1, source: "onboarding" }` — an
// empty step array that made the workflow uneditable/unrunnable (CR-02 already
// fixed current_version_id; this fixes the definition itself). Every starter
// now gets a real minimal definition using ONLY real registry tools with
// schema-valid params (see tests/unit/seed-registry.test.ts).
//
// Rule: a starter workflow must never contain a step whose params reference a
// GID that may not exist in the user's store — a real user's catalog has
// different GIDs than the demo dataset. So every domain gets a GID-free
// `scan` first step (shopify_list_products), and ONLY domains with a
// GID-free, domain-appropriate second read tool get one:
//   - qa:        gmail_list_threads   (no GID required)
//   - inventory: shopify_get_inventory (no GID required — variant_gid/product_gid
//                are both optional filters)
// catalog / seo / content stay single-step scan-only: their natural next step
// (optimize_meta / optimize_product_description) requires a concrete
// product_gid we cannot safely assume exists in a brand-new real store.
type StarterStep = {
  id: string;
  name: string;
  tool: string;
  type: "action";
  params: Record<string, unknown>;
  next_step: string | null;
};

type StarterDefinition = { entry_step: string; steps: StarterStep[] };

function buildStarterDefinition(
  domain: WorkflowSuggestion["domain"]
): StarterDefinition {
  const scanStep: StarterStep = {
    id: "scan",
    name: "Scan the catalog",
    tool: "shopify_list_products",
    type: "action",
    params: { status: "active", limit: 20 },
    next_step: null,
  };

  if (domain === "qa") {
    scanStep.next_step = "act";
    return {
      entry_step: "scan",
      steps: [
        scanStep,
        {
          id: "act",
          name: "Check the support inbox",
          tool: "gmail_list_threads",
          type: "action",
          params: { support_only: true, limit: 10 },
          next_step: null,
        },
      ],
    };
  }

  if (domain === "inventory") {
    scanStep.next_step = "act";
    return {
      entry_step: "scan",
      steps: [
        scanStep,
        {
          id: "act",
          name: "Check low-stock inventory",
          tool: "shopify_get_inventory",
          type: "action",
          params: { low_stock_threshold: 5 },
          next_step: null,
        },
      ],
    };
  }

  // catalog / seo / content: scan-only.
  return { entry_step: "scan", steps: [scanStep] };
}

/**
 * STARTER_WORKFLOW_DEFINITIONS — one definition per onboarding domain,
 * computed once at module load. Exported (pure, no DB) so
 * tests/unit/seed-registry.test.ts can validate every step against the live
 * tool registry without touching the database.
 */
export const STARTER_WORKFLOW_DEFINITIONS: Record<
  WorkflowSuggestion["domain"],
  StarterDefinition
> = {
  catalog: buildStarterDefinition("catalog"),
  seo: buildStarterDefinition("seo"),
  qa: buildStarterDefinition("qa"),
  inventory: buildStarterDefinition("inventory"),
  content: buildStarterDefinition("content"),
};

/**
 * createStarterWorkflows — insert selected starters as Draft L2 workflows.
 *
 * Requirements: ONBOARD-05
 * All workflows: status='draft', automation_level='L2', source='onboarding'
 *
 * @param starters Selected workflow suggestions from catalog audit
 * @returns void on success, { error } on failure
 */
export async function createStarterWorkflows(
  starters: WorkflowSuggestion[]
): Promise<{ error: string } | void> {
  // 1. Validate inputs
  const parsed = starterWorkflowsSchema.safeParse(starters);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid workflow selection." };
  }

  // 2. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) {
    return { error: error ?? "Not authenticated." };
  }

  const userId = claims.sub as string;

  // 3. Insert draft workflows + initial version rows (ONBOARD-05).
  // CR-02: Must also set current_version_id so workflows can execute.
  await withUserRls(claims, async (tx) => {
    for (const starter of parsed.data) {
      // Insert workflow row and capture id
      const [workflowRow] = await tx
        .insert(workflows)
        .values({
          user_id: userId,
          name: starter.name,
          description: starter.description ?? null,
          automation_level: "L2",
          status: "draft",
          trigger_type: "manual",
          trigger_config: {},
          source: "onboarding",
        })
        .returning();

      if (!workflowRow?.id) continue;

      // Insert initial version row — real minimal definition (WS11), never an
      // empty steps array; see STARTER_WORKFLOW_DEFINITIONS above.
      const [versionRow] = await tx
        .insert(workflowVersions)
        .values({
          workflow_id: workflowRow.id,
          version_number: 1,
          definition: {
            ...STARTER_WORKFLOW_DEFINITIONS[starter.domain],
            version: 1,
            source: "onboarding",
          },
        })
        .returning();

      if (!versionRow?.id) continue;

      // Set current_version_id (CR-02)
      await tx
        .update(workflows)
        .set({ current_version_id: versionRow.id })
        .where(
          and(
            eq(workflows.id, workflowRow.id),
            eq(workflows.user_id, userId)
          )
        );
    }
  });

  // 4. Advance onboarding step to 5 (done)
  await saveOnboardingStep(5);
}
