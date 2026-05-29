/**
 * tests/unit/run-workflow-step.test.ts
 * Coverage for runWorkflowStep: extractProposedAction surfacing + backward-compat guard.
 *
 * Tests:
 *   (a) extractProposedAction present → proposedAction = extracted value (NOT raw input)
 *   (b) backward-compat: no extractProposedAction → proposedAction === raw input
 *   (c) no approval (L3 / approvalRequired false) → proposedAction === undefined
 *
 * LLM TESTING RULE: No live Anthropic/DB calls. dispatchTool mocked; registry mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock cost-cap (must be before any imports that use it) ───────────────────

vi.mock("@/lib/cost-cap", () => ({
  checkCostCap: vi.fn().mockResolvedValue("ok"),
  recordCost: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock tool registry (dispatchTool + getToolDefinitions) ──────────────────

// We will override getToolDefinitions per-test to control the tool registry.
// dispatchTool is mocked to return a fixed ToolResult.
const mockDispatchTool = vi.fn();
const mockGetToolDefinitions = vi.fn();

vi.mock("@/lib/agent/tools/index", () => ({
  dispatchTool: (...args: unknown[]) => mockDispatchTool(...args),
  getToolDefinitions: () => mockGetToolDefinitions(),
}));

// ─── Import under test AFTER mocks ────────────────────────────────────────────

import { runWorkflowStep } from "@/lib/agent/runtime";
import type { WorkflowStepContext } from "@/lib/agent/runtime";
import type { ToolResult, ToolDefinition } from "@/lib/agent/tools/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_TOOL_RESULT: ToolResult = {
  type: "tool_result",
  is_error: false,
  content: JSON.stringify({ ok: true, phase: "propose", product_gid: "gid://1", body_html: "<p>x</p>" }),
};

function makeCtx(override?: Partial<WorkflowStepContext>): WorkflowStepContext {
  return {
    userId: "user-123",
    workflowRunId: "run-abc",
    stepId: "step-1",
    automationLevel: "L2",
    stepDefinition: {
      tool: "fake_tool",
      input: { product_gid: "gid://1" },
    },
    ...override,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runWorkflowStep — extractProposedAction surfacing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatchTool.mockResolvedValue(FAKE_TOOL_RESULT);
  });

  it("(a) extracts proposedAction via extractProposedAction when method is present", async () => {
    const extractedAction = { product_gid: "gid://1", body_html: "<p>x</p>" };

    const fakeToolWithExtract: Partial<ToolDefinition> = {
      approvalRequired: () => true,
      extractProposedAction: vi.fn().mockReturnValue(extractedAction),
    };

    mockGetToolDefinitions.mockReturnValue({
      fake_tool: fakeToolWithExtract,
    });

    const result = await runWorkflowStep(makeCtx());

    expect(result.requiresApproval).toBe(true);
    expect(result.proposedAction).toEqual(extractedAction);
    expect(result.proposedAction).not.toEqual({ product_gid: "gid://1" }); // NOT the raw input
    // extractProposedAction should have been called with (toolResult, input, agentCtx)
    expect(fakeToolWithExtract.extractProposedAction).toHaveBeenCalledWith(
      FAKE_TOOL_RESULT,
      { product_gid: "gid://1" },
      expect.objectContaining({ userId: "user-123", automationLevel: "L2" })
    );
  });

  it("(b) backward-compat: no extractProposedAction → proposedAction === raw input", async () => {
    const rawInput = { product_gid: "gid://1" };

    const fakeToolNoExtract: Partial<ToolDefinition> = {
      approvalRequired: () => true,
      // No extractProposedAction
    };

    mockGetToolDefinitions.mockReturnValue({
      fake_tool: fakeToolNoExtract,
    });

    const result = await runWorkflowStep(makeCtx({ stepDefinition: { tool: "fake_tool", input: rawInput } }));

    expect(result.requiresApproval).toBe(true);
    expect(result.proposedAction).toEqual(rawInput);
  });

  it("(c) no approval (approvalRequired=false) → proposedAction === undefined", async () => {
    const fakeToolL3: Partial<ToolDefinition> = {
      approvalRequired: () => false,
      extractProposedAction: vi.fn().mockReturnValue({ product_gid: "gid://1", body_html: "<p>auto</p>" }),
    };

    mockGetToolDefinitions.mockReturnValue({
      fake_tool: fakeToolL3,
    });

    const result = await runWorkflowStep(
      makeCtx({ automationLevel: "L3", stepDefinition: { tool: "fake_tool", input: { product_gid: "gid://1" } } })
    );

    expect(result.requiresApproval).toBe(false);
    expect(result.proposedAction).toBeUndefined();
  });

  it("extractProposedAction is called with the actual ToolResult from dispatchTool", async () => {
    const customResult: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: "custom-content",
    };
    mockDispatchTool.mockResolvedValueOnce(customResult);

    const capturedArgs: unknown[] = [];
    const fakeToolCapture: Partial<ToolDefinition> = {
      approvalRequired: () => true,
      extractProposedAction: (...args: unknown[]) => {
        capturedArgs.push(...args);
        return { extracted: true };
      },
    };

    mockGetToolDefinitions.mockReturnValue({ fake_tool: fakeToolCapture });

    await runWorkflowStep(makeCtx());

    // The first argument should be the ToolResult from dispatchTool
    expect(capturedArgs[0]).toEqual(customResult);
  });
});
