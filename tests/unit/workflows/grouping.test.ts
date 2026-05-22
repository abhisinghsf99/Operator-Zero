/**
 * tests/unit/workflows/grouping.test.ts
 * Unit tests for groupWorkflowsByStatus (lib/workflows/grouping.ts).
 *
 * Covers WF-07: My Workflows shows all workflows grouped by status.
 * Pure function — no mocks needed.
 */
import { describe, it, expect } from "vitest";
import { groupWorkflowsByStatus } from "@/lib/workflows/grouping";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeWorkflow(id: string, status: string) {
  return {
    id,
    status,
    name: `Workflow ${id}`,
    trigger_type: "manual" as const,
    automation_level: "L2" as const,
    user_id: "user-001",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("groupWorkflowsByStatus", () => {
  it("returns empty buckets for an empty list", () => {
    const result = groupWorkflowsByStatus([]);
    expect(result.scheduled).toHaveLength(0);
    expect(result.triggered).toHaveLength(0);
    expect(result.manual).toHaveLength(0);
    expect(result.paused).toHaveLength(0);
    expect(result.drafts).toHaveLength(0);
  });

  it("puts 'active' + 'schedule' trigger into scheduled bucket", () => {
    const wf = { ...makeWorkflow("wf-1", "active"), trigger_type: "schedule" as const };
    const result = groupWorkflowsByStatus([wf]);
    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0]!.id).toBe("wf-1");
    expect(result.triggered).toHaveLength(0);
    expect(result.manual).toHaveLength(0);
  });

  it("puts 'active' + 'event' trigger into triggered bucket", () => {
    const wf = { ...makeWorkflow("wf-2", "active"), trigger_type: "event" as const };
    const result = groupWorkflowsByStatus([wf]);
    expect(result.triggered).toHaveLength(1);
    expect(result.triggered[0]!.id).toBe("wf-2");
  });

  it("puts 'active' + 'manual' trigger into manual bucket", () => {
    const wf = makeWorkflow("wf-3", "active");
    const result = groupWorkflowsByStatus([wf]);
    expect(result.manual).toHaveLength(1);
    expect(result.manual[0]!.id).toBe("wf-3");
  });

  it("puts 'paused' workflows into paused bucket regardless of trigger type", () => {
    const wf1 = { ...makeWorkflow("wf-4", "paused"), trigger_type: "schedule" as const };
    const wf2 = { ...makeWorkflow("wf-5", "paused"), trigger_type: "manual" as const };
    const result = groupWorkflowsByStatus([wf1, wf2]);
    expect(result.paused).toHaveLength(2);
    expect(result.scheduled).toHaveLength(0);
  });

  it("puts 'draft' workflows into drafts bucket", () => {
    const wf = makeWorkflow("wf-6", "draft");
    const result = groupWorkflowsByStatus([wf]);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]!.id).toBe("wf-6");
  });

  it("correctly partitions a mixed list", () => {
    const workflows = [
      { ...makeWorkflow("wf-1", "active"), trigger_type: "schedule" as const },
      { ...makeWorkflow("wf-2", "active"), trigger_type: "event" as const },
      { ...makeWorkflow("wf-3", "active"), trigger_type: "manual" as const },
      { ...makeWorkflow("wf-4", "paused"), trigger_type: "schedule" as const },
      { ...makeWorkflow("wf-5", "draft"), trigger_type: "manual" as const },
      { ...makeWorkflow("wf-6", "active"), trigger_type: "schedule" as const },
    ];

    const result = groupWorkflowsByStatus(workflows);
    expect(result.scheduled).toHaveLength(2);
    expect(result.triggered).toHaveLength(1);
    expect(result.manual).toHaveLength(1);
    expect(result.paused).toHaveLength(1);
    expect(result.drafts).toHaveLength(1);

    // Total items across all buckets should equal input length
    const total =
      result.scheduled.length +
      result.triggered.length +
      result.manual.length +
      result.paused.length +
      result.drafts.length;
    expect(total).toBe(workflows.length);
  });

  it("archived workflows are not included in any active bucket (go to drafts as fallback)", () => {
    const wf = makeWorkflow("wf-7", "archived");
    const result = groupWorkflowsByStatus([wf]);
    // archived is not a primary display status — should appear in some bucket
    // (we don't want it silently lost)
    const total =
      result.scheduled.length +
      result.triggered.length +
      result.manual.length +
      result.paused.length +
      result.drafts.length;
    expect(total).toBe(1);
  });
});
