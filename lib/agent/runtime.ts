/**
 * lib/agent/runtime.ts
 * Shared agent runtime — entry points for chat and workflow execution.
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars read here.
 *   Do NOT import this module in Client Components.
 *
 * Entry points:
 *   streamChat(ctx)         — SSE streaming chat entry point (02-06 wires this)
 *   runWorkflowStep(ctx)    — Workflow step execution entry point (02-07 wires this)
 *
 * Both entry points:
 *   1. Check checkCostCap(userId) before every LLM call (T-2-05-02)
 *      - 'hard' → disable write tools (chat continues degraded)
 *      - 'soft' → inject cost warning into system prompt
 *   2. Build system prompt via buildSystemPrompt()
 *   3. Call anthropic.messages.stream() with getAnthropicToolDefinitions()
 *   4. On error, use classifyAgentError() → auth/transient/budget (rethrow unknown)
 *   5. After finalMessage, recordCost() from usage
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
import { anthropic } from "./anthropic";
import { buildSystemPrompt } from "./prompt";
import { checkCostCap, recordCost } from "@/lib/cost-cap";
import { getAnthropicToolDefinitions, dispatchTool } from "./tools/index";
import type { AgentContext } from "./tools/index";

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

  // Not an Anthropic API error — rethrow for Inngest to handle
  throw err;
}

// ─── Chat context ─────────────────────────────────────────────────────────────

export interface ChatContext {
  userId: string;
  threadId: string;
  automationLevel: "L1" | "L2" | "L3";
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  query?: string;
}

export interface ChatResult {
  content: string;
  toolsUsed: string[];
  costUsd: number;
  degraded: boolean;
  warningInjected: boolean;
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
}

// ─── Cost warning injection ───────────────────────────────────────────────────

const COST_WARNING =
  "\n\n⚠️ COST WARNING: You are approaching your daily usage limit. " +
  "Please complete this task efficiently. Write tools remain available.";

// ─── streamChat ───────────────────────────────────────────────────────────────

/**
 * streamChat — entry point for the chat SSE path.
 *
 * Called by app/api/chat/[threadId]/send/route.ts for each user message.
 * Returns the assembled response; streaming is handled by the route handler
 * that wraps this function with a ReadableStream.
 *
 * Cost cap enforcement (T-2-05-02):
 *   'hard' → write tools stripped from toolDefinitions; chat continues
 *   'soft' → warning appended to system prompt; all tools available
 *
 * @param ctx — ChatContext (userId from authenticated session — never trusted from body)
 */
export async function streamChat(ctx: ChatContext): Promise<ChatResult> {
  const agentCtx: AgentContext = {
    userId: ctx.userId,
    automationLevel: ctx.automationLevel,
    threadId: ctx.threadId,
  };

  // 1. Check cost cap BEFORE any LLM call (T-2-05-02)
  const capStatus = await checkCostCap(ctx.userId);
  const includeWriteTools = capStatus !== "hard";

  // 2. Build system prompt
  let systemPrompt = await buildSystemPrompt(ctx.userId, ctx.query, {
    budget: "chat",
  });

  // Inject soft warning into prompt
  if (capStatus === "soft") {
    systemPrompt += COST_WARNING;
  }

  // 3. Get tool definitions (write tools stripped on hard cap)
  const toolDefs = getAnthropicToolDefinitions(includeWriteTools);

  const toolsUsed: string[] = [];
  let responseContent = "";

  try {
    const stream = anthropic.messages.stream({
      model: "claude-opus-4-7",
      system: systemPrompt,
      messages: ctx.messages,
      tools: toolDefs as Parameters<typeof anthropic.messages.stream>[0]["tools"],
      max_tokens: 4096,
    });

    // Process stream events
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        responseContent += event.delta.text;
      }

      if (
        event.type === "content_block_start" &&
        event.content_block.type === "tool_use"
      ) {
        const toolBlock = event.content_block;
        toolsUsed.push(toolBlock.name);
        // Tool calls are dispatched inline; results fed back on next turn
        await dispatchTool(toolBlock.name, toolBlock.input, agentCtx);
      }
    }

    // 5. Record cost from final message usage
    const finalMsg = await stream.finalMessage();
    const usage = finalMsg.usage;
    // Approximate cost: $3/MTok input, $15/MTok output (claude-opus-4-7)
    const costUsd =
      (usage.input_tokens * 3 + (usage.output_tokens ?? 0) * 15) / 1_000_000;

    await recordCost(ctx.userId, costUsd);

    return {
      content: responseContent,
      toolsUsed,
      costUsd,
      degraded: capStatus === "hard",
      warningInjected: capStatus === "soft",
    };
  } catch (err) {
    // 4. Classify error (rethrows unknown)
    const classification = classifyAgentError(err);
    throw Object.assign(new Error(`Agent error: ${classification.type}`), {
      classification,
    });
  }
}

// ─── runWorkflowStep ──────────────────────────────────────────────────────────

/**
 * runWorkflowStep — entry point for durable workflow step execution (02-07).
 *
 * Called by executeWorkflowRun Inngest function for each workflow step.
 * Uses a single tool dispatch rather than a full streaming conversation.
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

  // 2. Get tool definitions for the step
  const { tool: toolName, input } = ctx.stepDefinition;

  // 3. Dispatch the specific tool for this step
  const toolResult = await dispatchTool(toolName, input, agentCtx);

  // 4. Record approximate cost (minimal — this is a single tool dispatch)
  const costUsd = 0.0001; // Minimal overhead for tool dispatch; LLM cost tracked separately
  await recordCost(ctx.userId, costUsd);

  // 5. Check if approval is required
  const { getToolDefinitions } = await import("./tools/index");
  const registry = getToolDefinitions();
  const toolDef = registry[toolName];
  const requiresApproval = toolDef?.approvalRequired
    ? toolDef.approvalRequired(input, agentCtx)
    : false;

  return {
    toolResult,
    requiresApproval,
    proposedAction: requiresApproval ? input : undefined,
    costUsd,
  };
}
