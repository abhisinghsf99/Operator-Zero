/**
 * tests/unit/scheduled-workflows.test.ts
 * WS9 — pure isCronDue() cron matching + scheduledWorkflowsTick sandbox/demo
 * exclusion and event-send behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isCronDue } from "@/lib/workflows/cron";

// ─── isCronDue — pure, dependency-free ────────────────────────────────────────

describe("isCronDue — daily pattern (\"M H * * *\")", () => {
  it("fires when now is past H:M and lastRunAt was on an earlier calendar day (26h ago)", () => {
    const now = new Date("2024-01-15T03:07:00Z"); // 03:07 UTC
    const lastRunAt = new Date(now.getTime() - 26 * 60 * 60 * 1000); // ~26h ago, previous day
    expect(isCronDue("0 3 * * *", "UTC", now, lastRunAt)).toBe(true);
  });

  it("does not re-fire when lastRunAt already happened earlier today (10 minutes ago)", () => {
    const now = new Date("2024-01-15T03:07:00Z");
    const lastRunAt = new Date(now.getTime() - 10 * 60 * 1000); // 10 min ago, same calendar day
    expect(isCronDue("0 3 * * *", "UTC", now, lastRunAt)).toBe(false);
  });

  it("does not fire before the scheduled time-of-day has been reached", () => {
    const now = new Date("2024-01-15T02:59:00Z"); // 1 minute before 03:00
    expect(isCronDue("0 3 * * *", "UTC", now, null)).toBe(false);
  });

  it("fires with lastRunAt=null once the scheduled time has passed", () => {
    const now = new Date("2024-01-15T03:00:00Z");
    expect(isCronDue("0 3 * * *", "UTC", now, null)).toBe(true);
  });
});

describe("isCronDue — every-N-minutes pattern", () => {
  it("fires when lastRunAt falls in an earlier N-minute slot (20 minutes ago, N=15)", () => {
    const now = new Date("2024-01-15T10:07:00Z"); // slot 10:00-10:15
    const lastRunAt = new Date(now.getTime() - 20 * 60 * 1000); // 09:47 — slot 09:45-10:00
    expect(isCronDue("*/15 * * * *", "UTC", now, lastRunAt)).toBe(true);
  });

  it("does not re-fire within the same N-minute slot (5 minutes ago, N=15)", () => {
    const now = new Date("2024-01-15T10:07:00Z"); // slot 10:00-10:15
    const lastRunAt = new Date(now.getTime() - 5 * 60 * 1000); // 10:02 — same slot
    expect(isCronDue("*/15 * * * *", "UTC", now, lastRunAt)).toBe(false);
  });

  it("fires with lastRunAt=null", () => {
    const now = new Date("2024-01-15T10:07:00Z");
    expect(isCronDue("*/15 * * * *", "UTC", now, null)).toBe(true);
  });
});

describe("isCronDue — weekly pattern (\"M H * * D\")", () => {
  it("fires on the matching weekday once the time-of-day is reached", () => {
    // 2024-01-15 is a Monday (weekday 1).
    const now = new Date("2024-01-15T09:05:00Z");
    expect(isCronDue("0 9 * * 1", "UTC", now, null)).toBe(true);
  });

  it("does not fire on a non-matching weekday", () => {
    // 2024-01-16 is a Tuesday.
    const now = new Date("2024-01-16T09:05:00Z");
    expect(isCronDue("0 9 * * 1", "UTC", now, null)).toBe(false);
  });
});

describe("isCronDue — malformed expressions never throw and always return false", () => {
  it.each([
    ["", "UTC"],
    ["not a cron", "UTC"],
    ["* * * * * *", "UTC"], // 6 fields
    ["a b * * *", "UTC"], // non-numeric minute/hour
    ["0 3 1 * *", "UTC"], // day-of-month restriction unsupported
    ["0 3 * 6 *", "UTC"], // month restriction unsupported
    ["0 25 * * *", "UTC"], // hour out of range
    ["*/0 * * * *", "UTC"], // zero interval
  ])("isCronDue(%j, tz) → false, never throws", (expr) => {
    expect(() => isCronDue(expr, "UTC", new Date(), null)).not.toThrow();
    expect(isCronDue(expr, "UTC", new Date(), null)).toBe(false);
  });
});

// ─── scheduledWorkflowsTick — sandbox/demo exclusion + event send ────────────
//
// NOTE: these use vi.doMock (NOT vi.mock) deliberately — vi.mock is hoisted
// above all imports, which would replace the real isCronDue used by the pure
// isCronDue() tests above with the mock defined here. vi.doMock registers in
// place, and lib/inngest/functions/scheduled-workflows is only ever imported
// dynamically (below), after these registrations run.

const mockSend = vi.fn();

vi.doMock("@/lib/inngest/client", () => ({
  inngest: {
    // Capture the handler and return it directly so tests can invoke it like
    // a plain async function, exercising the REAL handler body (not a
    // re-simulated inline copy).
    createFunction: (_config: unknown, handler: (args: { step: unknown }) => unknown) => handler,
    send: (...args: unknown[]) => mockSend(...args),
  },
}));

const mockIsCronDue = vi.fn();
vi.doMock("@/lib/workflows/cron", () => ({
  isCronDue: (...args: unknown[]) => mockIsCronDue(...args),
}));

const mockIsDemoUser = vi.fn().mockReturnValue(false);
vi.doMock("@/lib/auth/demo", () => ({
  isDemoUser: (...args: unknown[]) => mockIsDemoUser(...args),
}));

