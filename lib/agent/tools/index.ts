/**
 * lib/agent/tools/index.ts
 * Tool registry — aggregates all 11 read + 13 write + 5 meta tools.
 *
 * Exports:
 *   getToolDefinitions()          — returns the full tool registry (name → ToolDefinition)
 *   dispatchTool(name, input, ctx) — validate with Zod → execute → return ToolResult
 *   READ_TOOL_NAMES               — array of 11 read tool names
 *   WRITE_TOOL_NAMES              — array of 13 write tool names
 *   META_TOOL_NAMES               — array of 5 meta tool names
 *
 * SECURITY (T-2-05-01): dispatchTool uses inputSchema.safeParse before calling execute().
 *   Invalid tool input returns a correctable tool_result error — never throws.
 * SECURITY (T-2-05-05): write tools expose approvalRequired(); the caller is responsible
 *   for checking it before calling execute(). The workflow engine (02-07) enforces this.
 *
 * Server-only module. No NEXT_PUBLIC_ env vars.
 */

import { z } from "zod";
import { readTools } from "./read/index";
import { writeTools } from "./write/index";
import { metaTools } from "./meta";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Context passed to every tool execute() and approvalRequired() call.
 * Built by the runtime from the authenticated session + user settings.
 */
export interface AgentContext {
  /** The authenticated user's UUID */
  userId: string;
  /** The user's current automation level for this context ('L1' | 'L2' | 'L3') */
  automationLevel: "L1" | "L2" | "L3";
  /** Optional: the thread ID for chat-originated tool calls */
  threadId?: string;
  /** Optional: the workflow run ID for workflow-originated tool calls */
  workflowRunId?: string;
}

/** Standardized tool result (Anthropic tool_use response shape) */
export interface ToolResult {
  type: "tool_result";
  content: string;
  is_error?: boolean;
}

/** Full tool definition exported from each tool module */
export interface ToolDefinition {
  name: string;
  description: string;
  /** Zod schema for the tool's input — used for validation in dispatchTool */
  inputSchema: z.ZodTypeAny;
  /** Execute the tool — must NOT throw on bad input; returns ToolResult */
  execute(input: unknown, ctx: AgentContext): Promise<ToolResult>;
  /**
   * approvalRequired — returns true if this call needs human approval.
   * Defined on write tools; absent or always-false on read tools.
   * The workflow engine checks this before calling execute().
   */
  approvalRequired?: (input: unknown, ctx: AgentContext) => boolean;
  /**
   * extractProposedAction — optional. When a tool's propose-phase output (e.g.
   * generated copy) must reach the engine's approval preview AND the approved
   * re-dispatch — not just the raw input — implement this to derive the proposed
   * action from the ToolResult.
   *
   * The runtime prefers it over the raw input when computing proposedAction:
   *   proposedAction = toolDef.extractProposedAction(result, input, ctx) ?? input
   *
   * Omit it to keep the default (proposedAction = input). This keeps every
   * existing tool's behavior byte-for-byte unchanged.
   *
   * MUST NOT throw — return input as a fallback on any parse failure.
   */
  extractProposedAction?: (result: ToolResult, input: unknown, ctx: AgentContext) => unknown;
}

// ─── Tool registry ─────────────────────────────────────────────────────────────

type ToolRegistry = Record<string, ToolDefinition | undefined>;

let _registry: ToolRegistry | null = null;

/**
 * getToolDefinitions — returns the full tool registry (name → ToolDefinition).
 *
 * Lazily built on first call and cached. All 24 operational tools + 5 meta tools.
 */
export function getToolDefinitions(): ToolRegistry {
  if (_registry) return _registry;

  _registry = {};
  const allTools = [...readTools, ...writeTools, ...metaTools];
  for (const tool of allTools) {
    _registry[tool.name] = tool;
  }
  return _registry;
}

// ─── Tool name arrays ─────────────────────────────────────────────────────────

