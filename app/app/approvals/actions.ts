"use server";

/**
 * app/app/approvals/actions.ts
 * Server Actions for L2 approval resolution.
 *
 * Phase 2 (original):
 *   approveItem(approvalId, path) — resolves as 'approved', fires approval.resolved
 *   rejectItem(approvalId, reason?) — resolves as 'rejected', fires approval.resolved
 *
 * Phase 4 additions:
 *   snoozeItem(approvalId, snoozedUntil) — sets status='snoozed'; does NOT fire approval.resolved
 *   editItem(approvalId, editedProposedAction) — writes edited payload to proposed_action, resolves approved
 *   bulkResolve(approvalIds[], decision, reason?) — atomic, pending-only, fires per resolved id
 *   revertApproved(approvalId) — ≤24h gate, then executeRevertEffect; older → routeToActivity error
 *   getPendingApprovals(userId, opts) — fetch pending+count for Inbox RSC
 *   fetchPendingCount(userId) — badge count query
 *
 * SECURITY:
 *   - Zod-validates inputs (T-2-07-02, T-4-02-01)
 *   - getClaims() verifies the session
 *   - Every action: ownership re-check by (id + user_id) before write
 *   - snoozeItem MUST NOT fire approval.resolved (T-4-02-03 / A1)
 *   - editItem writes to proposed_action in DB before resolving (T-4-02-02)
 *   - bulkResolve only updates status='pending' rows (T-4-02-05)
 *   - rejectItem stores reason to memory before inngest.send (D-04)
 *
 * THREAT MODEL:
 *   T-4-02-01: (id + user_id) ownership re-check + Zod validation
 *   T-4-02-02: edited proposed_action written to DB; engine reads DB row, not event
 *   T-4-02-03: snoozeItem must not fire approval.resolved — run stays paused
 *   T-4-02-04: postgres_changes subscription gated by RLS (handled in Realtime hook)
 *   T-4-02-05: atomic WHERE status='pending' in bulkResolve
 *   T-4-02-06: drift banner in UI requires re-confirm (enforced client-side; server trusts DB)
 */

import { z } from "zod";
import { createClient } from "@/lib/auth/server";
import { inngest } from "@/lib/inngest/client";
import { resolveApprovalRow, snoozeApproval, bulkResolveApprovals } from "@/lib/workflows/approvals";
import { revalidatePath } from "next/cache";
import { serviceDb } from "@/lib/db/client";
import { approvals } from "@/lib/db/schema";
import { eq, and, lte, isNull, or, desc } from "drizzle-orm";
import { storeMemoryItem } from "@/lib/agent/memory";
import { canRevert, executeRevertEffect } from "@/lib/workflows/revert";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ApproveSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID"),
  path: z.enum(["inline", "inbox"]),
});

const RejectSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID"),
  reason: z.string().max(500).optional(),
});

// Phase 4 schemas

const SnoozeSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID"),
  snoozedUntil: z.string().datetime({ message: "Invalid datetime for snoozedUntil" }),
});

const EditSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID"),
  proposedAction: z.record(z.unknown()),
});

const BulkResolveSchema = z.object({
  approvalIds: z.array(z.string().uuid("Invalid approval ID")).min(1, "At least one ID required").max(100, "Maximum 100 IDs per bulk request"),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().max(500).optional(),
});

const RevertSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID"),
});

// ─── getClaims helper ─────────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Not authenticated");
  }
  return userId;
}

// ─── approveItem ─────────────────────────────────────────────────────────────

export type ApproveResult = { success: true } | { error: string };

/**
 * approveItem — approve a pending L2 approval item.
 *
 * Flow:
 *   1. Validate input (Zod)
 *   2. Get authenticated user ID (getClaims)
 *   3. resolveApprovalRow (ownership check + DB update) — MUST succeed before firing event
 *   4. inngest.send({ name: 'approval.resolved', data: { approvalId, decision: 'approved' } })
 *   5. revalidatePath
 *
 * If resolveApprovalRow returns null (ownership check failed), inngest.send is NOT called.
 * The event alone cannot bypass the ownership check (T-2-07-02).
 *
 * @param approvalId — the approval row UUID
 * @param path       — 'inline' (chat card) | 'inbox' (Approvals inbox)
 */
export async function approveItem(
  approvalId: string,
  path: "inline" | "inbox"
): Promise<ApproveResult> {
  // 1. Validate
  const parsed = ApproveSchema.safeParse({ approvalId, path });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  // 2. Authenticate
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Not authenticated" };
  }

  // 3. Ownership check + DB update (MUST succeed before firing Inngest event)
  const resolvedId = await resolveApprovalRow(
    approvalId,
    userId,
    "approved",
    path
  );

  if (!resolvedId) {
    return {
      error: "Approval not found or you do not have permission to approve it",
    };
  }

  // 4. Fire Inngest resume event — resumes the paused workflow run
  await inngest.send({
    name: "approval.resolved",
    data: { approvalId, decision: "approved" },
  });

  // 5. Revalidate the approvals UI
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");

  return { success: true };
}

