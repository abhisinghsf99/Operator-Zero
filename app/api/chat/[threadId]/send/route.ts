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
import { eq } from "drizzle-orm";
import { z } from "zod";

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
  } catch {
    // Non-fatal — continue even if persist fails (rare DB error)
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
  } catch {
    // Non-fatal
  }

  // 9. Cost cap check (T-2-05-02) and system prompt
  const capStatus = await checkCostCap(userId);
  const includeWriteTools = capStatus !== "hard";

  const allMessages = [
    ...priorMessages,
    { role: "user" as const, content: body.message },
  ];

  const systemPrompt = await buildSystemPrompt(userId, body.message, {
    budget: "chat",
  });
  const toolDefs = getAnthropicToolDefinitions(includeWriteTools);

  // 10. Build the SSE ReadableStream — pump Anthropic deltas as SSE events
  const encoder = new TextEncoder();
  let accumulatedContent = "";
  let inlineBlockType: string | null = null;
  let inlineBlockPayload: unknown = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-opus-4-7",
          system: systemPrompt,
          messages: allMessages,
          tools: toolDefs as Parameters<typeof anthropic.messages.stream>[0]["tools"],
          max_tokens: 4096,
        });

        const agentCtx = {
          userId,
          automationLevel: "L2" as const,
          threadId,
        };

        for await (const event of anthropicStream) {
          // Text delta — forward promptly to client (first token target <2s)
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

          // Tool use — dispatch inline (CONV-02/03)
          if (
            event.type === "content_block_start" &&
            event.content_block.type === "tool_use"
          ) {
            const toolBlock = event.content_block;
            try {
              const toolResult = await dispatchTool(
                toolBlock.name,
                toolBlock.input,
                agentCtx
              );

              // Check if tool result embeds an inline block (propose_workflow_plan)
              if (toolResult && toolResult.content) {
                try {
                  const parsed = JSON.parse(toolResult.content);
                  if (parsed.inline_block_type === "workflow_plan") {
                    inlineBlockType = "workflow_plan";
                    inlineBlockPayload = parsed.inline_block_payload;

                    // Emit an SSE event so the client can render the visualizer
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
            } catch {
              // Tool dispatch error — non-fatal, continue stream
            }
          }
        }

        // 11. Finalize assistant message → status='complete'
        const finalMsg = await anthropicStream.finalMessage();
        const usage = finalMsg.usage;
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
          } catch {
            // Non-fatal — message still delivered via SSE
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
        } catch {
          // Non-fatal
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
          } catch {
            // Non-fatal
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
