/**
 * tests/unit/workflows/revert.test.ts
 * Unit tests for canRevert() pure function (lib/workflows/revert.ts).
 *
 * Covers all 5 failure modes + success path + already_reverted + is_revert_entry
 * per 03-VALIDATION.md and ACT-08 / D-11.
 *
 * canRevert is a pure function — no mocks needed.
 */
import { describe, it, expect } from "vitest";
import { canRevert, REVERT_REASON_LABELS } from "@/lib/workflows/revert";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/** Minimal entry fixture — adjust fields per test */
function makeEntry(overrides: Partial<{
  action_type: string;
  occurred_at: Date;
  is_revertable: boolean;
  reverted_at: Date | null;
  before_state: Record<string, unknown> | null;
}> = {}) {
  return {
    action_type: "update_product",
    occurred_at: hoursAgo(1),
    is_revertable: true,
    reverted_at: null,
    before_state: { title: "Old title" },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("canRevert — failure modes", () => {
  it("returns already_reverted when reverted_at is set", () => {
    const entry = makeEntry({ reverted_at: new Date() });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("already_reverted");
  });

  it("returns is_revert_entry when is_revertable is false", () => {
    const entry = makeEntry({ is_revertable: false });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("is_revert_entry");
  });

  it("returns sent for send_email_draft action type", () => {
    const entry = makeEntry({ action_type: "send_email_draft" });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("sent");
  });

  it("returns sent for send_email_reply action type", () => {
    const entry = makeEntry({ action_type: "send_email_reply" });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("sent");
  });

  it("returns out_of_window for content edit older than 7 days", () => {
    const entry = makeEntry({
      action_type: "update_product",
      occurred_at: daysAgo(8),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("out_of_window");
  });

  it("returns out_of_window for structural edit older than 24 hours", () => {
    const entry = makeEntry({
      action_type: "update_price",
      occurred_at: hoursAgo(25),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("out_of_window");
  });

  it("returns out_of_window for inventory update older than 24 hours", () => {
    const entry = makeEntry({
      action_type: "update_inventory",
      occurred_at: hoursAgo(26),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("out_of_window");
  });

  it("returns manually_edited_since when shopifyUpdatedAt > occurred_at", () => {
    const occurred = hoursAgo(2);
    const shopifyUpdated = hoursAgo(1); // updated after the action
    const entry = makeEntry({ occurred_at: occurred });
    const result = canRevert(entry, shopifyUpdated);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("manually_edited_since");
  });
});

describe("canRevert — success path", () => {
  it("returns allowed:true for an in-window content edit with no shopify update", () => {
    const entry = makeEntry({
      action_type: "update_product",
      occurred_at: hoursAgo(12),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns allowed:true for an in-window structural edit (within 24h)", () => {
    const entry = makeEntry({
      action_type: "update_price",
      occurred_at: hoursAgo(23),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed:true for content edit when shopifyUpdatedAt is before occurred_at", () => {
    const occurred = hoursAgo(2);
    const shopifyUpdated = hoursAgo(5); // updated before the agent action
    const entry = makeEntry({ occurred_at: occurred });
    const result = canRevert(entry, shopifyUpdated);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed:true for unknown action_type (defaults to content/7d window)", () => {
    const entry = makeEntry({
      action_type: "some_unknown_action_type_xyz",
      occurred_at: hoursAgo(2),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed:true when shopifyUpdatedAt is null (no Shopify target)", () => {
    const entry = makeEntry({ occurred_at: hoursAgo(1) });
    const result = canRevert(entry, null);
    expect(result.allowed).toBe(true);
  });
});

describe("REVERT_REASON_LABELS", () => {
  it("has a label for every possible reason", () => {
    const reasons: Array<NonNullable<ReturnType<typeof canRevert>["reason"]>> = [
      "out_of_window",
      "sent",
      "manually_edited_since",
      "already_reverted",
      "is_revert_entry",
    ];
    for (const reason of reasons) {
      expect(REVERT_REASON_LABELS[reason]).toBeTruthy();
      expect(typeof REVERT_REASON_LABELS[reason]).toBe("string");
    }
  });
});
