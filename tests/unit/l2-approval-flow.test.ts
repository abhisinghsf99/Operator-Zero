/**
 * tests/unit/l2-approval-flow.test.ts
 * Wave-0 scaffold — WF-04: L2 pause creates approval row + waitForEvent/resume
 *
 * Tests the L2 approval pause/resume mechanism — the critical pause/resume flow
 * via step.waitForEvent and the Server Action that fires the resume event.
 *
 * Requirement: WF-04 — L2 pauses at boundary, creates approval, resumes on approve/reject
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── WF-04: createApproval behavior ──────────────────────────────────────────

describe("WF-04 — L2 pause: createApproval creates pending row", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("createApproval inserts a row with status='pending' and expires_at = now + 14 days", async () => {
    const fixedNow = new Date("2024-06-01T00:00:00Z");
    vi.setSystemTime(fixedNow);

    let capturedValues: Record<string, unknown> | null = null;
    const mockServiceDb = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((vals) => {
          capturedValues = vals;
          return {
            returning: vi.fn().mockResolvedValue([{ id: "appr-test-1" }]),
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
      action_summary: "Update product SEO",
      stakes: "low",
      preview: { items: 1 },
      reasoning_summary: "Improve SEO",
      proposed_action: { product_gid: "gid://shopify/Product/1" },
    });

    expect(id).toBe("appr-test-1");
    expect(capturedValues).not.toBeNull();
    expect(capturedValues!["status"]).toBe("pending");

    const expectedExpiry = new Date(fixedNow.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(capturedValues!["expires_at"]).toEqual(expectedExpiry);

    vi.useRealTimers();
  });

  it("inngest_event_key is set on approval row for correlation", async () => {
    let capturedValues: Record<string, unknown> | null = null;
    const mockServiceDb = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((vals) => {
          capturedValues = vals;
          return { returning: vi.fn().mockResolvedValue([{ id: "appr-2" }]) };
        }),
      })),
    };
    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({ approvals: { name: "approvals" } }));

    const { createApproval } = await import("@/lib/workflows/approvals");

    await createApproval("user-1", {
      workflow_run_id: "run-abc",
      step_id: "step-2",
      action_type: "product_update",
      action_summary: "Update",
      stakes: "low",
      preview: {},
      reasoning_summary: "Reason",
      proposed_action: {},
    });

    // inngest_event_key should correlate the run + step
    expect(capturedValues!["inngest_event_key"]).toContain("run-abc");
    expect(capturedValues!["inngest_event_key"]).toContain("step-2");
  });
});

// ─── WF-04: resolveApprovalRow ownership check ───────────────────────────────

describe("WF-04 — resolveApprovalRow: ownership + status update", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("approved decision sets status='approved' + resolved_at + resolved_by_path", async () => {
    let capturedSet: Record<string, unknown> | null = null;
    const mockServiceDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440001", user_id: "user-1", status: "pending" }]),
          }),
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((vals) => {
          capturedSet = vals;
          return { where: vi.fn().mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440001" }]) };
        }),
      })),
    };
    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({ approvals: { name: "approvals" } }));

    const { resolveApprovalRow } = await import("@/lib/workflows/approvals");

    const result = await resolveApprovalRow("550e8400-e29b-41d4-a716-446655440001", "user-1", "approved", "inline");

    expect(result).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(capturedSet!["status"]).toBe("approved");
    expect(capturedSet!["resolved_at"]).toBeInstanceOf(Date);
    expect(capturedSet!["resolved_by_path"]).toBe("inline");
  });

  it("rejected decision sets status='rejected' + reject_reason", async () => {
    let capturedSet: Record<string, unknown> | null = null;
    const mockServiceDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440001", user_id: "user-1", status: "pending" }]),
          }),
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((vals) => {
          capturedSet = vals;
          return { where: vi.fn().mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440001" }]) };
        }),
      })),
    };
    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({ approvals: { name: "approvals" } }));

    const { resolveApprovalRow } = await import("@/lib/workflows/approvals");

    const result = await resolveApprovalRow("550e8400-e29b-41d4-a716-446655440001", "user-1", "rejected", "inbox", "Not needed");

    expect(result).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(capturedSet!["status"]).toBe("rejected");
    expect(capturedSet!["reject_reason"]).toBe("Not needed");
  });

  it("returns null if user does not own the approval (ownership check)", async () => {
    const mockServiceDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // no row found for this user
          }),
        }),
      })),
    };
    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    vi.doMock("@/lib/db/schema", () => ({ approvals: { name: "approvals" } }));

    const { resolveApprovalRow } = await import("@/lib/workflows/approvals");

    const result = await resolveApprovalRow("550e8400-e29b-41d4-a716-446655440001", "wrong-user", "approved");
    expect(result).toBeNull();
  });
});

// ─── WF-04: approveItem/rejectItem Server Actions → inngest.send ──────────────
// Tests added in Task 3 (app/app/approvals/actions.ts)
//
// Strategy: use module-level state (accessible by vi.doMock factories which
// run in the same module scope as the test file).

// Module-level state for call tracking across mock boundaries
const _testState = {
  callOrder: [] as string[],
  capturedEvent: null as unknown,
  resolveReturn: "550e8400-e29b-41d4-a716-446655440001" as string | null,
};

describe("WF-04 — approveItem/rejectItem Server Actions fire approval.resolved", () => {
  beforeEach(() => {
    vi.resetModules();
    _testState.callOrder = [];
    _testState.capturedEvent = null;
    _testState.resolveReturn = "550e8400-e29b-41d4-a716-446655440001";
  });

  it("approveItem calls resolveApprovalRow THEN fires inngest.send with approval.resolved", async () => {
    vi.doMock("@/lib/workflows/approvals", () => ({
      resolveApprovalRow: async function () {
        _testState.callOrder.push("resolveApprovalRow");
        return _testState.resolveReturn;
      },
    }));

    vi.doMock("@/lib/inngest/client", () => ({
      inngest: {
        send: async function (event: unknown) {
          _testState.callOrder.push("inngest.send");
          _testState.capturedEvent = event;
        },
      },
    }));

    vi.doMock("@/lib/auth/server", () => ({
      createClient: async function () {
        return {
          auth: {
            getClaims: async () => ({ data: { claims: { sub: "user-1" } } }),
          },
        };
      },
    }));

    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

    const { approveItem } = await import("@/app/app/approvals/actions");

    await approveItem("550e8400-e29b-41d4-a716-446655440001", "inline");

    expect(_testState.callOrder).toContain("resolveApprovalRow");
    expect(_testState.callOrder).toContain("inngest.send");

    // resolveApprovalRow must come BEFORE inngest.send (auth before resume)
    const resolveIdx = _testState.callOrder.indexOf("resolveApprovalRow");
    const sendIdx = _testState.callOrder.indexOf("inngest.send");
    expect(resolveIdx).toBeLessThan(sendIdx);

    // inngest.send fires with correct event name + approvalId
    const sentEvent = _testState.capturedEvent as Record<string, unknown>;
    expect(sentEvent["name"]).toBe("approval.resolved");
    const data = sentEvent["data"] as Record<string, unknown>;
    expect(data["approvalId"]).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(data["decision"]).toBe("approved");
  });

  it("rejectItem calls resolveApprovalRow THEN fires inngest.send with decision='rejected'", async () => {
    vi.doMock("@/lib/workflows/approvals", () => ({
      resolveApprovalRow: async function () {
        _testState.callOrder.push("resolveApprovalRow");
        return _testState.resolveReturn;
      },
    }));

    vi.doMock("@/lib/inngest/client", () => ({
      inngest: {
        send: async function (event: unknown) {
          _testState.callOrder.push("inngest.send");
          _testState.capturedEvent = event;
        },
      },
    }));

    vi.doMock("@/lib/auth/server", () => ({
      createClient: async function () {
        return {
          auth: {
            getClaims: async () => ({ data: { claims: { sub: "user-1" } } }),
          },
        };
      },
    }));

    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

    const { rejectItem } = await import("@/app/app/approvals/actions");

    await rejectItem("550e8400-e29b-41d4-a716-446655440001", "Not needed");

    expect(_testState.callOrder).toContain("resolveApprovalRow");
    expect(_testState.callOrder).toContain("inngest.send");

    const resolveIdx = _testState.callOrder.indexOf("resolveApprovalRow");
    const sendIdx = _testState.callOrder.indexOf("inngest.send");
    expect(resolveIdx).toBeLessThan(sendIdx);

    const sentEvent = _testState.capturedEvent as Record<string, unknown>;
    expect(sentEvent["name"]).toBe("approval.resolved");
    const data = sentEvent["data"] as Record<string, unknown>;
    expect(data["approvalId"]).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(data["decision"]).toBe("rejected");
  });

  it("approveItem returns error if approval not owned by user (null from resolveApprovalRow)", async () => {
    _testState.resolveReturn = null;

    vi.doMock("@/lib/workflows/approvals", () => ({
      resolveApprovalRow: async function () {
        return _testState.resolveReturn;
      },
    }));

    vi.doMock("@/lib/inngest/client", () => ({
      inngest: {
        send: async function () {
          _testState.callOrder.push("inngest.send");
        },
      },
    }));

    vi.doMock("@/lib/auth/server", () => ({
      createClient: async function () {
        return {
          auth: {
            getClaims: async () => ({ data: { claims: { sub: "user-2" } } }),
          },
        };
      },
    }));

    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

    const { approveItem } = await import("@/app/app/approvals/actions");

    const result = await approveItem("550e8400-e29b-41d4-a716-446655440001", "inline");

    // inngest.send must NOT be called when ownership check fails
    expect(_testState.callOrder).not.toContain("inngest.send");
    // Should return an error result
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("inngest.send fires exactly once with name 'approval.resolved' and matching approvalId", async () => {
    _testState.resolveReturn = "550e8400-e29b-41d4-a716-446655440005";

    vi.doMock("@/lib/workflows/approvals", () => ({
      resolveApprovalRow: async function () {
        _testState.callOrder.push("resolveApprovalRow");
        return _testState.resolveReturn;
      },
    }));

    vi.doMock("@/lib/inngest/client", () => ({
      inngest: {
        send: async function (event: unknown) {
          _testState.callOrder.push("inngest.send");
          _testState.capturedEvent = event;
        },
      },
    }));

    vi.doMock("@/lib/auth/server", () => ({
      createClient: async function () {
        return {
          auth: {
            getClaims: async () => ({ data: { claims: { sub: "user-1" } } }),
          },
        };
      },
    }));

    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

    const { approveItem } = await import("@/app/app/approvals/actions");

    await approveItem("550e8400-e29b-41d4-a716-446655440005", "inbox");

    expect(_testState.callOrder.filter(x => x === "inngest.send")).toHaveLength(1);
    const sentEvent = _testState.capturedEvent as Record<string, unknown>;
    expect(sentEvent["name"]).toBe("approval.resolved");
    const data = sentEvent["data"] as Record<string, unknown>;
    expect(data["approvalId"]).toBe("550e8400-e29b-41d4-a716-446655440005");
    expect(data["decision"]).toBe("approved");
  });
});
