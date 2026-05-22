/**
 * lib/workflows/activity.ts
 * Idempotent activity-entry writer.
 *
 * Writes an activity_entries row via serviceDb BEFORE any external effect
 * (WF-06 + CLAUDE.md observability constraint). Idempotency is enforced via
 * the unique(workflow_run_id, step_id) constraint (ON CONFLICT DO NOTHING),
 * so Inngest retries cannot produce duplicate rows.
 *
 * SECURITY:
 *   - Uses serviceDb (service role, bypasses RLS) — EVERY call MUST pass user_id
 *     explicitly (T-2-07-05).
 *   - Server-only module.
 *
 * CONTRACT:
 *   Callers MUST call writeActivity() BEFORE the external Shopify/Gmail API call.
 *   This is the "observability-first" invariant (WF-06). If the external call fails
 *   and Inngest retries, the second writeActivity() call is a no-op (idempotent).
 */

import { serviceDb } from "@/lib/db/client";
import { activityEntries } from "@/lib/db/schema";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WriteActivityInput {
  /**
   * FK to workflow_runs(id) — nullable.
   * Pass null for direct-chat/tool-layer actions that have no workflow run.
   * The idempotency constraint is on (workflow_run_id, step_id) WHERE both
   * are non-null; when workflow_run_id is null the entry is still written
   * (no dedup) which is correct for one-shot chat-originated tool calls.
   */
  workflow_run_id: string | null;
  /** Step identifier within the run — required for idempotency constraint */
  step_id: string;
  /** Action type (e.g., 'product_update', 'inventory_update', 'send_email_reply') */
  action_type: string;
  /** One-line human-readable summary */
  summary: string;
  /** Outcome: 'success' | 'partial' | 'failed' */
  result: "success" | "partial" | "failed";
  /** Automation level when action was taken */
  automation_level?: "L1" | "L2" | "L3";
  /** Pre-action state snapshot (optional) */
  before_state?: unknown;
  /** Post-action state snapshot (optional, may be filled in after effect) */
  after_state?: unknown;
  /** FK to workflows(id) — optional */
  workflow_id?: string;
  /** FK to threads(id) — optional */
  thread_id?: string;
  /** Type of target entity ('product' | 'order' | 'email' | etc.) */
  target_type?: string;
  /** Identifier of the target entity */
  target_id?: string;
  /** Whether the action can be reverted (default: true) */
  is_revertable?: boolean;
  /** Failure reason or partial counts */
  result_details?: string;
  /** Agent context ('orchestrator' | 'catalog' | 'seo' | 'qa' | 'inventory') */
  agent_context?: string;
}

// ─── writeActivity ────────────────────────────────────────────────────────────

/**
 * writeActivity — idempotent activity-entry writer.
 *
 * Inserts a row into activity_entries via serviceDb with explicit user_id.
 * ON CONFLICT DO NOTHING on the unique(workflow_run_id, step_id) constraint
 * ensures that Inngest retries do not produce duplicate rows.
 *
 * MUST be called BEFORE the external effect (Shopify/Gmail API call).
 * after_state can be set later by updating the row after the effect completes.
 *
 * @param userId — authenticated user UUID (explicit, never inferred from RLS)
 * @param input  — activity entry fields
 */
export async function writeActivity(
  userId: string,
  input: WriteActivityInput
): Promise<void> {
  await buildActivityInsert(serviceDb, userId, input);
}

/**
 * Drizzle handle that exposes the .insert() builder used by buildActivityInsert.
 * Both serviceDb and an RLS transaction handle (from withUserRls) satisfy this.
 */
type ActivityInsertDb = Pick<typeof serviceDb, "insert">;

/**
 * buildActivityInsert — shared insert builder for writeActivity / writeActivityTx.
 * Keeps the column mapping + ON CONFLICT DO NOTHING idempotency in one place so
 * the service-role and RLS-transaction paths can never drift.
 */
async function buildActivityInsert(
  db: ActivityInsertDb,
  userId: string,
  input: WriteActivityInput
): Promise<void> {
  await db
    .insert(activityEntries)
    .values({
      user_id: userId,
      workflow_run_id: input.workflow_run_id,
      workflow_id: input.workflow_id ?? null,
      thread_id: input.thread_id ?? null,
      action_type: input.action_type,
      action_summary: input.summary,
      result: input.result,
      result_details: input.result_details ?? null,
      automation_level: input.automation_level ?? null,
      before_state: (input.before_state ?? null) as Record<string, unknown> | null,
      after_state: (input.after_state ?? null) as Record<string, unknown> | null,
      step_id: input.step_id,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      is_revertable: input.is_revertable ?? true,
      agent_context: input.agent_context ?? null,
    })
    .onConflictDoNothing();
}

/**
 * writeActivityTx — RLS-transaction variant of writeActivity (CR-01).
 *
 * Inserts the activity row on the SAME transaction handle passed by the caller
 * (the RLS tx from withUserRls) so the write shares the commit/rollback
 * boundary of the surrounding transaction. This is required for the D-08
 * "atomic all-or-none" revert guarantee: the revert_* log row and the
 * reverted_at update must commit or roll back together.
 *
 * Unlike writeActivity (which uses serviceDb and auto-commits independently),
 * this does NOT bypass RLS — the caller's tx already has RLS enforced and the
 * row's user_id is checked against the policy. Callers MUST still pass an
 * explicit user_id matching the authenticated subject.
 *
 * @param tx     — RLS-scoped Drizzle transaction handle (from withUserRls)
 * @param userId — authenticated user UUID (must match RLS subject)
 * @param input  — activity entry fields
 */
export async function writeActivityTx(
  tx: ActivityInsertDb,
  userId: string,
  input: WriteActivityInput
): Promise<void> {
  await buildActivityInsert(tx, userId, input);
}
