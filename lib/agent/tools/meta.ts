/**
 * lib/agent/tools/meta.ts
 * Meta tools for the Operator Zero agent runtime.
 *
 * Meta tools:
 *   1. record_memory_item       — agent stores something durable
 *   2. update_memory_item       — update an existing memory item (re-embeds)
 *   3. soft_delete_memory_item  — soft-delete a memory item
 *   4. propose_workflow_plan    — emit an inline_block_payload with the plan
 *   5. ask_user_clarification   — request clarification from the user
 *
 * Meta tools have no approval gate (they are always safe — they don't write to
 * external systems). Memory operations are storage-only; workflow proposals are
 * informational until the user saves them.
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars.
 * SECURITY (T-2-05-04): all memory writes are user-scoped.
 */

import { z } from "zod";
import type { AgentContext, ToolResult, ToolDefinition } from "./index";
import { formatZodError } from "./read/index";
import {
  storeMemoryItem,
  updateMemoryItem,
  softDeleteMemoryItem,
} from "@/lib/agent/memory";

// ─── Tool: record_memory_item ─────────────────────────────────────────────────

const recordMemoryItemSchema = z.object({
  content: z.string().min(1, "content is required"),
  category: z
    .enum(["brand", "catalog", "policy", "preference", "decision_history"])
    .default("preference"),
});

export const recordMemoryItemTool: ToolDefinition = {
  name: "record_memory_item",
  description:
    "Store a durable memory item about the store, user preferences, or decisions. This is automatically embedded for semantic recall.",
  inputSchema: recordMemoryItemSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = recordMemoryItemSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const { id } = await storeMemoryItem(
      ctx.userId,
      parsed.data.content,
      parsed.data.category
    );
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({ ok: true, id, message: "Memory item stored." }),
    };
  },
};

// ─── Tool: update_memory_item ─────────────────────────────────────────────────

const updateMemoryItemSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
  content: z.string().min(1, "content is required"),
});

export const updateMemoryItemTool: ToolDefinition = {
  name: "update_memory_item",
  description: "Update an existing memory item by ID. The content is re-embedded automatically.",
  inputSchema: updateMemoryItemSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = updateMemoryItemSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    await updateMemoryItem(ctx.userId, parsed.data.id, parsed.data.content);
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({ ok: true, message: "Memory item updated." }),
    };
  },
};

// ─── Tool: soft_delete_memory_item ───────────────────────────────────────────

const softDeleteMemoryItemSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export const softDeleteMemoryItemTool: ToolDefinition = {
  name: "soft_delete_memory_item",
  description:
    "Soft-delete a memory item by ID. The item is excluded from recall queries but retained for 24 hours before hard deletion.",
  inputSchema: softDeleteMemoryItemSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = softDeleteMemoryItemSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    await softDeleteMemoryItem(ctx.userId, parsed.data.id);
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({ ok: true, message: "Memory item soft-deleted." }),
    };
  },
};

// ─── Tool: propose_workflow_plan ──────────────────────────────────────────────

const proposeWorkflowPlanSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().min(1, "description is required"),
  trigger_type: z
    .enum(["manual", "scheduled", "webhook", "ai_suggested"])
    .default("manual"),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      tool: z.string().min(1),
      description: z.string().optional(),
    })
  ),
  automation_level: z.enum(["L1", "L2", "L3"]).default("L2"),
});

export const proposeWorkflowPlanTool: ToolDefinition = {
  name: "propose_workflow_plan",
  description:
    "Propose a workflow plan to the user. The plan is displayed as an inline block in the chat thread with a 'Save as Workflow' action.",
  inputSchema: proposeWorkflowPlanSchema,
  async execute(input, _ctx: AgentContext): Promise<ToolResult> {
    const parsed = proposeWorkflowPlanSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    // Emit the plan as an inline_block_payload — the chat route handler will
    // persist this to messages.inline_block_payload and messages.inline_block_type='workflow_plan'
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        inline_block_type: "workflow_plan",
        inline_block_payload: {
          name: parsed.data.name,
          description: parsed.data.description,
          trigger_type: parsed.data.trigger_type,
          steps: parsed.data.steps,
          automation_level: parsed.data.automation_level,
          proposed_at: new Date().toISOString(),
        },
        message:
          "Workflow plan proposed. The user can save it from the inline block in the chat.",
      }),
    };
  },
};

// ─── Tool: ask_user_clarification ────────────────────────────────────────────

const askUserClarificationSchema = z.object({
  question: z.string().min(1, "question is required"),
  context: z.string().optional(),
  options: z.array(z.string()).optional(),
});

export const askUserClarificationTool: ToolDefinition = {
  name: "ask_user_clarification",
  description:
    "Ask the user a clarification question before proceeding. Use this when there is genuine ambiguity that the user should resolve.",
  inputSchema: askUserClarificationSchema,
  async execute(input, _ctx: AgentContext): Promise<ToolResult> {
    const parsed = askUserClarificationSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        awaiting_clarification: true,
        question: parsed.data.question,
        context: parsed.data.context,
        options: parsed.data.options,
      }),
    };
  },
};

// ─── Export all meta tools ────────────────────────────────────────────────────

export const metaTools: ToolDefinition[] = [
  recordMemoryItemTool,
  updateMemoryItemTool,
  softDeleteMemoryItemTool,
  proposeWorkflowPlanTool,
  askUserClarificationTool,
];
