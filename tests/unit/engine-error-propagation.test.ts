/**
 * tests/unit/engine-error-propagation.test.ts
 * WS3 — runWorkflowStep must propagate a dispatched tool's is_error flag onto
 * WorkflowStepResult.isError so the engine (execute-workflow-run.ts) can mark
 * the step/run as failed instead of recording a false "success".
 *
 * Same mock scaffolding as tests/unit/run-workflow-step.test.ts.
 * LLM TESTING RULE: No live Anthropic/DB calls. dispatchTool mocked; registry mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock cost-cap (must be before any imports that use it) ───────────────────

vi.mock("@/lib/cost-cap", () => ({
  checkCostCap: vi.fn().mockResolvedValue("ok"),
  recordCost: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock tool registry (dispatchTool + getToolDefinitions) ──────────────────

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

function makeCtx(override?: Partial<WorkflowStepContext>): WorkflowStepContext {
  return {
    userId: "user-123",
    workflowRunId: "run-abc",
    stepId: "step-1",
    automationLevel: "L3",
    stepDefinition: {
      tool: "fake_tool",
      input: { product_gid: "gid://1" },
    },
    ...override,
  };
}

describe("runWorkflowStep — WS3: isError propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) dispatched ToolResult with is_error=true → result.isError=true", async () => {
    const errorResult: ToolResult = {
      type: "tool_result",
      is_error: true,
      content: "Shopify write failed",
    };
    mockDispatchTool.mockResolvedValue(errorResult);

    const noApprovalTool: Partial<ToolDefinition> = {
      approvalRequired: () => false,
    };
    mockGetToolDefinitions.mockReturnValue({ fake_tool: noApprovalTool });

    const result = await runWorkflowStep(makeCtx());

    expect(result.isError).toBe(true);
    expect(result.toolResult).toEqual(errorResult);
  });

  it("(b) dispatched ToolResult with is_error absent → result.isError=false", async () => {
    const okResult: ToolResult = {
      type: "tool_result",
      content: JSON.stringify({ ok: true }),
    };
    mockDispatchTool.mockResolvedValue(okResult);

    const noApprovalTool: Partial<ToolDefinition> = {
      approvalRequired: () => false,
    };
    mockGetToolDefinitions.mockReturnValue({ fake_tool: noApprovalTool });

    const result = await runWorkflowStep(makeCtx());

    expect(result.isError).toBe(false);
  });

  it("(c) deferred branch (approval-gated, not propose-safe) → result.isError=false, dispatchTool not called", async () => {
    const unsafeTool: Partial<ToolDefinition> = {
      approvalRequired: () => true,
      // No extractProposedAction, no proposeSafe — deferred branch.
    };
    mockGetToolDefinitions.mockReturnValue({ fake_tool: unsafeTool });

    const result = await runWorkflowStep(
      makeCtx({ automationLevel: "L2" })
    );

    expect(result.isError).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(mockDispatchTool).not.toHaveBeenCalled();
  });
});