vi.doMock("@/lib/demo/constants", () => ({
  SANDBOX_SENTINEL_TOKEN: "sandbox-token-xyz",
}));

let workflowsRows: Array<{ id: string; user_id: string; trigger_config: unknown }> = [];
let integrationsRows: Array<{ user_id: string; tok: string }> = [];
let lastRunRows: Array<{ started_at: Date }> = [];

vi.doMock("@/lib/db/client", () => ({
  serviceDb: {
    select: vi.fn((cols: Record<string, unknown>) => {
      const isWorkflowsQuery = "trigger_config" in cols;
      const isIntegrationsQuery = "tok" in cols;
      const isRunsQuery = "started_at" in cols && !("trigger_config" in cols);
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => {
            if (isWorkflowsQuery) return Promise.resolve(workflowsRows);
            if (isIntegrationsQuery) return Promise.resolve(integrationsRows);
            if (isRunsQuery) {
              return {
                orderBy: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue(lastRunRows),
                })),
              };
            }
            return Promise.resolve([]);
          }),
        })),
      };
    }),
  },
}));

vi.doMock("@/lib/db/schema", () => ({
  workflows: {
    id: "id",
    user_id: "user_id",
    status: "status",
    trigger_type: "trigger_type",
    trigger_config: "trigger_config",
  },
  workflowRuns: {
    workflow_id: "workflow_id",
    user_id: "user_id",
    trigger_source: "trigger_source",
    started_at: "started_at",
  },
  integrations: {
    user_id: "user_id",
    provider: "provider",
    access_token_encrypted: "access_token_encrypted",
  },
}));

// Minimal step mock — step.run(id, fn) resolves fn() immediately.
function makeStep() {
  return { run: vi.fn().mockImplementation((_id: string, fn: () => unknown) => fn()) };
}

describe("scheduledWorkflowsTick — sandbox/demo exclusion + event send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workflowsRows = [];
    integrationsRows = [];
    lastRunRows = [];
    mockIsDemoUser.mockReturnValue(false);
  });

  it("sends workflow.run_requested for a due, non-sandbox, non-demo workflow", async () => {
    workflowsRows = [
      { id: "wf-1", user_id: "user-1", trigger_config: { cron: "0 3 * * *", tz: "UTC" } },
    ];
    integrationsRows = [{ user_id: "user-1", tok: "real-oauth-token" }];
    lastRunRows = [];
    mockIsCronDue.mockReturnValue(true);

    const { scheduledWorkflowsTick } = await import(
      "@/lib/inngest/functions/scheduled-workflows"
    );
    const step = makeStep();

    const result = await (
      scheduledWorkflowsTick as unknown as (args: { step: unknown }) => Promise<unknown>
    )({ step });

    expect(mockSend).toHaveBeenCalledWith({
      name: "workflow.run_requested",
      data: { userId: "user-1", workflowId: "wf-1", triggerSource: "schedule" },
    });
    expect(result).toEqual({ due: 1, sent: 1 });
  });

  it("excludes a sandbox owner (sentinel Shopify token) even when isCronDue would be true", async () => {
    workflowsRows = [
      { id: "wf-2", user_id: "user-2", trigger_config: { cron: "0 3 * * *", tz: "UTC" } },
    ];
    integrationsRows = [{ user_id: "user-2", tok: "sandbox-token-xyz" }];
    mockIsCronDue.mockReturnValue(true);

    const { scheduledWorkflowsTick } = await import(
      "@/lib/inngest/functions/scheduled-workflows"
    );
    const step = makeStep();

    await (scheduledWorkflowsTick as unknown as (args: { step: unknown }) => Promise<unknown>)({
      step,
    });

    expect(mockSend).not.toHaveBeenCalled();
    // Sandbox rows are filtered before ever reaching isCronDue.
    expect(mockIsCronDue).not.toHaveBeenCalled();
  });

  it("excludes a demo owner (isDemoUser) even when isCronDue would be true", async () => {
    workflowsRows = [
      { id: "wf-3", user_id: "user-3", trigger_config: { cron: "0 3 * * *", tz: "UTC" } },
    ];
    integrationsRows = [{ user_id: "user-3", tok: "real-oauth-token" }];
    mockIsDemoUser.mockImplementation((userId: string) => userId === "user-3");
    mockIsCronDue.mockReturnValue(true);

    const { scheduledWorkflowsTick } = await import(
      "@/lib/inngest/functions/scheduled-workflows"
    );
    const step = makeStep();

    await (scheduledWorkflowsTick as unknown as (args: { step: unknown }) => Promise<unknown>)({
      step,
    });

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockIsCronDue).not.toHaveBeenCalled();
  });

  it("does not send when isCronDue returns false", async () => {
    workflowsRows = [
      { id: "wf-4", user_id: "user-4", trigger_config: { cron: "0 3 * * *", tz: "UTC" } },
    ];
    integrationsRows = [{ user_id: "user-4", tok: "real-oauth-token" }];
    mockIsCronDue.mockReturnValue(false);

    const { scheduledWorkflowsTick } = await import(
      "@/lib/inngest/functions/scheduled-workflows"
    );
    const step = makeStep();

    const result = await (
      scheduledWorkflowsTick as unknown as (args: { step: unknown }) => Promise<unknown>
    )({ step });

    expect(mockSend).not.toHaveBeenCalled();
    expect(result).toEqual({ due: 0, sent: 0 });
  });
});