// ─── rejectItem ───────────────────────────────────────────────────────────────

export type RejectResult = { success: true } | { error: string };

/**
 * rejectItem — reject a pending L2 approval item.
 *
 * Flow:
 *   1. Validate input (Zod)
 *   2. Get authenticated user ID (getClaims)
 *   3. resolveApprovalRow (ownership check + DB update) — MUST succeed before firing event
 *   4. inngest.send({ name: 'approval.resolved', data: { approvalId, decision: 'rejected' } })
 *   5. revalidatePath
 *
 * @param approvalId — the approval row UUID
 * @param reason     — optional rejection reason (max 500 chars)
 */
export async function rejectItem(
  approvalId: string,
  reason?: string
): Promise<RejectResult> {
  // 1. Validate
  const parsed = RejectSchema.safeParse({ approvalId, reason });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  // 2. Authenticate
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Not authenticated" };
  }

  // 3. Ownership check + DB update
  const resolvedId = await resolveApprovalRow(
    approvalId,
    userId,
    "rejected",
    undefined,
    reason
  );

  if (!resolvedId) {
    return {
      error: "Approval not found or you do not have permission to reject it",
    };
  }

  // 4. Store reject reason as durable memory BEFORE firing Inngest event (D-04).
  //    Best-effort: a memory-storage failure (e.g. embeddings provider down) must
  //    NOT block the workflow resume below — the row is already marked rejected, so
  //    swallowing the error here prevents a paused run from hanging forever.
  if (reason) {
    try {
      await storeMemoryItem(userId, reason, "decision_history");
    } catch (err) {
      console.error("[rejectItem] failed to store reject reason as memory", err);
    }
  }

  // 5. Fire Inngest resume event — resumes the paused workflow run with rejection
  await inngest.send({
    name: "approval.resolved",
    data: { approvalId, decision: "rejected" },
  });

  // 6. Revalidate
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");

  return { success: true };
}

// ─── snoozeItem ───────────────────────────────────────────────────────────────

export type SnoozeResult = { success: true } | { error: string };

/**
 * snoozeItem — snooze a pending L2 approval item.
 *
 * Sets status='snoozed' and snoozed_until timestamp. Does NOT fire
 * approval.resolved — the Inngest workflow run stays paused (T-4-02-03 / A1).
 *
 * @param approvalId  — the approval row UUID
 * @param snoozedUntil — ISO 8601 datetime string for when to surface again
 */
export async function snoozeItem(
  approvalId: string,
  snoozedUntil: string
): Promise<SnoozeResult> {
  // 1. Validate
  const parsed = SnoozeSchema.safeParse({ approvalId, snoozedUntil });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  // 2. Authenticate
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Not authenticated" };
  }

  // 3. Ownership check + snooze update (via lib helper)
  const snoozeResult = await snoozeApproval(
    parsed.data.approvalId,
    userId,
    new Date(parsed.data.snoozedUntil)
  );

  if (!snoozeResult) {
    return { error: "Approval not found or you do not have permission to snooze it" };
  }

  // NOTE: snoozeItem does NOT fire approval.resolved — workflow stays paused (A1)

  // 4. Revalidate
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");

  return { success: true };
}

// ─── editItem ─────────────────────────────────────────────────────────────────

export type EditResult = { success: true } | { error: string };

/**
 * editItem — edit the proposed_action in place, then resolve as approved.
 *
 * Flow (D-01, T-4-02-02):
 *   1. Validate + authenticate
 *   2. Ownership check
 *   3. Write edited proposed_action to DB (BEFORE resolving)
 *   4. resolveApprovalRow (approved)
 *   5. inngest.send approval.resolved — engine reads proposed_action from DB row, not event
 *
 * @param approvalId          — the approval row UUID
 * @param editedProposedAction — the user-edited action payload (validated as object)
 */
