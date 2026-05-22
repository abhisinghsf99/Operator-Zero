"use server";

/**
 * lib/actions/activity.ts
 * Server Actions for activity log management.
 *
 * revertActivity       — single-entry revert with canRevert() enforcement
 * bulkRevertActivity   — dry-run classification or atomic all-or-none execution
 * saveAsWorkflow       — create a scoped chat thread pre-loaded with action context
 *
 * SECURITY:
 *   - All inputs Zod-validated
 *   - getClaims() verifies the session
 *   - withUserRls() enforces row-level security
 *   - activity_entries filtered by user_id before canRevert check (T-3-01-01)
 *   - canRevert() enforced server-side — never trusted from client (T-3-01-05)
 *   - shopify_updated_at re-fetched fresh inside Server Action (T-3-01-05)
 *
 * THREAT MODEL:
 *   T-3-01-01 (cross-user revert): filter activity_entries WHERE user_id = userId
 *   T-3-01-05 (canRevert bypass via direct Server Action): canRevert re-evaluated
 *             server-side with fresh shopifyUpdatedAt — never trusts UI state
 */

import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { createClient } from "@/lib/auth/server";
import { withUserRls } from "@/lib/db/client";
import { activityEntries, shopifyProducts, threads } from "@/lib/db/schema";
import { canRevert, REVERT_REASON_LABELS, executeRevertEffect } from "@/lib/workflows/revert";
import { writeActivityTx } from "@/lib/workflows/activity";
import { revalidatePath } from "next/cache";

// ─── Input schemas ────────────────────────────────────────────────────────────

const RevertActivitySchema = z.object({
  activityId: z.string().uuid("activityId must be a valid UUID"),
});

const BulkRevertActivitySchema = z.object({
  activityIds: z
    .array(z.string().uuid("Each activityId must be a valid UUID"))
    .min(1)
    .max(50, "Bulk revert supports up to 50 entries at once"),
  dryRun: z.boolean(),
});

const SaveAsWorkflowSchema = z.object({
  activityId: z.string().uuid("activityId must be a valid UUID"),
});

// ─── requireUserId helper ─────────────────────────────────────────────────────

async function requireUserId(): Promise<{ userId: string; claims: Record<string, unknown> }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Not authenticated");
  }
  return { userId, claims: data.claims as Record<string, unknown> };
}

// ─── revertActivity ───────────────────────────────────────────────────────────

export type RevertActivityResult = { success: true } | { error: string };

/**
 * revertActivity — revert a single activity entry.
 *
 * Flow (DATA-FLOW.md §10.5):
 *   1. Validate input
 *   2. Authenticate (getClaims)
 *   3. Fetch entry WHERE (id, user_id) — ownership check (T-3-01-01)
 *   4. Re-fetch shopify_updated_at fresh for product targets (T-3-01-05)
 *   5. canRevert() enforcement — return {error} if not allowed
 *   6. writeActivity() for revert_* entry BEFORE external effect (WF-06)
 *   7. executeRevertEffect() — external API call (stub in Phase 3)
 *   8. Update original entry: set reverted_at
 *   9. revalidatePath
 *
 * @param activityId — UUID of the activity_entries row to revert
 */
