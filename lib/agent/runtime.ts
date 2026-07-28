/**
 * lib/agent/runtime.ts
 * Shared agent runtime — entry point for workflow step execution + error classification.
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars read here.
 *   Do NOT import this module in Client Components.
 *
 * Entry points:
 *   runWorkflowStep(ctx)    — Workflow step execution entry point (02-07 wires this)
 *   classifyAgentError(err) — map provider API errors to agent error types (AGENT-06)
 *
 * NOTE: the streaming chat path lives in app/api/chat/[threadId]/send/route.ts and
 * runs on the Vercel AI SDK (streamText). The legacy chat-streaming helper that
 * used to live here was dead code (nothing called it) and has been removed.
 *
 * Error classification (AGENT-06):
 *   classifyAgentError(err) → { type: 'auth_error' | 'transient' | 'budget_exhausted' }
 *   Unknown errors are rethrown (Inngest handles retries for workflow steps).
 *
 * THREAT MODEL:
 *   T-2-05-02: checkCostCap() consulted before every LLM call
 *   T-2-05-04: userId from authenticated session, never from request body
 */

import Anthropic from "@anthropic-ai/sdk";
import { APICallError } from "ai";
import { checkCostCap, recordCost } from "@/lib/cost-cap";
import { dispatchTool, getToolDefinitions } from "./tools/index";
import type { AgentContext, ToolResult } from "./tools/index";

// ─── Error classification ─────────────────────────────────────────────────────

/** Classified error returned from classifyAgentError() */
export interface AgentErrorClassification {
  type: "auth_error" | "transient" | "budget_exhausted";
}

/**
 * classifyAgentError — map Anthropic API errors to agent error types.
 *
 * Classification:
 *   401 → auth_error    (token expired / invalid; user must reconnect)
 *   529 → transient     (Anthropic overloaded; Inngest will retry)
 *   429 → transient     (rate limit; retry with backoff)
 *   503 → transient     (service unavailable; retry)
 *   other APIStatusError → transient (unknown server error; retry)
 *   non-APIStatusError → rethrow (unknown; do not swallow)
 *
 * Unknown errors (not Anthropic.APIStatusError) are rethrown so Inngest can
 * handle retries at the workflow level without silently swallowing bugs.
 *
 * @param err — the caught error
 * @returns AgentErrorClassification for known error types
 * @throws the original error for unknown/unclassifiable errors
 */
export function classifyAgentError(err: unknown): AgentErrorClassification {
  // Anthropic SDK v0.97.1 exports APIError (not APIStatusError) as the base class
  // with a .status property for HTTP status codes.
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    if (status === 401) {
      return { type: "auth_error" };
    }
    // 529 = Anthropic overloaded; 503 = service unavailable; 429 = rate limit
    if (status === 529 || status === 503 || status === 429) {
      return { type: "transient" };
    }
    // Other 5xx errors are also transient
    if (status !== undefined && status >= 500) {
      return { type: "transient" };
    }
    // 4xx other than 401 — rethrow (likely a bug in our code, e.g., invalid params)
    throw err;
  }

  // ADDITIVE: AI SDK provider errors (Anthropic OR Groq via streamText/generateText)
  // surface as APICallError with a .statusCode. Map the same way as the Anthropic
  // branch above. This does not alter the Anthropic.APIError branch or its tests.
  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    if (status === 401) {
      return { type: "auth_error" };
    }
    if (status === 529 || status === 503 || status === 429) {
      return { type: "transient" };
    }
    if (status !== undefined && status >= 500) {
      return { type: "transient" };
    }
    throw err;
  }

  // Not a recognized provider API error — rethrow for Inngest to handle
  throw err;
}

// ─── Workflow step context ─────────────────────────────────────────────────────

export interface WorkflowStepContext {
  userId: string;
  workflowRunId: string;
  stepId: string;
  automationLevel: "L1" | "L2" | "L3";
  stepDefinition: {
    tool: string;
    input: unknown;
    description?: string;
  };
  query?: string;
}

export interface WorkflowStepResult {
  toolResult: unknown;
  requiresApproval: boolean;
  proposedAction?: unknown;
  costUsd: number;
  /**
   * isError — true when the dispatched ToolResult carried is_error === true.
   * Always false for the deferred (non-dispatched, pre-approval) branch, since
   * no tool call was made. The engine (execute-workflow-run.ts) uses this to
   * mark steps/runs as failed instead of recording a false "success" (WS3).
   */
  isError: boolean;
}

