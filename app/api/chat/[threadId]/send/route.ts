/**
 * app/api/chat/[threadId]/send/route.ts
 * SSE streaming Route Handler for the chat surface.
 *
 * Streams Anthropic model output to the browser as Server-Sent Events.
 * MUST be a Route Handler — NOT Inngest. Routing chat through Inngest breaks streaming.
 * (RESEARCH critical signal #2; CONV-01)
 *
 * Flow:
 *   1. Auth: getClaims() → 401 if missing
 *   2. Rate limit: chatRateLimit.limit(userId) → 429 before any LLM call (T-2-06-03/04)
 *   3. Thread ownership validated via RLS + explicit user_id check (T-2-06-01)
 *   4. Persist user message
 *   5. Insert assistant placeholder: status='streaming' (CONV-09)
 *   6. Stream from Anthropic SDK, pumping deltas into ReadableStream as SSE events
 *   7. Handle tool_use inline (propose_workflow_plan, record_memory_item)
 *   8. Finalize: update assistant message → status='complete', recordCost
 *
 * SECURITY:
 *   T-2-06-01 (thread ownership): validated via RLS + explicit user_id filter
 *   T-2-06-03 (flooding): chatRateLimit before LLM call
 *   T-2-06-04 (unauthenticated): getClaims().sub required; 401 otherwise
 *
 * NEXT.JS 15: route params are Promises — `const { threadId } = await params`
 */

import { createClient } from "@/lib/auth/server";
import { chatRateLimit } from "@/lib/rate-limit";
import { withUserRls, threads, messages, workflows, workflowVersions } from "@/lib/db";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { checkCostCap, recordCost } from "@/lib/cost-cap";
import { getAnthropicToolDefinitions, dispatchTool } from "@/lib/agent/tools/index";
import { anthropic } from "@/lib/agent/anthropic";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { z } from "zod";

// Anthropic message param type for multi-turn tool loops
type AnthropicMessage = Anthropic.MessageParam;

// ─── Route config ─────────────────────────────────────────────────────────────

/** Must be force-dynamic to prevent Next.js caching SSE responses */
export const dynamic = "force-dynamic";
/** Extended timeout — streaming chats can run for ~60s */
export const maxDuration = 60;

// ─── Input validation ─────────────────────────────────────────────────────────

