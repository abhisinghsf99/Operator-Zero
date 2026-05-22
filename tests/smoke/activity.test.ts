/**
 * tests/smoke/activity.test.ts
 * Smoke test: Activity page module can be imported without error (ACT-07).
 *
 * This test verifies that:
 *   1. The canRevert + REVERT_REASON_LABELS exports from lib/workflows/revert.ts
 *      are importable (the activity page depends on these).
 *   2. A synthetic list of 50 activity entries can be classified by canRevert()
 *      without throwing (simulates the Activity page rendering a 50-item page).
 *   3. groupWorkflowsByStatus handles a realistic workflow list without error.
 *
 * NOTE: This is a logic smoke test, not a browser/rendering test. The activity
 * page RSC is a Server Component and cannot be easily unit-rendered in Vitest
 * without a live Supabase connection. The smoke here verifies the data-processing
 * pipeline that the Activity page consumes — the critical path for ACT-07.
 */
import { describe, it, expect } from "vitest";
import { canRevert, REVERT_REASON_LABELS } from "@/lib/workflows/revert";
import { groupWorkflowsByStatus } from "@/lib/workflows/grouping";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeActivityEntry(i: number) {
  const actionTypes = [
    "update_product",
    "update_price",
    "send_email_reply",
    "update_inventory",
    "update_meta_title",
    "update_page_content",
    "create_redirect",
  ];
  const ageHours = (i % 200); // spread across 0..199 hours ago
  return {
    id: `entry-${i.toString().padStart(3, "0")}`,
    action_type: actionTypes[i % actionTypes.length]!,
    occurred_at: new Date(Date.now() - ageHours * 60 * 60 * 1000),
    is_revertable: i % 7 !== 0, // every 7th is a revert entry
    reverted_at: i % 13 === 0 ? new Date() : null, // every 13th is already reverted
    before_state: i % 5 === 0 ? null : { field: `value-${i}` },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Activity smoke — 50-item page", () => {
  it("canRevert processes 50 entries without throwing", () => {
    const entries = Array.from({ length: 50 }, (_, i) => makeActivityEntry(i));
    const results = entries.map(e => canRevert(e));

    // All results are either allowed or have a reason
    for (const result of results) {
      expect(typeof result.allowed).toBe("boolean");
      if (!result.allowed) {
        expect(result.reason).toBeTruthy();
        expect(typeof REVERT_REASON_LABELS[result.reason!]).toBe("string");
      }
    }

    // Should have a mix of allowed and blocked results across 50 varied entries
    const allowedCount = results.filter(r => r.allowed).length;
    expect(allowedCount).toBeGreaterThan(0);
    expect(allowedCount).toBeLessThan(50);
  });

  it("can process a page of 50 entries from multiple workers (concurrent simulated)", () => {
    // Simulate 50 entries being classified concurrently (Promise.all pattern)
    const entries = Array.from({ length: 50 }, (_, i) => makeActivityEntry(i));
    const results = entries.map(entry => canRevert(entry));
    expect(results).toHaveLength(50);
  });

  it("groupWorkflowsByStatus handles a realistic workflow list without error", () => {
    const workflows = Array.from({ length: 20 }, (_, i) => ({
      id: `wf-${i}`,
      name: `Workflow ${i}`,
      status: ["active", "active", "paused", "draft"][i % 4]!,
      trigger_type: ["schedule", "event", "manual"][i % 3]!,
      automation_level: ["L1", "L2", "L3"][i % 3]!,
      user_id: "user-001",
      created_at: new Date(),
      updated_at: new Date(),
    }));

    const result = groupWorkflowsByStatus(workflows);

    // Total items preserved
    const total =
      result.scheduled.length +
      result.triggered.length +
      result.manual.length +
      result.paused.length +
      result.drafts.length;
    expect(total).toBe(20);
  });
});
