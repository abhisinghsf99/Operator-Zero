/**
 * tests/unit/workflow-engine.test.ts
 * Wave-0 scaffold — WF-02 + WF-06: Inngest durable execution + Activity-before-effect
 *
 * Tests the Inngest workflow engine using the Inngest test SDK —
 * step checkpointing behavior and the critical WF-06 invariant
 * (activity_entry written BEFORE external effect).
 *
 * Requirements:
 *   WF-02 — Durable multi-step execution via Inngest; resume from checkpoint
 *   WF-06 — Every agent action writes Activity entry within 5s
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── WF-06: Activity writer (idempotent) unit tests ──────────────────────────

describe("WF-06 — writeActivity: idempotent activity writer", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("writeActivity inserts a row into activity_entries via serviceDb", async () => {
    // Mock serviceDb to capture inserts — Drizzle chains: insert(table).values({...}).onConflictDoNothing()
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue([{ id: "act-1" }]);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    vi.doMock("@/lib/db/client", () => ({
      serviceDb: { insert: mockInsert },
    }));
    vi.doMock("@/lib/db/schema", () => ({
      activityEntries: { name: "activity_entries" },
    }));

    const { writeActivity } = await import("@/lib/workflows/activity");

    await writeActivity("user-1", {
      workflow_run_id: "run-1",
      step_id: "step-0",
      action_type: "product_update",
      summary: "Updated product title",
      result: "success",
      automation_level: "L3",
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledOnce();
    expect(mockOnConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("writeActivity uses ON CONFLICT DO NOTHING on unique(workflow_run_id, step_id)", async () => {
    vi.resetModules();
    const mockOnConflict = vi.fn().mockResolvedValue([]);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    vi.doMock("@/lib/db/client", () => ({
      serviceDb: { insert: mockInsert },
    }));
    vi.doMock("@/lib/db/schema", () => ({
      activityEntries: { name: "activity_entries" },
    }));

    const { writeActivity } = await import("@/lib/workflows/activity");

    // Call twice with same run + step IDs
    await writeActivity("user-1", {
      workflow_run_id: "run-1",
      step_id: "step-0",
      action_type: "product_update",
      summary: "Updated product title",
      result: "success",
    });
    await writeActivity("user-1", {
      workflow_run_id: "run-1",
      step_id: "step-0",
      action_type: "product_update",
      summary: "Updated product title",
      result: "success",
    });

    // onConflictDoNothing called twice — DB handles dedup
    expect(mockOnConflict).toHaveBeenCalledTimes(2);
  });

  it("writeActivity includes user_id, workflow_run_id, step_id, action_type in inserted row", async () => {
    vi.resetModules();

    let capturedInsertInput: unknown = null;
    const mockServiceDb = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((vals) => {
          capturedInsertInput = vals;
          return { onConflictDoNothing: vi.fn().mockResolvedValue([]) };
        }),
      })),
    };

    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({
      activityEntries: { name: "activity_entries" },
    }));

    const { writeActivity } = await import("@/lib/workflows/activity");

    await writeActivity("user-abc", {
      workflow_run_id: "run-xyz",
      step_id: "step-1",
      action_type: "inventory_update",
      summary: "Updated inventory",
      result: "success",
      automation_level: "L2",
      before_state: { qty: 10 },
      after_state: { qty: 15 },
    });

    expect(capturedInsertInput).not.toBeNull();
    const vals = capturedInsertInput as Record<string, unknown>;
    expect(vals["user_id"]).toBe("user-abc");
    expect(vals["workflow_run_id"]).toBe("run-xyz");
    expect(vals["step_id"]).toBe("step-1");
    expect(vals["action_type"]).toBe("inventory_update");
    expect(vals["result"]).toBe("success");
  });
});

// ─── WF-06: createApproval (pending, 14d expiry) ─────────────────────────────

describe("WF-06 — createApproval: 14d expiry, pending status", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("createApproval inserts an approval row with status='pending'", async () => {
    let capturedInsertInput: unknown = null;
    const mockServiceDb = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((vals) => {
          capturedInsertInput = vals;
          return {
            returning: vi.fn().mockResolvedValue([{ id: "appr-1" }]),
          };
        }),
      })),
    };

    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({
      approvals: { name: "approvals" },
    }));

    const { createApproval } = await import("@/lib/workflows/approvals");

    const id = await createApproval("user-1", {
      workflow_run_id: "run-1",
      step_id: "step-0",
      action_type: "product_update",
      action_summary: "Update product SEO title",
      stakes: "low",
      preview: { items: 1 },
      reasoning_summary: "SEO improvement",
      proposed_action: { product_gid: "gid://shopify/Product/1", meta_title: "New title" },
    });

    expect(id).toBe("appr-1");
    const vals = capturedInsertInput as Record<string, unknown>;
    expect(vals["status"]).toBe("pending");
    expect(vals["user_id"]).toBe("user-1");
    expect(vals["workflow_run_id"]).toBe("run-1");
  });

  it("createApproval sets expires_at = now + 14 days", async () => {
    const now = new Date("2024-01-01T00:00:00Z");
    let capturedVals: unknown = null;
    const mockServiceDb = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((vals) => {
          capturedVals = vals;
          return {
            returning: vi.fn().mockResolvedValue([{ id: "appr-2" }]),
          };
        }),
      })),
    };

    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({
      approvals: { name: "approvals" },
    }));

    // Mock Date.now() to a fixed time
    vi.setSystemTime(now);

    const { createApproval } = await import("@/lib/workflows/approvals");

    await createApproval("user-1", {
      workflow_run_id: "run-1",
      step_id: "step-0",
      action_type: "product_update",
      action_summary: "Update SEO",
      stakes: "low",
      preview: {},
      reasoning_summary: "SEO",
      proposed_action: {},
    });

    const vals = capturedVals as Record<string, unknown>;
    const expiresAt = vals["expires_at"] as Date;
    const expectedExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(expiresAt.getTime()).toBe(expectedExpiry.getTime());

    vi.useRealTimers();
  });

  it("resolveApprovalRow performs ownership check (returns null if not owned)", async () => {
    const mockServiceDb = {
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no rows updated = not owned
        }),
      })),
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // no row found
          }),
        }),
      })),
    };

    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({
      approvals: { name: "approvals" },
    }));

    const { resolveApprovalRow } = await import("@/lib/workflows/approvals");

    // Should return null / throw because user doesn't own it
    const result = await resolveApprovalRow("appr-999", "wrong-user", "approved");
    expect(result).toBeNull();
  });

  it("resolveApprovalRow updates status + resolved_at + resolved_by_path for correct owner", async () => {
    let capturedSet: unknown = null;
    const mockServiceDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "appr-1", user_id: "user-1", status: "pending" },
            ]),
          }),
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((setVals) => {
          capturedSet = setVals;
          return {
            where: vi.fn().mockResolvedValue([{ id: "appr-1" }]),
          };
        }),
      })),
    };

    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({
      approvals: { name: "approvals" },
    }));

    const { resolveApprovalRow } = await import("@/lib/workflows/approvals");
    const result = await resolveApprovalRow("appr-1", "user-1", "approved", "inline");

    expect(result).toBe("appr-1");
    const setVals = capturedSet as Record<string, unknown>;
    expect(setVals["status"]).toBe("approved");
    expect(setVals["resolved_at"]).toBeInstanceOf(Date);
    expect(setVals["resolved_by_path"]).toBe("inline");
  });
});

// ─── WF-02 — Inngest durable execution + step checkpointing ──────────────────

describe("WF-02 — Inngest durable execution + step checkpointing", () => {
  it.todo("executeWorkflowRun creates a workflow_runs row with status 'queued' then 'running'");

  it.todo("each workflow step executes inside step.run() with a deterministic ID");

  it.todo("step IDs include step index and stable step identifier (no random)");

  it.todo("workflow_run status is set to 'succeeded' after all steps complete");

  it.todo("failed step sets workflow_run status to 'failed' with error_summary");

  it.todo("L1 workflow sets status 'paused_manual' and function exits (no approval row)");

  it.todo("L3 workflow executes all steps directly without pausing");
});

describe("WF-06 — Activity entry written before external effect", () => {
  it.todo("activity_entry INSERT occurs before Shopify API write call");

  it.todo("activity_entry INSERT occurs before Gmail send call");

  it.todo("unique(workflow_run_id, step_id) constraint prevents duplicate activity entries on retry");

  it.todo("activity_entry result is 'success' after successful external effect");

  it.todo("activity_entry result is 'failed' if external effect throws");
});
