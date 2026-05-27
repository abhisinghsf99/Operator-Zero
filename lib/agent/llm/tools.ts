/**
 * lib/agent/llm/tools.ts
 * Adapter: existing tool registry → Vercel AI SDK tool() definitions.
 *
 * getAiSdkTools(includeWriteTools, ctx) wraps each registry ToolDefinition as an
 * AI SDK tool() whose execute delegates to dispatchTool — preserving the existing
 * Zod safeParse validation (T-2-05-01) and the never-throws correctable-error
 * contract. This retires the lossy zodToJsonSchemaShape (which advertised every
 * param as `string`) by feeding the model the REAL Zod schema.
 *
 * SECURITY (T-ebw-01): MUST be called per-request with the request's AgentContext
 * captured in the closure below — NEVER memoized at module scope. A module-level
 * singleton would execute one user's tools under another user's identity.
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
 */
export function getAiSdkTools(
  includeWriteTools: boolean,
  ctx: AgentContext
): Record<string, Tool> {
  const registry = getToolDefinitions();

  const names = includeWriteTools
    ? [...READ_TOOL_NAMES, ...META_TOOL_NAMES, ...WRITE_TOOL_NAMES]
    : [...READ_TOOL_NAMES, ...META_TOOL_NAMES];

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
      // correctable ToolResult on error (T-ebw-02).
      execute: (args: unknown) => dispatchTool(name, args, ctx),
    });
  }

  return tools;
}
