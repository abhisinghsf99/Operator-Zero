"use server";

/**
 * app/app/chat/actions.ts
 * Server Actions for the Conversation surface thread lifecycle.
 *
 * Actions:
 *   createThread(firstMessage)        — create thread, auto-name, inherit brand-voice + memory
 *   renameThread(threadId, newTitle)  — rename an existing thread
 *   listThreads()                     — list threads reverse-chronologically
 *   saveWorkflowFromPlan(messageId)   — reads inline_block_payload → inserts a draft workflow
 *
 * Security:
 *   - All mutations via withUserRls (RLS enforced at DB layer) — T-2-06-01
 *   - userId derived from getClaims() — never from body/params — T-2-05-04
 *   - Zod-validated inputs — return errors, never throw
 *
 * CONV-04: thread auto-name from first message truncation
 * CONV-05: new thread inherits brand_voice + memory via agent_context; no message history
 */

import { createClient } from "@/lib/auth/server";
import {
  withUserRls,
  threads,
  messages,
  workflows,
  workflowVersions,
} from "@/lib/db";
import { eq, desc, isNull, and } from "drizzle-orm";
import { z } from "zod";
import { toClientError } from "@/lib/errors";

// ─── Input schemas ─────────────────────────────────────────────────────────────

const createThreadSchema = z.object({
  firstMessage: z.string().min(1).max(8000),
});

const renameThreadSchema = z.object({
  threadId: z.string().uuid("threadId must be a UUID"),
  newTitle: z.string().min(1).max(256),
});

const saveWorkflowFromPlanSchema = z.object({
  messageId: z.string().uuid("messageId must be a UUID"),
});

// ─── Auto-name helper ─────────────────────────────────────────────────────────

/**
 * Auto-name a thread from the first message.
 * Truncates to 60 chars + "…" if needed.
 * Fast-path — no LLM call required for thread naming.
 * (CONV-04)
 */
function autoNameThread(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 60).trim() + "…";
}

// ─── createThread ─────────────────────────────────────────────────────────────

/**
 * createThread — create a new conversation thread.
 *
 * Auto-names from firstMessage (truncated, no LLM call — CONV-04).
 * The thread is created with agent_context='orchestrator' — brand voice and memory
 * are inherited at runtime when the system prompt is assembled (CONV-05).
 * No message history is seeded — new threads start fresh (CONV-05).
 *
 * Returns { threadId } on success or { error } on failure.
 */
export async function createThread(
  firstMessage: string
): Promise<{ threadId: string } | { error: string }> {
  const parsed = createThreadSchema.safeParse({ firstMessage });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "invalid input" };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) return { error: "unauthenticated" };

  const userId = claims.sub as string;
  const title = autoNameThread(parsed.data.firstMessage);

  try {
    const [row] = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .insert(threads)
        .values({
          user_id: userId,
          title,
          agent_context: "orchestrator",
          last_message_at: new Date(),
        })
        .returning();
    }) as Array<{ id: string }>;

    return { threadId: row?.id ?? "" };
  } catch (err) {
    return { error: toClientError(err, "createThread") };
  }
}

// ─── openWorkflowInChat ───────────────────────────────────────────────────────

const openWorkflowInChatSchema = z.object({
  workflowId: z.string().uuid("workflowId must be a UUID"),
  workflowName: z.string().min(1).max(256),
});

/**
 * openWorkflowInChat — create a new scoped thread with context_workflow_id set.
 *
 * D-06/WF-12: "Open in Chat" opens a scoped Conversation thread pre-loaded
 * with the workflow's context. The thread's context_workflow_id FK tells the
 * system prompt assembler which workflow to pre-load.
 *
 * Security: withUserRls enforces user_id ownership; workflowId is UUID-validated.
 *
 * Returns { threadId } on success or { error } on failure.
 */
export async function openWorkflowInChat(
  workflowId: string,
  workflowName: string
): Promise<{ threadId: string } | { error: string }> {
  const parsed = openWorkflowInChatSchema.safeParse({ workflowId, workflowName });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "invalid input" };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) return { error: "unauthenticated" };

  const userId = claims.sub as string;
  const title = autoNameThread(`Workflow: ${parsed.data.workflowName}`);

  try {
    const [row] = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .insert(threads)
        .values({
          user_id: userId,
          title,
          agent_context: "orchestrator",
          context_workflow_id: parsed.data.workflowId,
          last_message_at: new Date(),
        })
        .returning();
    }) as Array<{ id: string }>;

    return { threadId: row?.id ?? "" };
  } catch (err) {
    return { error: toClientError(err, "openWorkflowInChat") };
  }
}

// ─── renameThread ─────────────────────────────────────────────────────────────

/**
 * renameThread — rename an existing thread title.
 *
 * Returns { ok: true } on success or { error } on failure.
 */
export async function renameThread(
  threadId: string,
  newTitle: string
): Promise<{ ok: true } | { error: string }> {
  const parsed = renameThreadSchema.safeParse({ threadId, newTitle });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "invalid input" };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) return { error: "unauthenticated" };

  try {
    await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .update(threads)
        .set({ title: parsed.data.newTitle })
        .where(eq(threads.id, parsed.data.threadId));
    });

    return { ok: true };
  } catch (err) {
    return { error: toClientError(err, "renameThread") };
  }
}

