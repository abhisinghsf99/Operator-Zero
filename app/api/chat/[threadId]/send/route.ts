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
import { resolveModel, resolveModelChoice } from "@/lib/agent/llm/models";
import { getAiSdkTools } from "@/lib/agent/llm/tools";
import { costFor } from "@/lib/agent/llm/pricing";
import { streamText, stepCountIs } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

// ─── Route config ─────────────────────────────────────────────────────────────

/** Must be force-dynamic to prevent Next.js caching SSE responses */
export const dynamic = "force-dynamic";
/**
 * Extended timeout. The orchestrator runs an agentic tool loop (stepCountIs(5)),
 * and on Groq (gpt-oss-120b) each step is a separate round-trip — multi-step
 * tool conversations were hitting the old 60s ceiling and returning 504
 * ("agent thinks but never responds"). 120s gives the loop headroom; the
 * reasoningEffort:"low" cap below keeps most turns well under it.
 */
export const maxDuration = 120;

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

  // Resolve the orchestrator model once — used for the placeholder model_id,
  // the streamText call, cost computation, and the finalize update. Default
  // profile = anthropic => choice.modelId === "claude-opus-4-7" (zero change).
  const choice = resolveModelChoice("ORCHESTRATOR");

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
          model_id: choice.modelId,
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

  // 10. Build the SSE ReadableStream — pump AI SDK deltas as SSE events
  const encoder = new TextEncoder();
  let accumulatedContent = "";
  let inlineBlockType: string | null = null;
  let inlineBlockPayload: unknown = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Per-request agent context — captured in the getAiSdkTools closure below
        // (NEVER a module-level singleton — wrong-user security regression, T-ebw-01).
        const agentCtx = {
          userId,
          automationLevel: "L2" as const,
          threadId,
        };

        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        // ── Agentic tool loop (CR-05) ───────────────────────────────────────────
        // streamText runs the model + tool loop internally (execute delegates to
        // dispatchTool), bounded by stopWhen: stepCountIs(5). We re-emit the same
        // custom SSE events from result.fullStream so the client is untouched.
        //
        // reasoningEffort:"low" — when ORCHESTRATOR routes to Groq (gpt-oss-120b,
        // the prod MODEL_PROFILE), uncapped reasoning lets the model spend its
        // whole output budget on reasoning tokens, so it "thinks" but streams
        // little/no text and multi-step tool loops blow past the timeout. "low"
        // keeps turns fast and preserves output budget for the actual reply.
        // Harmless on Anthropic — the groq providerOptions namespace is ignored.
        // (Same fix already applied to optimize-meta.ts / propose-restock.ts.)
        const result = streamText({
          model: resolveModel("ORCHESTRATOR"),
          system: systemPrompt,
          messages: allMessages,
          tools: getAiSdkTools(includeWriteTools, agentCtx),
          stopWhen: stepCountIs(5),
          maxOutputTokens: choice.maxTokens,
          providerOptions: { groq: { reasoningEffort: "low" as const } },
        });

        for await (const part of result.fullStream) {
          // Text delta — accumulate + forward as the unchanged { text } SSE event.
          if (part.type === "text-delta") {
            accumulatedContent += part.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: part.text })}\n\n`)
            );
            continue;
          }

          // Tool result — execute returned a ToolResult on part.output. Run the
          // SAME inline-block extraction (JSON.parse(content)) as before. The
          // execute() wrapper (dispatchTool) never throws, so tool failures surface
          // as correctable results, not stream crashes (T-ebw-02).
          if (part.type === "tool-result") {
            const toolResult = part.output as
              | { content?: string; is_error?: boolean }
              | undefined;
            if (toolResult && typeof toolResult.content === "string") {
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
            continue;
          }

          // Final usage — read inputTokens/outputTokens off the finish part.
          if (part.type === "finish") {
            totalInputTokens = part.totalUsage.inputTokens ?? 0;
            totalOutputTokens = part.totalUsage.outputTokens ?? 0;
            continue;
          }
        }

        // 11. Finalize assistant message → status='complete'
        const usage = {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        };
        const costUsd = costFor(choice.modelId, totalInputTokens, totalOutputTokens);

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
                  model_id: choice.modelId,
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
