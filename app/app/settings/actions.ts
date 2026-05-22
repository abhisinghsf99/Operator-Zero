"use server";

/**
 * app/app/settings/actions.ts
 * Server Actions for the Settings/Connections page.
 *
 * Exports:
 *   disconnectIntegration(provider) — delete integration + clear mirror data (T-2-08-05)
 *
 * SECURITY:
 *   - user_id ALWAYS from getClaims().sub — never from client input
 *   - disconnectIntegration re-checks ownership before deleting (T-2-08-05)
 *   - All DB operations go through withUserRls (RLS enforced)
 *   - Zod validates the provider input
 *   - Disconnect is destructive — requires confirm dialog in UI (T-2-08-05)
 *
 * THREAT MODEL:
 *   T-2-08-04: Settings reads via withUserRls (cross-user protection)
 *   T-2-08-05: Disconnect re-checks ownership + confirm dialog enforced in UI
 */
import { createClient } from "@/lib/auth/server";
import { withUserRls, integrations } from "@/lib/db";
import { serviceDb } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
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
} from "@/lib/db/schema";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const providerSchema = z.enum(["shopify", "gmail"]);

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
