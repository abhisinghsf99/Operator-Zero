/**
 * tests/unit/l2-approval-flow.test.ts
 * Wave-0 scaffold — WF-04: L2 pause creates approval row + waitForEvent/resume
 *
 * Tests the L2 approval pause/resume mechanism using the Inngest test SDK —
 * the critical pause/resume flow via step.waitForEvent.
 *
 * Requirement: WF-04 — L2 pauses at boundary, creates approval, resumes on approve/reject
 */
import { describe, it, expect } from "vitest";

describe("WF-04 — L2 pause creates approval row + waitForEvent/resume", () => {
  it.todo("L2 step creates approvals row with status='pending' before pausing");

  it.todo("L2 step sets workflow_run status to 'paused_for_approval' after creating approval");

  it.todo("function pauses via step.waitForEvent('approval.resolved', ...) after creating approval row");

  it.todo("approval row expires_at is now() + 14 days");

  it.todo("inngest_event_key is set on approval row for correlation");

  it.todo("step.waitForEvent resumes on 'approval.resolved' event matching approvalId");

  it.todo("approved decision proceeds to execute the proposed action");

  it.todo("rejected decision sets workflow_run status to 'failed' and approval status to 'rejected'");

  it.todo("timeout (null decision) expires workflow gracefully without throwing");

  it.todo("approval send event fires from Server Action approveItem");

  it.todo("Server Action verifies approval ownership before firing resume event");
});