/** The exact 11 read tool names (from TECH-SPEC.md §tool-catalog) */
export const READ_TOOL_NAMES: string[] = readTools.map((t) => t.name);

/** The exact 13 write tool names (from TECH-SPEC.md §tool-catalog) */
export const WRITE_TOOL_NAMES: string[] = writeTools.map((t) => t.name);

/** The 5 meta tool names */
export const META_TOOL_NAMES: string[] = metaTools.map((t) => t.name);

// ─── dispatchTool ─────────────────────────────────────────────────────────────

/**
 * dispatchTool — validate input with Zod → execute → return ToolResult.
 *
 * This function NEVER throws. On any error:
 *   - Unknown tool: returns tool_result with is_error=true
 *   - Invalid input: runs inputSchema.safeParse; on failure returns correctable error
 *   - Execute throws: catches and returns tool_result error
 *
 * SECURITY (T-2-05-01): Zod safeParse is the only entry point to execute().
 *   The model's tool call input is untrusted and must be validated before execution.
 *
 * NOTE: dispatchTool does NOT check approvalRequired — that is the responsibility
 * of the runtime (streamChat / runWorkflowStep) or the workflow engine (02-07).
 * This ensures the approval gate is enforced at the right abstraction level.
 *
 * @param name  — tool name from the model's tool_use block
 * @param input — raw tool input from the model (untrusted)
 * @param ctx   — agent context (userId, automationLevel, etc.)
 * @returns ToolResult — always; never throws
 */
export async function dispatchTool(
  name: string,
  input: unknown,
  ctx: AgentContext
): Promise<ToolResult> {
  const registry = getToolDefinitions();
  const tool = registry[name];

  if (!tool) {
    return {
      type: "tool_result",
      is_error: true,
      content: `Unknown tool: "${name}" not found in the tool registry.`,
    };
  }

  // T-2-05-01: Validate with Zod before any execution
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.errors
      .map((e) => `${e.path.join(".") || "input"}: ${e.message}`)
      .join("; ");
    return {
      type: "tool_result",
      is_error: true,
      content: `Tool input validation failed for "${name}". Correct the following and retry: ${errorMsg}`,
    };
  }

  // Execute with validated input
  try {
    return await tool.execute(parsed.data, ctx);
  } catch (err) {
    return {
      type: "tool_result",
      is_error: true,
      content: `Tool "${name}" execution failed: ${String(err)}`,
    };
  }
}

/**
 * getAnthropicToolDefinitions — returns tool definitions in the shape Anthropic expects.
 *
 * Used by streamChat() and runWorkflowStep() when calling anthropic.messages.stream().
 * Read tools are always included. Write tools are included only if the cost cap allows.
 */
export function getAnthropicToolDefinitions(
  includeWriteTools = true
): Array<{ name: string; description: string; input_schema: object }> {
  const tools = includeWriteTools
    ? [...readTools, ...writeTools, ...metaTools]
    : [...readTools, ...metaTools];

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      // Extract JSON schema shape from Zod schema
      ...zodToJsonSchemaShape(tool.inputSchema),
    },
  }));
}

/**
 * Minimal Zod → JSON Schema converter for tool input_schema.
 * Covers the object schemas used by all tool definitions.
 */
function zodToJsonSchemaShape(schema: z.ZodTypeAny): object {
  try {
    // For ZodObject, extract the shape keys as required/optional fields
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape as Record<string, z.ZodTypeAny>;
      const properties: Record<string, object> = {};
      const required: string[] = [];

      for (const [key, fieldSchema] of Object.entries(shape)) {
        properties[key] = { type: "string" }; // simplified — full JSON Schema generation deferred
        const isOptional =
          fieldSchema instanceof z.ZodOptional ||
          fieldSchema instanceof z.ZodDefault;
        if (!isOptional) {
          required.push(key);
        }
      }

      return { properties, required };
    }
    return {};
  } catch {
    return {};
  }
}
