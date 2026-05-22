/**
 * lib/workflows/approvals.ts
 * Approval row creation and resolution helpers.
 *
 * createApproval — inserts an approvals row (status='pending', expires_at=now+14d)
 *                  and returns its UUID for use in step.waitForEvent.
 * resolveApprovalRow — updates the row on approve/reject with an ownership check.
 *
 * SECURITY:
 *   - Uses serviceDb (service role, bypasses RLS) — every call MUST pass userId
 *     explicitly (T-2-07-04).
 *   - resolveApprovalRow verifies ownership BEFORE updating (T-2-07-02):
 *     it looks up the row by (id + user_id) and returns null if not found.
 *   - Ownership check here protects both the Server Action path (Task 3) and
 *     any direct engine path that calls resolveApprovalRow.
 *
 * Server-only module.
 */

import { serviceDb } from "@/lib/db/client";
import { approvals } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CreateApprovalInput {
  /** FK to workflow_runs(id) */
  workflow_run_id: string;
  /** The step identifier this approval belongs to */
  step_id: string;
  /** Action type (matches tool name, e.g., 'product_update') */
  action_type: string;
  /** One-line summary shown to user */
  action_summary: string;
  /** Risk level: 'low' | 'med' | 'high' */
  stakes: "low" | "med" | "high";
  /** Structured preview of the proposed action */
  preview: unknown;
  /** Agent's reasoning shown to user */
  reasoning_summary: string;
  /** Full proposed action JSONB to execute on approve */
  proposed_action: unknown;
  /** FK to threads(id) — optional */
  thread_id?: string;
  /** FK to messages(id) — optional */
  message_id?: string;
  /** Full reasoning chain JSONB — optional */
  reasoning_chain?: unknown;
  /** Downstream impact — optional */
  downstream_impact?: string;
  /** Estimated review time in seconds — optional */
  estimated_review_seconds?: number;
}

// ─── createApproval ───────────────────────────────────────────────────────────

/**
 * createApproval — insert an approval row and return its id.
 *
 * Sets:
 *   status = 'pending'
 *   expires_at = now + 14 days
 *   inngest_event_key = 'approval.resolved.<workflowRunId>.step.<stepId>'
 *
 * @param userId — authenticated user UUID
 * @param input  — approval fields
 * @returns the new approval row's UUID
 */
export async function createApproval(
  userId: string,
  input: CreateApprovalInput
): Promise<string> {
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const inngestEventKey = `approval.resolved.${input.workflow_run_id}.step.${input.step_id}`;

  const [row] = await serviceDb
    .insert(approvals)
    .values({
      user_id: userId,
      workflow_run_id: input.workflow_run_id,
      thread_id: input.thread_id ?? null,
      message_id: input.message_id ?? null,
      status: "pending",
      action_type: input.action_type,
      action_summary: input.action_summary,
      stakes: input.stakes,
      preview: input.preview as Record<string, unknown>,
      reasoning_summary: input.reasoning_summary,
      reasoning_chain: (input.reasoning_chain ?? null) as Record<string, unknown> | null,
      downstream_impact: input.downstream_impact ?? null,
      estimated_review_seconds: input.estimated_review_seconds ?? null,
      proposed_action: input.proposed_action as Record<string, unknown>,
      inngest_event_key: inngestEventKey,
      expires_at: expiresAt,
    })
    .returning();

  if (!row) {
    throw new Error("createApproval: insert returned no rows");
  }

  return row.id;
}

// ─── resolveApprovalRow ───────────────────────────────────────────────────────

/**
 * resolveApprovalRow — update an approval row on approve/reject.
 *
 * Performs an ownership check by looking up the row by (id + user_id).
 * Returns null if the row doesn't exist or the user doesn't own it (T-2-07-02).
 *
 * @param approvalId — the approval row UUID
 * @param userId     — the user who is resolving (must own the row)
 * @param decision   — 'approved' | 'rejected'
 * @param path       — 'inline' | 'inbox' (which surface resolved it)
 * @param rejectReason — optional rejection reason
 * @returns the approval id on success, null on ownership failure
 */
export async function resolveApprovalRow(
  approvalId: string,
  userId: string,
  decision: "approved" | "rejected",
  path?: "inline" | "inbox",
  rejectReason?: string
): Promise<string | null> {
  // Ownership check: look up the row by id + user_id
  const [existing] = await serviceDb
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)))
    .limit(1);

  if (!existing) {
    // Row not found or user doesn't own it
    return null;
  }

  // Update the row
  await serviceDb
    .update(approvals)
    .set({
      status: decision,
      resolved_at: new Date(),
      resolved_by_path: path ?? null,
      reject_reason: rejectReason ?? null,
    })
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)));

  return approvalId;
}

// ─── snoozeApproval ───────────────────────────────────────────────────────────

/**
 * snoozeApproval — set an approval to snoozed status with a future wake time.
 *
 * Ownership check: looks up row by (id + user_id), returns null on failure.
 * Does NOT fire approval.resolved — the Inngest workflow run stays paused (A1).
 *
 * @param approvalId   — the approval row UUID
 * @param userId       — the user who is snoozing (must own the row)
 * @param snoozedUntil — the Date when the item should re-surface
 * @returns the approval id on success, null on ownership failure
 */
export async function snoozeApproval(
  approvalId: string,
  userId: string,
  snoozedUntil: Date
): Promise<string | null> {
  // Ownership check — same pattern as resolveApprovalRow
  const [existing] = await serviceDb
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)))
    .limit(1);

  if (!existing) {
    return null;
  }

  await serviceDb
    .update(approvals)
    .set({ status: "snoozed", snoozed_until: snoozedUntil })
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)));

  return approvalId;
}

// ─── bulkResolveApprovals ─────────────────────────────────────────────────────

/**
 * bulkResolveApprovals — atomically approve or reject multiple pending approvals.
 *
 * Only updates rows where:
 *   - id is in approvalIds
 *   - user_id matches (ownership)
 *   - status = 'pending' (T-4-02-05: non-pending rows silently skipped)
 *
 * @param approvalIds — array of approval UUIDs (max 100)
 * @param userId      — the user who is resolving (must own all rows)
 * @param decision    — 'approved' | 'rejected'
 * @returns array of IDs that were actually updated
 */
export async function bulkResolveApprovals(
  approvalIds: string[],
  userId: string,
  decision: "approved" | "rejected"
): Promise<string[]> {
  if (approvalIds.length === 0) return [];

  // Fetch only rows that are pending + owned by this user
  const pendingRows = await serviceDb
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(
        inArray(approvals.id, approvalIds),
        eq(approvals.user_id, userId),
        eq(approvals.status, "pending")
      )
    );

  if (pendingRows.length === 0) return [];

  const eligibleIds = pendingRows.map((r) => r.id);

  // Atomic bulk update — only eligible rows (pending + owned)
  await serviceDb
    .update(approvals)
    .set({
      status: decision,
      resolved_at: new Date(),
    })
    .where(
      and(
        inArray(approvals.id, eligibleIds),
        eq(approvals.user_id, userId),
        eq(approvals.status, "pending") // belt-and-suspenders: re-filter in UPDATE too
      )
    );

  return eligibleIds;
}
