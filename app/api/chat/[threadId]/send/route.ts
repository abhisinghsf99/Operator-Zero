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
import { autoNameThreadIfDefault } from "@/app/app/chat/actions";
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

  // 6. Load prior messages for this thread (last 20 — WS6/WS7.1: the Groq
  // free-tier 8k tokens/min concession that capped this at 8 no longer applies
  // under the Gemini profile). WS7.1: .orderBy(messages.created_at) — the prior
  // select had no ordering, so the model could receive scrambled context.
  let priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  try {
    const msgRows = await withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .select()
        .from(messages)
        .where(eq(messages.thread_id, threadId))
        .orderBy(messages.created_at);
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
      // WS7.2 — emit the real assistant message UUID as the FIRST SSE event,
      // before the streamText loop starts, so the client can swap its
      // optimistic `asst-${Date.now()}` id for the real one. This unblocks
      // Save as workflow, which Zod-validates messageId as a UUID.
      if (assistantMsgId) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ message_id: assistantMsgId })}\n\n`)
        );
      }

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
        // Only emitted when the resolved provider is actually "groq" — Gemini
        // and Anthropic don't have a reasoningEffort knob in this namespace.
        //
        // FORMER GROQ FREE-TIER TPM FIT (8000 tokens/min, cumulative per
        // request) — retired under the Gemini profile, kept here for context:
        //   - maxOutputTokens capped at 1536: Groq reserves input+output against
        //     the per-minute budget, so a 4096 reservation alone ate half of it.
        //   - stepCountIs(3): each extra tool round re-sends ALL prior tool
        //     results, so accumulated context blew past 8k by step 3-4. Fewer
        //     rounds = less accumulation (tool results are also capped, in
        //     getAiSdkTools).
        // gpt-oss-120b's agentic tool loop was genuinely tight against the free
        // tier — those caps kept typical single tool-using turns under the cap.
        // Gemini's generous limits mean the full budget/step count are safe again.
        const providerOptions: { groq?: { reasoningEffort: "low" } } =
          choice.provider === "groq" ? { groq: { reasoningEffort: "low" } } : {};

        // WS7.13/WS12 (D-1/D-2): the chat toolset is read + meta tools plus ONLY
        // the propose-safe write tools, minus ask_user_clarification (dead end —
        // the route only renders workflow_plan/preview inline blocks).
        const result = streamText({
          model: resolveModel("ORCHESTRATOR"),
          system: systemPrompt,
          messages: allMessages,
          tools: getAiSdkTools(includeWriteTools, agentCtx, {
            writeTools: "propose-safe",
            excludeTools: ["ask_user_clarification"],
          }),
          stopWhen: stepCountIs(5),
          maxOutputTokens: choice.maxTokens,
          providerOptions,
          // WS7.7 — propagate the client's abort signal so a disconnect stops
          // server-side model work instead of burning tokens/time unattended.
          abortSignal: req.signal,
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
                } else if (parsed.phase === "propose") {
                  // D-1 propose-phase preview — makes the propose-safe write
                  // tools' output visible instead of silent. Title is derived
                  // from the tool name; content prefers `preview`, then
                  // meta_title + meta_description, then body_html, then
                  // rationale (whichever the specific propose-safe tool set).
                  const toolNameLabels: Record<string, string> = {
                    shopify_optimize_meta: "Proposed meta",
                    shopify_optimize_product_description: "Proposed description",
                    shopify_propose_restock: "Proposed restock",
                  };
                  const title = toolNameLabels[part.toolName] ?? "Proposed action";
                  const content: string =
                    typeof parsed.preview === "string" && parsed.preview
                      ? parsed.preview
                      : typeof parsed.meta_title === "string" || typeof parsed.meta_description === "string"
                        ? `${parsed.meta_title ?? ""} — ${parsed.meta_description ?? ""}`.trim()
                        : typeof parsed.body_html === "string"
                          ? parsed.body_html
                          : typeof parsed.rationale === "string"
                            ? parsed.rationale
                            : "";

                  inlineBlockType = "preview";
                  inlineBlockPayload = { title, content };
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

        // WS7.3 — auto-name the thread from the first user message if it's
        // still titled "New conversation" (or blank). Thread naming must
        // never break a reply — wrapped in try/catch and logged non-fatally.
        try {
          await autoNameThreadIfDefault(threadId, body.message);
        } catch (autoNameErr) {
          console.error(JSON.stringify({
            level: "warn",
            event: "chat.auto_name_thread_failed",
            threadId,
            error: autoNameErr instanceof Error ? autoNameErr.message : "unknown",
            timestamp: new Date().toISOString(),
          }));
        }

        // Signal stream end
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      } catch (err) {
        // WS7.6 — never send the raw provider error to the client: it can leak
        // API internals, prompts, or infra details. Emit a generic, user-facing
        // message and log the real error server-side only, structured like the
        // other logs in this file.
        console.error(JSON.stringify({
          level: "error",
          event: "chat.stream_failed",
          threadId,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        }));
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: "stream_error",
                message: "Something went wrong generating that reply. Try again.",
              })}\n\n`
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