// ─── listThreads ─────────────────────────────────────────────────────────────

export type ThreadListItem = {
  id: string;
  title: string | null;
  last_message_at: Date | null;
  created_at: Date;
};

/**
 * listThreads — list user's threads reverse-chronologically.
 *
 * Returns threads sorted by last_message_at DESC (most recently active first).
 * Archived threads (archived_at IS NOT NULL) are excluded.
 * (CONV-04)
 */
export async function listThreads(): Promise<
  { threads: ThreadListItem[] } | { error: string }
> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) return { error: "unauthenticated" };

  try {
    const rows = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .select({
          id: threads.id,
          title: threads.title,
          last_message_at: threads.last_message_at,
          created_at: threads.created_at,
        })
        .from(threads)
        .where(isNull(threads.archived_at))
        .orderBy(desc(threads.last_message_at));
    }) as ThreadListItem[];

    return { threads: rows };
  } catch (err) {
    return { error: toClientError(err, "listThreads") };
  }
}

// ─── saveWorkflowFromPlan ────────────────────────────────────────────────────

/**
 * saveWorkflowFromPlan — read inline_block_payload from a message and insert
 * a draft workflow + initial version row.
 *
 * Called when the user clicks "Save as Workflow" on the inline WorkflowVisualizer.
 * The payload from propose_workflow_plan is used to seed the workflow definition.
 *
 * Returns { workflowId } on success or { error } on failure.
 */
export async function saveWorkflowFromPlan(
  messageId: string
): Promise<{ workflowId: string } | { error: string }> {
  const parsed = saveWorkflowFromPlanSchema.safeParse({ messageId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "invalid input" };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) return { error: "unauthenticated" };

  const userId = claims.sub as string;

  try {
    // 1. Load the message (RLS ensures it belongs to this user)
    const msgRows = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .select({
          id: messages.id,
          inline_block_type: messages.inline_block_type,
          inline_block_payload: messages.inline_block_payload,
          user_id: messages.user_id,
        })
        .from(messages)
        .where(
          and(
            eq(messages.id, parsed.data.messageId),
            eq(messages.user_id, userId)
          )
        );
    }) as Array<{
      id: string;
      inline_block_type: string | null;
      inline_block_payload: unknown;
      user_id: string;
    }>;

    const msg = msgRows[0];
    if (!msg) {
      return { error: "message not found" };
    }

    if (msg.inline_block_type !== "workflow_plan") {
      return { error: "message does not contain a workflow plan" };
    }

    const plan = msg.inline_block_payload as {
      name: string;
      description?: string;
      trigger_type?: string;
      steps?: Array<{ id: string; name: string; tool: string; description?: string }>;
      automation_level?: string;
    };

    if (!plan?.name) {
      return { error: "workflow plan payload is missing required fields" };
    }

    // Map the proposal's trigger vocabulary to the workflow column vocabulary.
    // propose_workflow_plan emits: manual | scheduled | webhook | ai_suggested
    // workflows.trigger_type accepts: schedule | event | manual
    const triggerTypeMap: Record<string, "schedule" | "event" | "manual"> = {
      manual: "manual",
      scheduled: "schedule",
      webhook: "event",
      ai_suggested: "manual",
    };
    const resolvedTriggerType: "schedule" | "event" | "manual" =
      triggerTypeMap[plan.trigger_type ?? "manual"] ?? "manual";

    // 2. Insert workflow row (status='draft')
    const [workflowRow] = await withUserRls(
      claims as Record<string, unknown>,
      async (tx) => {
        return tx
          .insert(workflows)
          .values({
            user_id: userId,
            name: plan.name,
            description: plan.description ?? null,
            automation_level: (plan.automation_level as "L1" | "L2" | "L3") ?? "L2",
            status: "draft",
            trigger_type: resolvedTriggerType,
          })
          .returning();
      }
    ) as Array<{ id: string }>;

    const workflowId = workflowRow?.id;
    if (!workflowId) {
      return { error: "failed to create workflow" };
    }

    // 3. Insert initial workflow version + update current_version_id atomically.
    // CR-02: workflows.current_version_id MUST be set after inserting the version row,
    // otherwise executeWorkflowRun throws "Workflow has no current_version_id".
    const definition = {
      steps: plan.steps ?? [],
      version: 1,
      source_message_id: messageId,
    };

    await withUserRls(claims as Record<string, unknown>, async (tx) => {
      const [versionRow] = await tx
        .insert(workflowVersions)
        .values({
          workflow_id: workflowId,
          version_number: 1,
          definition,
        })
        .returning();

      if (!versionRow?.id) {
        throw new Error("failed to create workflow version");
      }

      // Set current_version_id on the workflow row (scoped by user_id for safety)
      await tx
        .update(workflows)
        .set({ current_version_id: versionRow.id })
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.user_id, userId)
          )
        );

      return versionRow;
    });

    return { workflowId };
  } catch (err) {
    return { error: toClientError(err, "saveWorkflowFromPlan") };
  }
}