export async function revertActivity(activityId: string): Promise<RevertActivityResult> {
  const parsed = RevertActivitySchema.safeParse({ activityId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await requireUserId());
  } catch {
    return { error: "Not authenticated" };
  }

  try {
    await withUserRls(claims, async (tx) => {
      // 3. Fetch entry with ownership check (T-3-01-01)
      const [entry] = await tx
        .select()
        .from(activityEntries)
        .where(
          and(
            eq(activityEntries.id, activityId),
            eq(activityEntries.user_id, userId)
          )
        )
        .limit(1);

      if (!entry) {
        throw new Error("Activity entry not found or not owned by user");
      }

      // 4. Re-fetch shopify_updated_at fresh for product targets (T-3-01-05)
      let shopifyUpdatedAt: Date | null = null;
      if (entry.target_type === "product" && entry.target_id) {
        const [product] = await tx
          .select({ shopify_updated_at: shopifyProducts.shopify_updated_at })
          .from(shopifyProducts)
          .where(
            and(
              eq(shopifyProducts.user_id, userId),
              eq(shopifyProducts.product_gid, entry.target_id)
            )
          )
          .limit(1);
        shopifyUpdatedAt = product?.shopify_updated_at ?? null;
      }

      // 5. Server-side canRevert() enforcement (T-3-01-05 — never trust UI state)
      const entryForCanRevert = {
        ...entry,
        before_state: entry.before_state as Record<string, unknown> | null,
      };
      const check = canRevert(entryForCanRevert, shopifyUpdatedAt);
      if (!check.allowed) {
        throw new Error(REVERT_REASON_LABELS[check.reason!]);
      }

      // 6. Observability-first: write revert_* entry BEFORE external effect (WF-06).
      // CR-01: write on the SAME RLS tx handle so the log row shares the
      // commit/rollback boundary — if the external effect or the reverted_at
      // update below throws, both roll back together (D-08 atomicity).
      await writeActivityTx(tx, userId, {
        workflow_run_id: entry.workflow_run_id ?? null,
        step_id: `revert:${activityId}`,
        action_type: `revert_${entry.action_type}`,
        summary: `Reverted: ${entry.action_summary}`,
        result: "success",
        automation_level: (entry.automation_level as "L1" | "L2" | "L3" | undefined) ?? undefined,
        workflow_id: entry.workflow_id ?? undefined,
        thread_id: entry.thread_id ?? undefined,
        target_type: entry.target_type ?? undefined,
        target_id: entry.target_id ?? undefined,
        is_revertable: false, // revert entries cannot be re-reverted (Pitfall 5)
      });

      // 7. Execute external reversal (stub in Phase 3; wired in Phase 4)
      await executeRevertEffect(
        {
          action_type: entry.action_type,
          target_type: entry.target_type ?? null,
          target_id: entry.target_id ?? null,
          before_state: entry.before_state as Record<string, unknown> | null,
        },
        userId
      );

      // 8. Mark original entry as reverted
      await tx
        .update(activityEntries)
        .set({ reverted_at: new Date() })
        .where(eq(activityEntries.id, activityId));
    });

    revalidatePath("/app/activity");
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
}

// ─── bulkRevertActivity ───────────────────────────────────────────────────────

export type BulkRevertActivityResult =
  | { reverted: string[]; blocked: Array<{ id: string; reason: string }> }
  | { error: string };

/**
 * bulkRevertActivity — classify or atomically revert multiple activity entries.
 *
 * D-08: bulk revert is atomic (all-or-none). The confirmation modal calls
 * dryRun=true first to get the revertable/blocked split, then the user
 * confirms, then calls with dryRun=false to execute.
 *
 * Security (T-3-01-01): filter all IDs by user_id — cross-user IDs silently
 * excluded (same pattern as Phase 2 approval ownership pattern).
 *
 * @param activityIds — array of activity_entries UUIDs to revert
 * @param dryRun      — true: classify without writing; false: execute atomic revert
 */
export async function bulkRevertActivity(
  activityIds: string[],
  dryRun: boolean
): Promise<BulkRevertActivityResult> {
  const parsed = BulkRevertActivitySchema.safeParse({ activityIds, dryRun });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await requireUserId());
  } catch {
    return { error: "Not authenticated" };
  }

  try {
    const result = await withUserRls(claims, async (tx) => {
      // Phase 1: classify all entries (no writes)
      // Filter by user_id — cross-user IDs silently excluded (T-3-01-01)
      const entries = await tx
        .select()
        .from(activityEntries)
        .where(
          and(
            inArray(activityEntries.id, activityIds),
            eq(activityEntries.user_id, userId)
          )
        );

      // Pre-fetch shopify_updated_at for all product targets in one query
      const productTargetIds = entries
        .filter((e: typeof entries[0]) => e.target_type === "product" && e.target_id)
        .map((e: typeof entries[0]) => e.target_id as string);

      const shopifyTimestamps =
        productTargetIds.length > 0
          ? await tx
              .select({
                product_gid: shopifyProducts.product_gid,
                updated: shopifyProducts.shopify_updated_at,
              })
              .from(shopifyProducts)
              .where(
                and(
                  eq(shopifyProducts.user_id, userId),
                  inArray(shopifyProducts.product_gid, productTargetIds)
                )
              )
          : [];

      const shopifyMap = new Map(
        shopifyTimestamps.map((r: { product_gid: string; updated: Date | null }) => [r.product_gid, r.updated])
      );

      const revertable: typeof entries = [];
      const blocked: Array<{ id: string; reason: string }> = [];

      for (const entry of entries) {
        const shopifyUpdatedAt =
          entry.target_type === "product"
            ? (shopifyMap.get(entry.target_id ?? "") ?? null)
            : null;

        const entryForCanRevert = {
          ...entry,
          before_state: entry.before_state as Record<string, unknown> | null,
        };
        const check = canRevert(entryForCanRevert, shopifyUpdatedAt);
        if (check.allowed) {
          revertable.push(entry);
        } else {
          blocked.push({
            id: entry.id,
            reason: REVERT_REASON_LABELS[check.reason!],
          });
        }
      }

      // dryRun: return classification without writing
      if (dryRun) {
        return {
          reverted: [] as string[],
          blocked,
        };
      }

      // Execute: atomically revert all revertable entries inside one transaction.
      // CR-01: the revert_* log write, the external effect, and the reverted_at
      // update all run on innerTx — a mid-batch failure rolls back the WHOLE
      // batch (no orphaned revert_* rows), honoring the D-08 all-or-none contract.
      await tx.transaction(async (innerTx: typeof tx) => {
        for (const entry of revertable) {
          // Observability-first: write revert entry BEFORE external effect (WF-06),
          // on the SAME innerTx handle so it shares the batch commit/rollback boundary.
          await writeActivityTx(innerTx, userId, {
            workflow_run_id: entry.workflow_run_id ?? null,
            step_id: `revert:${entry.id}`,
            action_type: `revert_${entry.action_type}`,
            summary: `Reverted: ${entry.action_summary}`,
            result: "success",
            automation_level: (entry.automation_level as "L1" | "L2" | "L3" | undefined) ?? undefined,
            workflow_id: entry.workflow_id ?? undefined,
            thread_id: entry.thread_id ?? undefined,
            target_type: entry.target_type ?? undefined,
            target_id: entry.target_id ?? undefined,
            is_revertable: false,
          });

          // External reversal (stub in Phase 3)
          await executeRevertEffect(
            {
              action_type: entry.action_type,
              target_type: entry.target_type ?? null,
              target_id: entry.target_id ?? null,
              before_state: entry.before_state as Record<string, unknown> | null,
            },
            userId
          );

          // Mark original as reverted
          await innerTx
            .update(activityEntries)
            .set({ reverted_at: new Date() })
            .where(eq(activityEntries.id, entry.id));
        }
      });

      return {
        reverted: revertable.map((e: typeof entries[0]) => e.id),
        blocked,
      };
    });

    revalidatePath("/app/activity");
    return result as BulkRevertActivityResult;
  } catch (err) {
    return { error: String(err) };
  }
}