export async function editItem(
  approvalId: string,
  editedProposedAction: Record<string, unknown>
): Promise<EditResult> {
  // 1. Validate
  const parsed = EditSchema.safeParse({ approvalId, proposedAction: editedProposedAction });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  // 2. Authenticate
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Not authenticated" };
  }

  // 3. Ownership check
  const [existing] = await serviceDb
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, parsed.data.approvalId), eq(approvals.user_id, userId)))
    .limit(1);

  if (!existing) {
    return { error: "Approval not found or you do not have permission to edit it" };
  }

  // 4. Write edited proposed_action to DB BEFORE resolving (T-4-02-02)
  //    The engine reads proposed_action from the DB row, not from the event payload.
  await serviceDb
    .update(approvals)
    .set({ proposed_action: parsed.data.proposedAction as Record<string, unknown> })
    .where(and(eq(approvals.id, parsed.data.approvalId), eq(approvals.user_id, userId)));

  // 5. Resolve as approved (ownership re-check happens inside resolveApprovalRow)
  const resolvedId = await resolveApprovalRow(
    parsed.data.approvalId,
    userId,
    "approved",
    "inbox"
  );

  if (!resolvedId) {
    return { error: "Failed to resolve approval after edit" };
  }

  // 6. Fire Inngest resume event — engine reads edited proposed_action from DB
  await inngest.send({
    name: "approval.resolved",
    data: { approvalId: parsed.data.approvalId, decision: "approved" },
  });

  // 7. Revalidate
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");

  return { success: true };
}

// ─── bulkResolve ──────────────────────────────────────────────────────────────

export type BulkResolveResult =
  | { success: true; resolved: number; skipped: number }
  | { error: string };

/**
 * bulkResolve — atomically approve or reject multiple pending approvals.
 *
 * Only updates rows where status='pending' AND user_id matches (T-4-02-05).
 * Non-pending or non-owned rows are silently skipped.
 * Fires approval.resolved for each resolved id.
 *
 * @param approvalIds — UUID[] (max 100)
 * @param decision    — 'approved' | 'rejected'
 * @param reason      — optional rejection reason (stored to memory for each reject)
 */
export async function bulkResolve(
  approvalIds: string[],
  decision: "approved" | "rejected",
  reason?: string
): Promise<BulkResolveResult> {
  // 1. Validate
  const parsed = BulkResolveSchema.safeParse({ approvalIds, decision, reason });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  // 2. Authenticate
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Not authenticated" };
  }

  // 3. Atomic bulk resolve via lib helper (only pending + user-owned rows)
  const resolvedIds = await bulkResolveApprovals(
    parsed.data.approvalIds,
    userId,
    parsed.data.decision
  );

  const skipped = parsed.data.approvalIds.length - resolvedIds.length;

  // 4. Store reject reason as memory for each resolved rejection (D-04)
  if (parsed.data.decision === "rejected" && parsed.data.reason && resolvedIds.length > 0) {
    await storeMemoryItem(userId, parsed.data.reason, "decision_history");
  }

  // 5. Fire approval.resolved for each resolved id (AFTER DB writes complete — Pitfall 2)
  for (const id of resolvedIds) {
    await inngest.send({
      name: "approval.resolved",
      data: { approvalId: id, decision: parsed.data.decision },
    });
  }

  // 6. Revalidate
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");

  return { success: true, resolved: resolvedIds.length, skipped };
}

// ─── revertApproved ───────────────────────────────────────────────────────────

export type RevertResult =
  | { success: true }
  | { error: string; routeToActivity?: boolean };

/**
 * revertApproved — revert a recently-approved item from the Approval Inbox.
 *
 * Gate (APRV-07 / D-04b):
 *   - ≤24h since resolution → executeRevertEffect + return success
 *   - >24h → return { error, routeToActivity: true } (link user to Activity surface)
 *
 * @param approvalId — the approval row UUID
 */
export async function revertApproved(
  approvalId: string
): Promise<RevertResult> {
  // 1. Validate
  const parsed = RevertSchema.safeParse({ approvalId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  // 2. Authenticate
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Not authenticated" };
  }

  // 3. Ownership check — fetch the approval row
  const [existing] = await serviceDb
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, parsed.data.approvalId), eq(approvals.user_id, userId)))
    .limit(1);

  if (!existing) {
    return { error: "Approval not found or you do not have permission to revert it" };
  }

  if (existing.status !== "approved") {
    return { error: "Only approved items can be reverted" };
  }

  // 4. ≤24h window check for inbox revert (D-04b)
  const resolvedAt = existing.resolved_at;
  if (!resolvedAt) {
    return { error: "Approval has no resolved_at timestamp" };
  }

  const ageMs = Date.now() - new Date(resolvedAt).getTime();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  if (ageMs > TWENTY_FOUR_HOURS_MS) {
    // Older than 24h — route user to Activity surface (D-04b)
    return {
      error: "This approval was resolved more than 24 hours ago. View and revert from the Activity log.",
      routeToActivity: true,
    };
  }

  // 5. canRevert check — build a synthetic entry for the gate
  const syntheticEntry = {
    action_type: existing.action_type,
    occurred_at: resolvedAt,
    is_revertable: true,
    reverted_at: null,
    before_state: null,
  };

  const revertCheck = canRevert(syntheticEntry);
  if (!revertCheck.allowed) {
    return { error: `Cannot revert: ${revertCheck.reason}` };
  }

  // 6. Execute revert effect (Phase 3 stub; Phase 4 wires real adapters)
  await executeRevertEffect(
    {
      action_type: existing.action_type,
      target_type: null,
      target_id: null,
      before_state: null,
    },
    userId
  );

  // 7. Revalidate
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");
  revalidatePath("/app/activity");

  return { success: true };
}