const sendBodySchema = z.object({
  message: z.string().min(1, "message is required").max(8000, "message too long"),
});

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  // 1. Auth — getClaims() re-validates the JWT signature (T-2-06-04)
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  if (!claims?.sub) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = claims.sub as string;

  // 2. Rate limit BEFORE any LLM call (T-2-06-03)
  const { success: rateLimitOk } = await chatRateLimit.limit(userId);
  if (!rateLimitOk) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Await params (Next.js 15 — params are Promises; Pitfall 4)
  const { threadId } = await params;

  // 4. Validate request body
  let body: { message: string };
  try {
    const raw = await req.json();
    const parsed = sendBodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.errors[0]?.message ?? "invalid input" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    body = parsed.data;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 5. Validate thread ownership via withUserRls + explicit check (T-2-06-01)
  let threadRow: { id: string; user_id: string; agent_context: string } | null = null;
  try {
    const rows = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .select()
        .from(threads)
        .where(eq(threads.id, threadId));
    });
    threadRow = (rows as Array<{ id: string; user_id: string; agent_context: string }>)[0] ?? null;
  } catch {
    return new Response(JSON.stringify({ error: "thread lookup failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!threadRow) {
    return new Response(JSON.stringify({ error: "thread not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Belt-and-suspenders: even if RLS allowed, verify at app level (T-2-06-01)
  if (threadRow.user_id !== userId) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 6. Load prior messages for this thread (last 20 for token budget)
  let priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  try {
    const msgRows = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .select()
        .from(messages)
        .where(eq(messages.thread_id, threadId));
    }) as Array<{ role: string; content: string | null; status: string }>;

    priorMessages = msgRows
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => m.status === "complete")
      .slice(-20)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content ?? "",
      }));
  } catch {
    // Non-fatal: proceed with empty history
    priorMessages = [];
  }

  // 7. Persist user message
  let userMsgId: string | null = null;
  try {
    const [userMsg] = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .insert(messages)
        .values({
          thread_id: threadId,
          user_id: userId,
          role: "user",
          content: body.message,
          status: "complete",
        })
        .returning();
    }) as Array<{ id: string }>;
    userMsgId = userMsg?.id ?? null;
  } catch (persistErr) {
    // Non-fatal — continue even if persist fails, but log for observability (IN-03)
    console.error(JSON.stringify({
      level: "error",
      event: "chat.persist_user_message_failed",
      threadId,
      error: persistErr instanceof Error ? persistErr.message : "unknown",
      timestamp: new Date().toISOString(),
    }));
  }
  void userMsgId; // suppress unused var warning

  // 8. Insert assistant placeholder with status='streaming' (CONV-09)
  let assistantMsgId: string | null = null;
  try {
    const [asstMsg] = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .insert(messages)
        .values({
          thread_id: threadId,
          user_id: userId,
          role: "assistant",
          content: "",
          status: "streaming",
          model_id: "claude-opus-4-7",
        })
        .returning();
    }) as Array<{ id: string }>;
    assistantMsgId = asstMsg?.id ?? null;
  } catch (placeholderErr) {
    // Non-fatal but log for observability (IN-03)
    console.error(JSON.stringify({
      level: "error",
      event: "chat.persist_assistant_placeholder_failed",
      threadId,
      error: placeholderErr instanceof Error ? placeholderErr.message : "unknown",
      timestamp: new Date().toISOString(),
    }));
  }

  // 9. Cost cap check (T-2-05-02) and system prompt
  // Belt-and-suspenders: wrap both calls so a transient failure (e.g. DB blip on
  // cost-cap, or a Voyage 429 that slips past safeRecallMemory) cannot hard-500
  // a normal chat message — the user MUST always get a streamed reply.
  let capStatus: string = "ok";
  try {
    capStatus = await checkCostCap(userId);
  } catch (capErr) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "chat.cost_cap_check_failed",
        error: String(capErr),
        timestamp: new Date().toISOString(),
      })
    );
    // Default to non-"hard" so write tools remain available
    capStatus = "ok";
  }
  const includeWriteTools = capStatus !== "hard";

  const allMessages = [
    ...priorMessages,
    { role: "user" as const, content: body.message },
  ];

  const MINIMAL_SYSTEM_PROMPT =
    "You are Operator Zero — an autonomous agent that runs the day-to-day operations of a Shopify store on behalf of the store owner. Answer helpfully and concisely.";

  let systemPrompt: string = MINIMAL_SYSTEM_PROMPT;
  try {
    systemPrompt = await buildSystemPrompt(userId, body.message, {
      budget: "chat",
    });
  } catch (promptErr) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "chat.system_prompt_failed",
        error: String(promptErr),
        timestamp: new Date().toISOString(),
      })
    );
    // Fall back to minimal static prompt — stream still starts
  }
  const toolDefs = getAnthropicToolDefinitions(includeWriteTools);

  // 10. Build the SSE ReadableStream — pump Anthropic deltas as SSE events
  const encoder = new TextEncoder();
  let accumulatedContent = "";
  let inlineBlockType: string | null = null;
  let inlineBlockPayload: unknown = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agentCtx = {
          userId,
          automationLevel: "L2" as const,
          threadId,
        };

        // ── Agentic tool loop (CR-05) ───────────────────────────────────────────
        // Run the model, collect tool_use blocks, dispatch each, append tool_result
        // user turn, re-invoke. Bounded by MAX_TOOL_ITERATIONS to prevent runaway.
        const MAX_TOOL_ITERATIONS = 5;
        let currentMessages: AnthropicMessage[] = allMessages.map(m => ({
          role: m.role,
          content: m.content,
        }));
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const anthropicStream = anthropic.messages.stream({
            model: "claude-opus-4-7",
            system: systemPrompt,
            messages: currentMessages,
            tools: toolDefs as Parameters<typeof anthropic.messages.stream>[0]["tools"],
            max_tokens: 4096,
          });

          // Collect tool_use blocks from this iteration
          const pendingToolUses: Array<{ id: string; name: string; input: unknown }> = [];
          const assistantContentBlocks: Array<unknown> = [];

          for await (const event of anthropicStream) {
            // Text delta — only stream on the final turn (no tool requests)
            // We forward text during every turn; the model's final turn has no tool_use.
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              accumulatedContent += event.delta.text;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
                )
              );
            }

            // Capture completed tool_use blocks
            if (
              event.type === "content_block_stop"
            ) {
              // Handled below via finalMessage
            }
          }

          const finalMsg = await anthropicStream.finalMessage();
          totalInputTokens += finalMsg.usage.input_tokens;
          totalOutputTokens += (finalMsg.usage as { output_tokens?: number }).output_tokens ?? 0;

          // Collect tool_use content blocks from this turn's response
          for (const block of finalMsg.content) {
            assistantContentBlocks.push(block);
            if (block.type === "tool_use") {
              pendingToolUses.push({
                id: block.id,
                name: block.name,
                input: block.input,
              });
            }
          }

          // If model made no tool calls, we're done
          if (pendingToolUses.length === 0) {
            break;
          }

          // Dispatch all tool calls and collect results
          const toolResultContents: Array<{
            type: "tool_result";
            tool_use_id: string;
            content: string;
          }> = [];

          for (const tu of pendingToolUses) {
            try {
              const toolResult = await dispatchTool(tu.name, tu.input, agentCtx);

              // Check if tool result embeds an inline block (propose_workflow_plan)
              if (toolResult && toolResult.content) {
                try {
                  const parsed = JSON.parse(toolResult.content);
                  if (parsed.inline_block_type === "workflow_plan") {
                    inlineBlockType = "workflow_plan";
                    inlineBlockPayload = parsed.inline_block_payload;
                    // Emit SSE event so client can render the visualizer
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          inline_block_type: inlineBlockType,
                          inline_block_payload: inlineBlockPayload,
                        })}\n\n`
                      )
                    );
                  }
                } catch {
                  // Not JSON or not an inline block — ignore
                }
              }

              toolResultContents.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: toolResult?.content ?? "",
              });
            } catch (toolErr) {
              // Tool dispatch error — return an error result so the model can handle it
              toolResultContents.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify({ error: String(toolErr) }),
              });
            }
          }

          // Append the assistant turn (with tool_use blocks) + tool results turn
          currentMessages = [
            ...currentMessages,
            { role: "assistant" as const, content: assistantContentBlocks as Anthropic.ContentBlock[] },
            { role: "user" as const, content: toolResultContents as Anthropic.ToolResultBlockParam[] },
          ] as AnthropicMessage[];
        }

        // 11. Finalize assistant message → status='complete'
        const usage = {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        };
        const costUsd =
          (usage.input_tokens * 3 + ((usage as { output_tokens?: number }).output_tokens ?? 0) * 15) /
          1_000_000;

        // Record cost (T-2-05-02)
        await recordCost(userId, costUsd);

        // Persist finalized content + inline block (if any)
        if (assistantMsgId) {
          try {
            await withUserRls(claims as Record<string, unknown>, async (tx) => {
              return tx
                .update(messages)
                .set({
                  content: accumulatedContent,
                  status: "complete",
                  token_input: usage.input_tokens,
                  token_output: (usage as { output_tokens?: number }).output_tokens ?? null,
                  ...(inlineBlockType
                    ? {
                        inline_block_type: inlineBlockType,
                        inline_block_payload: inlineBlockPayload,
                      }
                    : {}),
                })
                .where(eq(messages.id, assistantMsgId));
            });
          } catch (finalizeErr) {
            // Non-fatal — message still delivered via SSE, but log for observability (IN-03)
            console.error(JSON.stringify({
              level: "error",
              event: "chat.finalize_message_failed",
              threadId,
              error: finalizeErr instanceof Error ? finalizeErr.message : "unknown",
              timestamp: new Date().toISOString(),
            }));
          }
        }

        // Update thread last_message_at
        try {
          await withUserRls(claims as Record<string, unknown>, async (tx) => {
            return tx
              .update(threads)
              .set({ last_message_at: new Date() })
              .where(eq(threads.id, threadId));
          });
        } catch (threadUpdateErr) {
          // Non-fatal but log for observability (IN-03)
          console.error(JSON.stringify({
            level: "error",
            event: "chat.update_thread_timestamp_failed",
            threadId,
            error: threadUpdateErr instanceof Error ? threadUpdateErr.message : "unknown",
            timestamp: new Date().toISOString(),
          }));
        }

        // Signal stream end
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      } catch (err) {
        // Emit error event so client can show retry UI (CONV-09)
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "stream_error", message: String(err) })}\n\n`
            )
          );
          controller.close();
        } catch {
          // Already closed
        }

        // Mark assistant message as errored
        if (assistantMsgId) {
          try {
            await withUserRls(claims as Record<string, unknown>, async (tx) => {
              return tx
                .update(messages)
                .set({ status: "errored" })
                .where(eq(messages.id, assistantMsgId));
            });
          } catch (errorMarkErr) {
            // Non-fatal but log for observability (IN-03)
            console.error(JSON.stringify({
              level: "error",
              event: "chat.mark_message_errored_failed",
              threadId,
              error: errorMarkErr instanceof Error ? errorMarkErr.message : "unknown",
              timestamp: new Date().toISOString(),
            }));
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
