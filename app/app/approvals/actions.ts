"use server";

/**
 * app/app/approvals/actions.ts
 * Server Actions for L2 approval resolution.
 *
 * approveItem(approvalId, path) — resolves the approval row as 'approved' and
 *   fires inngest.send({ name: 'approval.resolved', data: { approvalId, decision: 'approved' } })
 *   to resume the paused Inngest workflow run.
 *
 * rejectItem(approvalId, reason?) — resolves as 'rejected' and fires
 *   approval.resolved with decision: 'rejected'.
 *
 * SECURITY:
 *   - Zod-validates inputs (T-2-07-02)
 *   - getClaims() verifies the session (T-2-07-02 — event alone does not bypass auth)
 *   - resolveApprovalRow() re-checks ownership by (id + user_id) before updating
 *   - The approval.resolved event + the re-lookup together prevent event spoofing
 *
 * THREAT MODEL:
 *   T-2-07-02 (forged approval.resolved event): ownership re-checked in resolveApprovalRow
 *   before firing the Inngest resume event. The event alone cannot bypass DB auth.
 */

import { z } from "zod";
import { createClient } from "@/lib/auth/server";
import { inngest } from "@/lib/inngest/client";
import { resolveApprovalRow } from "@/lib/workflows/approvals";
import { revalidatePath } from "next/cache";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ApproveSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID"),
  path: z.enum(["inline", "inbox"]),
});

const RejectSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID"),
  reason: z.string().max(500).optional(),
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

  // 4. Fire Inngest resume event — resumes the paused workflow run with rejection
  await inngest.send({
    name: "approval.resolved",
    data: { approvalId, decision: "rejected" },
  });

  // 5. Revalidate
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");

  return { success: true };
}