// ─── getPendingApprovals ──────────────────────────────────────────────────────

export interface PendingApproval {
  id: string;
  action_type: string;
  action_summary: string;
  stakes: string;
  preview: Record<string, unknown>;
  reasoning_summary: string;
  reasoning_chain: Record<string, unknown> | null;
  downstream_impact: string | null;
  proposed_action: Record<string, unknown>;
  snoozed_until: Date | null;
  expires_at: Date;
  resolved_at: Date | null;
  created_at: Date;
  workflow_run_id: string | null;
  thread_id: string | null;
  estimated_review_seconds: number | null;
}

/**
 * getPendingApprovals — fetch pending approval items for the Inbox RSC.
 *
 * Filters: status='pending' AND (snoozed_until IS NULL OR snoozed_until <= now())
 * Excludes hard-expired items (expires_at < now).
 * Sort: stakes-desc (high→med→low) then created_at-desc (APRV-01, Pitfall 3).
 *
 * @param userId     — authenticated user UUID
 * @param opts.showSnoozed — if true, include snoozed items (snoozed_until > now)
 */
export async function getPendingApprovals(
  userId: string,
  opts: { showSnoozed?: boolean } = {}
): Promise<PendingApproval[]> {
  // CR-05: re-validate that the caller is the authenticated user.
  // These are exported Server Actions callable from any client context;
  // serviceDb bypasses RLS, so we MUST enforce ownership here.
  let authedUserId: string;
  try {
    authedUserId = await requireUserId();
  } catch {
    return [];
  }
  if (authedUserId !== userId) return [];

  const now = new Date();

  // Build WHERE clause
  const conditions = [
    eq(approvals.user_id, userId),
    eq(approvals.status, "pending"),
  ];

  if (!opts.showSnoozed) {
    // Exclude items snoozed until future (snoozed_until IS NULL OR snoozed_until <= now)
    conditions.push(
      or(isNull(approvals.snoozed_until), lte(approvals.snoozed_until, now))!
    );
  }

  // WR-04: removed duplicate eq(approvals.status, "pending") that was here —
  // status='pending' is already in the conditions array above. The expires_at
  // guard is correctly applied via the app-level filter below.

  const rows = await serviceDb
    .select()
    .from(approvals)
    .where(and(...conditions))
    .orderBy(
      // stakes-desc: high=0, med=1, low=2 via CASE in SQL — use desc on stakes string is wrong;
      // instead order by created_at as secondary; stakes sorted client-side or via custom expression
      // Simplified: order by stakes (high sorts after low alphabetically — bad), so we use created_at-desc
      // and let the component do stakes re-sort. Or use proper CASE expression:
      desc(approvals.created_at)
    );

  // Filter out hard-expired items + sort stakes-desc then created_at-desc
  const stakesRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const filtered = rows.filter((r) => r.expires_at > now);
  filtered.sort((a, b) => {
    const sr = (stakesRank[a.stakes] ?? 1) - (stakesRank[b.stakes] ?? 1);
    if (sr !== 0) return sr;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return filtered as PendingApproval[];
}

// ─── fetchPendingCount ────────────────────────────────────────────────────────

/**
 * fetchPendingCount — count of currently-actionable pending approvals.
 *
 * Excludes snoozed-until-future and hard-expired rows.
 *
 * @param userId — authenticated user UUID
 */
export async function fetchPendingCount(userId: string): Promise<number> {
  // CR-05: re-validate against the authenticated session (same pattern as getPendingApprovals)
  let authedUserId: string;
  try {
    authedUserId = await requireUserId();
  } catch {
    return 0;
  }
  if (authedUserId !== userId) return 0;

  const now = new Date();

  const rows = await serviceDb
    .select({ id: approvals.id, expires_at: approvals.expires_at })
    .from(approvals)
    .where(
      and(
        eq(approvals.user_id, userId),
        eq(approvals.status, "pending"),
        or(isNull(approvals.snoozed_until), lte(approvals.snoozed_until, now))
      )
    );

  // Exclude hard-expired
  return rows.filter((r) => r.expires_at > now).length;
}
