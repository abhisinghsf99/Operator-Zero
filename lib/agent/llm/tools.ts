/**
 * lib/agent/llm/tools.ts
 * Adapter: existing tool registry → Vercel AI SDK tool() definitions.
 *
 * getAiSdkTools(includeWriteTools, ctx, opts) wraps each registry ToolDefinition as an
 * AI SDK tool() whose execute delegates to dispatchTool — preserving the existing
 * Zod safeParse validation (T-2-05-01) and the never-throws correctable-error
 * contract. This retires the old lossy Zod-to-JSON-Schema shim (removed in
 * WS12 — it advertised every param as `string`) by feeding the model the
 * REAL Zod schema.
 *
 * SECURITY (T-ebw-01): MUST be called per-request with the request's AgentContext
 * captured in the closure below — NEVER memoized at module scope. A module-level
 * singleton would execute one user's tools under another user's identity.
 *
 * opts.writeTools (WS7.13 / D-1): "all" (default) keeps the workflow engine's tool
 * set byte-for-byte unchanged — every write tool is available. "propose-safe"
 * restricts write tools to those with `proposeSafe === true` (the three
 * shopify_optimize_* / shopify_propose_restock tools). Rationale: the chat route
 * hardcodes automationLevel "L2" and dispatchTool never enforces approval, so any
 * other write tool would hit Shopify/Gmail with no card in front of it. The
 * propose-safe tools return a generated proposal at L2 without writing — exactly
 * the behavior the chat surface needs. Anything requiring a real write must go
 * through propose_workflow_plan → Save as workflow → Run.
 *
 * opts.excludeTools (WS12 / D-2): removes named tools from every group after the
 * writeTools filter runs. Used by the chat route to drop ask_user_clarification —
 * the route only renders workflow_plan/preview inline blocks, so a clarification
 * tool call would be a dead end; the prompt guardrails tell the agent to ask
 * clarifying questions in plain text instead.
 *
 * Server-only module. No NEXT_PUBLIC_ env vars.
 */
import { tool, type Tool } from "ai";
import {
  getToolDefinitions,
  dispatchTool,
  READ_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  META_TOOL_NAMES,
  type AgentContext,
  type ToolDefinition,
} from "@/lib/agent/tools/index";

/**
 * getAiSdkTools — build the AI SDK `tools` map for one request.
 *
 * Read tools + meta tools are always included; write tools only when
 * includeWriteTools is true (cost-cap "hard" strips them).
 *
 * Each tool's execute delegates to dispatchTool(name, args, ctx). The returned
 * ToolResult ({ type, content, is_error? }) becomes the AI SDK tool-result part's
 * `output`, so the chat route's JSON.parse(output.content) still works unchanged.
 *
 * @param includeWriteTools — include write tools (false on hard cost cap)
 * @param ctx — the per-request AgentContext; captured in the execute closure
 * @param opts.writeTools — "all" (default, byte-for-byte unchanged) or
 *   "propose-safe" (D-1: only registry entries with proposeSafe === true)
 * @param opts.excludeTools — tool names removed from the final set regardless of
 *   group (D-2: used to drop ask_user_clarification from the chat toolset)
 */
export function getAiSdkTools(
  includeWriteTools: boolean,
  ctx: AgentContext,
  opts?: { writeTools?: "all" | "propose-safe"; excludeTools?: string[] }
): Record<string, Tool> {
  const registry = getToolDefinitions();
  const writeToolsMode = opts?.writeTools ?? "all";
  const excludeTools = opts?.excludeTools ?? [];

  const writeNames =
    writeToolsMode === "propose-safe"
      ? WRITE_TOOL_NAMES.filter((name) => registry[name]?.proposeSafe === true)
      : WRITE_TOOL_NAMES;

  const names = (
    includeWriteTools
      ? [...READ_TOOL_NAMES, ...META_TOOL_NAMES, ...writeNames]
      : [...READ_TOOL_NAMES, ...META_TOOL_NAMES]
  ).filter((name) => !excludeTools.includes(name));

  const tools: Record<string, Tool> = {};

  for (const name of names) {
    const toolDef: ToolDefinition | undefined = registry[name];
    if (!toolDef) continue;

    tools[name] = tool({
      description: toolDef.description,
      // Feed the model the real Zod schema (FlexibleSchema accepts ZodSchema).
      inputSchema: toolDef.inputSchema,
      // ctx captured in the closure — per-request, never a singleton (T-ebw-01).
      // dispatchTool re-runs the Zod safeParse and never throws, returning a
      // correctable ToolResult on error (T-ebw-02). capToolResult trims oversized
      // payloads so the agentic loop stays within Groq's free-tier token budget.
      execute: async (args: unknown) => capToolResult(await dispatchTool(name, args, ctx)),
    });
  }

  return tools;
}

/**
 * Max characters of a tool-result payload fed back to the model. Groq's free
 * tier caps at 8000 tokens/min, and the agentic loop re-sends every prior tool
 * result on each step — large Shopify list/inventory dumps blew past the cap and
 * the model returned nothing ("thinks but doesn't respond"). ~2000 chars ≈ 500
 * tokens keeps results small while leaving enough for the model to answer.
 */
const TOOL_RESULT_MAX_CHARS = 2000;

type DispatchResult = Awaited<ReturnType<typeof dispatchTool>>;

/**
 * Truncate an oversized stringified tool result before it re-enters the model
 * context. Inline-block payloads (e.g. workflow_plan) are preserved untouched —
 * the chat route JSON.parses them to render the visualizer, so truncating would
 * break it.
 */
function capToolResult(res: DispatchResult): DispatchResult {
  const content = (res as { content?: unknown }).content;
  if (typeof content !== "string" || content.length <= TOOL_RESULT_MAX_CHARS) {
    return res;
  }
  try {
    if (JSON.parse(content)?.inline_block_type) return res; // keep inline blocks whole
  } catch {
    /* not JSON — safe to truncate */
  }
  return {
    ...res,
    content:
      content.slice(0, TOOL_RESULT_MAX_CHARS) +
      "\n…[result truncated to fit the model context budget]",
  };
}