// ─── runWorkflowStep ──────────────────────────────────────────────────────────

/**
 * runWorkflowStep — entry point for durable workflow step execution (02-07).
 *
 * TWO-PASS CONTRACT (WS2 / WS3 fix):
 *   Pass 1 (workflow automationLevel L1/L2 — the propose pass): if the tool
 *     requires approval and has no safe way to preview without writing
 *     (proposeSafe !== true and no extractProposedAction), dispatchTool is
 *     NOT called. A synthetic non-error "deferred_for_approval" ToolResult is
 *     returned instead, so the external write does not happen before a human
 *     sees the approval card (WS2 — previously dispatchTool ran unconditionally
 *     and L2 writes hit Shopify/Gmail before approval).
 *   Pass 2 (automationLevel forced to "L3" by the engine's approved re-dispatch
 *     — see execute-workflow-run.ts `execute-approved-*` step): requiresApproval
 *     is false, so dispatchTool always runs and performs the real write.
 *
 * Cost cap enforcement (T-2-05-02):
 *   'hard' → returns a budget_exhausted error result (caller handles degradation)
 *   'soft' → warning logged; step proceeds
 *
 * @param ctx — WorkflowStepContext
 */
export async function runWorkflowStep(
  ctx: WorkflowStepContext
): Promise<WorkflowStepResult> {
  const agentCtx: AgentContext = {
    userId: ctx.userId,
    automationLevel: ctx.automationLevel,
    workflowRunId: ctx.workflowRunId,
  };

  // 1. Check cost cap BEFORE any LLM call (T-2-05-02)
  const capStatus = await checkCostCap(ctx.userId);
  if (capStatus === "hard") {
    throw Object.assign(
      new Error("Budget exhausted — workflow step cannot proceed"),
      { classification: { type: "budget_exhausted" } }
    );
  }

  // 2. Destructure the tool + input for this step
  const { tool: toolName, input } = ctx.stepDefinition;

  // 3. Load the tool definition and compute approval requirement BEFORE dispatch.
  const registry = getToolDefinitions();
  const toolDef = registry[toolName];
  const requiresApproval = toolDef?.approvalRequired
    ? toolDef.approvalRequired(input, agentCtx)
    : false;

  // canProposeSafely — true when it is safe to call execute() during THIS
  // (possibly pre-approval) pass without risking an external write:
  //   - proposeSafe === true (declared by the tool — see ToolDefinition docs), OR
  //   - extractProposedAction is implemented (implies the tool's propose-phase
  //     ToolResult carries a generated preview, not an external effect).
  const canProposeSafely =
    toolDef?.proposeSafe === true || typeof toolDef?.extractProposedAction === "function";

  let toolResult: ToolResult;
  let isError: boolean;

  if (requiresApproval && !canProposeSafely) {
    // WS2 FIX: do NOT dispatch. This tool has no safe propose branch, so
    // calling execute() here would perform the external write before the
    // human has seen the approval card. Return a synthetic deferred marker —
    // the engine's approved re-dispatch (automationLevel "L3") calls this
    // function again with requiresApproval=false, which DOES dispatch.
    toolResult = {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        phase: "deferred_for_approval",
        tool: toolName,
        input,
      }),
    };
    isError = false;
  } else {
    // Dispatch as before — propose-safe tools generate their preview here
    // (no write); tools that don't require approval execute directly.
    toolResult = await dispatchTool(toolName, input, agentCtx);
    isError = toolResult.is_error === true;
  }

  // 4. Record approximate cost (minimal — this is a single tool dispatch)
  const costUsd = 0.0001; // Minimal overhead for tool dispatch; LLM cost tracked separately
  await recordCost(ctx.userId, costUsd);

  // 5. Compute proposedAction — prefer the tool's extractProposedAction when present.
  //    This lets a tool surface the generated copy (e.g. body_html) as proposedAction
  //    instead of the bare input, so the engine's approval card shows the generated
  //    copy AND the approved re-dispatch arrives with it (no content drift, no double
  //    LLM call). Falls back to the raw input for every existing tool (backward-compat)
  //    and for the deferred (not-safe-to-propose) branch above.
  const proposedAction = requiresApproval
    ? (canProposeSafely && toolDef?.extractProposedAction
        ? toolDef.extractProposedAction(toolResult, input, agentCtx)
        : input)
    : undefined;

  return {
    toolResult,
    requiresApproval,
    proposedAction,
    costUsd,
    isError,
  };
}
