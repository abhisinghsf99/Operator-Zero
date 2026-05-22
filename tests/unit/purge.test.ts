/**
 * tests/unit/purge.test.ts
 * Wave-0 RED scaffolds — Phase 4 Account deletion / purge requirements
 *
 * Requirements covered:
 *   SET-07 — purgeAccount Inngest function: 7-day grace with cancelOn CEL
 *            `async.data.userId == event.data.userId` (Pitfall 7 / D-09)
 *
 * Turned GREEN by: 04-04 (Sessions + Export + Purge slice)
 *
 * Each it() is a failing assertion (RED) — the Inngest function does not exist
 * yet. Tests fail until 04-04 creates lib/inngest/functions/purge-account.ts.
 *
 * Pattern: assert the function definition has the correct cancelOn CEL expression
 * (D-09 / Pitfall 7 — CEL async vs. event inversion must use async.data.userId
 * for the waited-for event and event.data.userId for the original trigger).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── SET-07: purgeAccount ─────────────────────────────────────────────────────

describe("SET-07 — purgeAccount", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("purgeAccount cancelOn uses CEL 'async.data.userId == event.data.userId' (not inverted)", async () => {
    // TODO(04-04): create lib/inngest/functions/purge-account.ts
    // The cancelOn config MUST use:
    //   if: "async.data.userId == event.data.userId"
    // NOT inverted (async = the waited-for cancel event; event = original trigger).
    // This matches the established pattern in execute-workflow-run.ts (Pitfall 7).
    const purgeModule = await import(
      "@/lib/inngest/functions/purge-account"
    ).catch(() => null);

    // RED: module does not exist yet
    expect(purgeModule).not.toBeNull();
    // When implemented:
    // const { purgeAccount } = purgeModule!;
    // // Access the Inngest function config to verify cancelOn expression
    // const config = purgeAccount["opts"]; // or however Inngest exposes config
    // expect(config.cancelOn).toBeDefined();
    // expect(config.cancelOn[0].if).toBe("async.data.userId == event.data.userId");
    // expect(config.cancelOn[0].event).toBe("account.deletion_cancelled");
  });

  it("purgeAccount locks account immediately (sets deletion_requested_at) before grace period", async () => {
    // TODO(04-04): step 1 of purgeAccount must set deletion_requested_at BEFORE step.sleep
    // This ensures the account is locked even if the sleep is cancelled
    const purgeModule = await import(
      "@/lib/inngest/functions/purge-account"
    ).catch(() => null);

    // RED: module does not exist yet
    expect(purgeModule).not.toBeNull();
    // When implemented (with step.run + serviceDb mocks):
    // const lockStep = step.run.mock.calls.find(([name]) => name === "lock-account");
    // expect(lockStep).toBeDefined();
    // // Verify lock-account runs BEFORE grace-period sleep
  });
});