// ─── saveAsWorkflow ───────────────────────────────────────────────────────────

export type SaveAsWorkflowResult =
  | { success: true; threadId: string }
  | { error: string };

/**
 * saveAsWorkflow — promote a one-off action into a workflow via a scoped chat thread.
 *
 * D-10: opens a scoped Conversation thread pre-loaded with the action's context.
 * The Orchestrator helps formalize it into a saved workflow.
 * No workflow row is created here — that happens when Sarah confirms in chat.
 *
 * @param activityId — the activity entry to promote
 * @returns { success: true; threadId } for client redirect to /app/chat/[threadId]
 */
export async function saveAsWorkflow(
  activityId: string
): Promise<SaveAsWorkflowResult> {
  const parsed = SaveAsWorkflowSchema.safeParse({ activityId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await requireUserId());
  } catch {
    return { error: "Not authenticated" };
  }

  try {
    const threadId = await withUserRls(claims, async (tx) => {
      // Fetch the activity entry to build context for the thread
      const [entry] = await tx
        .select({
          id: activityEntries.id,
          action_type: activityEntries.action_type,
          action_summary: activityEntries.action_summary,
          workflow_id: activityEntries.workflow_id,
        })
        .from(activityEntries)
        .where(
          and(
            eq(activityEntries.id, activityId),
            eq(activityEntries.user_id, userId)
          )
        )
        .limit(1);

      if (!entry) {
        throw new Error("Activity entry not found or not owned by user");
      }

      // Create a scoped conversation thread pre-loaded with the action's context (D-10)
      const title = `Save as workflow: ${entry.action_summary.slice(0, 80)}`;
      const [thread] = await tx
        .insert(threads)
        .values({
          user_id: userId,
          title,
          agent_context: "orchestrator",
          // context_workflow_id links back if the action was from a workflow
          context_workflow_id: entry.workflow_id ?? null,
          last_message_at: new Date(),
        })
        .returning({ id: threads.id });

      if (!thread) {
        throw new Error("saveAsWorkflow: thread insert returned no rows");
      }

      return thread.id;
    });

    return { success: true, threadId };
  } catch (err) {
    return { error: String(err) };
  }
}
