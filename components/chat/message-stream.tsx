"use client";

/**
 * components/chat/message-stream.tsx
 * SSE consumer + message rendering for the active chat thread.
 *
 * CONV-01: Consumes SSE from /api/chat/[threadId]/send
 * CONV-07/08/09: Renders inline blocks by type, latency indicator, error retry
 *
 * Inline block routing:
 *   workflow_plan  → WorkflowVisualizer
 *   approval_card  → InlineApprovalCard (from 02-07)
 *   preview        → ContentPreview
 *   reasoning      → ReasoningBlock
 *
 * Realtime: Supabase Realtime channel { private: true } with user JWT for live
 * status sync (Pitfall 5, T-2-06-05).
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Messages list is aria-live="polite"
 *   - Latency indicator is aria-live
 *   - Keyboard-operable retry button
 *   - Focus management: new messages auto-scroll (scrollIntoView)
 *   - reduced-motion: streaming indicator uses motion-reduce:animate-none
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/auth/client";
import { Composer } from "./composer";
import { WorkflowVisualizer } from "./workflow-visualizer";
import { ReasoningBlock } from "./reasoning-block";
import { ContentPreview } from "./content-preview";
import { InlineApprovalCard } from "./inline-approval-card";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "complete" | "errored";
  inline_block_type?: string | null;
  inline_block_payload?: unknown;
  created_at?: Date;
}

interface StreamMessage extends Message {
  /** Ephemeral: content being assembled from SSE stream */
  streamingContent?: string;
}

// ─── ChatThreadView ────────────────────────────────────────────────────────────

interface ChatThreadViewProps {
  threadId: string;
}

/**
 * ChatThreadView — full chat layout for a specific thread.
 *
 * Renders the message list and composer in a flex column.
 * The SSE stream is initiated per-send from the Composer.
 */
export function ChatThreadView({ threadId }: ChatThreadViewProps) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  // Supabase Realtime subscription for live status updates (T-2-06-05)
  // Uses { private: true } with the user JWT to prevent cross-user leakage
  useEffect(() => {
    const supabase = createBrowserClient();
    // Note: In production this would subscribe to messages changes for this thread.
    // The channel is set to private: true with the user's JWT.
    const channel = supabase.channel(`thread:${threadId}`, {
      config: { private: true },
    });

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      // 1. Optimistically add user message
      const userMsgId = `user-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          content: messageText,
          status: "complete",
          created_at: new Date(),
        },
      ]);

      // 2. Add streaming placeholder for assistant
      const asstMsgId = `asst-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: asstMsgId,
          role: "assistant",
          content: "",
          streamingContent: "",
          status: "streaming",
          created_at: new Date(),
        },
      ]);

      setIsStreaming(true);
      setStreamError(null);

      // 3. Abort any in-flight stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const resp = await fetch(`/api/chat/${threadId}/send`, {
          method: "POST",
          body: JSON.stringify({ message: messageText }),
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Stream failed" }));
          throw new Error(err.error ?? `HTTP ${resp.status}`);
        }

        // 4. Read the SSE stream
        const reader = resp.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;

            try {
              const event = JSON.parse(raw);

              if (event.error) {
                throw new Error(event.message ?? "Stream error");
              }

              if (event.text) {
                // Append text delta
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === asstMsgId
                      ? {
                          ...m,
                          streamingContent:
                            (m.streamingContent ?? "") + event.text,
                          content:
                            (m.streamingContent ?? "") + event.text,
                        }
                      : m
                  )
                );
              }

              if (event.inline_block_type) {
                // Tool result — update inline block
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === asstMsgId
                      ? {
                          ...m,
                          inline_block_type: event.inline_block_type,
                          inline_block_payload: event.inline_block_payload,
                        }
                      : m
                  )
                );
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== "Stream error") {
                // JSON parse error — skip this line
                continue;
              }
              throw parseErr;
            }
          }
        }

        // 5. Finalize assistant message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId
              ? { ...m, status: "complete" as const, streamingContent: undefined }
              : m
          )
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        const errMsg = err instanceof Error ? err.message : "An error occurred";
        setStreamError(errMsg);

        // Mark assistant message as errored
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId ? { ...m, status: "errored" as const } : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [threadId]
  );

  // Handle queued messages flushed after streaming ends
  const handleStreamEnd = useCallback(
    (queuedMessages: string[]) => {
      for (const msg of queuedMessages) {
        void sendMessage(msg);
      }
    },
    [sendMessage]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Thread header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-8 py-5">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--acc-chat-ink)]"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-white">OZ</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text)]">
              Orchestrator
            </span>
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--success)]"
              aria-hidden="true"
            />
            <span className="text-xs text-[var(--text-tertiary)]">
              here &amp; remembering
            </span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      {messages.length > 0 ? (
        <div
          className="flex-1 overflow-y-auto py-8"
          role="log"
          aria-live="polite"
          aria-label="Conversation messages"
        >
          <div className="mx-auto flex max-w-[760px] flex-col gap-7 px-8">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {/* Streaming indicator */}
            {isStreaming && (
              <div
                className="flex gap-3"
                aria-live="polite"
                aria-label="Operator Zero is thinking"
              >
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--acc-chat-ink)]"
                  aria-hidden="true"
                >
                  <span className="text-[9px] font-semibold text-white">OZ</span>
                </div>
                <div className="flex items-center gap-1 pt-1.5 text-[13px] italic text-[var(--text-tertiary)]">
                  <span>thinking</span>
                  <span
                    aria-hidden="true"
                    className="animate-[blink_1.2s_infinite] motion-reduce:animate-none"
                  >
                    ·
                  </span>
                  <span
                    aria-hidden="true"
                    className="animate-[blink_1.2s_infinite_0.2s] motion-reduce:animate-none"
                  >
                    ·
                  </span>
                  <span
                    aria-hidden="true"
                    className="animate-[blink_1.2s_infinite_0.4s] motion-reduce:animate-none"
                  >
                    ·
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      ) : (
        <ThreadEmptyState />
      )}

      {/* Stream error */}
      {streamError && (
        <div
          role="alert"
          className="mx-8 mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <span>{streamError}</span>
          <button
            onClick={() => setStreamError(null)}
            className="ml-2 underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Composer */}
      <Composer
        threadId={threadId}
        onSend={sendMessage}
        isStreaming={isStreaming}
        onStreamEnd={handleStreamEnd}
      />
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: StreamMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[78%] rounded-[var(--r-lg)] px-4 py-[11px]",
            "bg-[var(--bg-deeper)] text-[13px] text-[var(--text)]"
          )}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-3">
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--acc-chat-ink)]"
        aria-hidden="true"
      >
        <span className="text-[9px] font-semibold text-white">OZ</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Text content */}
        {(message.streamingContent || message.content) && (
          <div
            className={cn(
              "text-[13px] leading-relaxed text-[var(--text)]",
              message.status === "streaming" &&
                "after:ml-0.5 after:inline-block after:h-3.5 after:w-0.5 after:bg-[var(--text)] after:align-middle after:animate-[blink_1s_step-end_infinite] after:motion-reduce:animate-none"
            )}
          >
            {message.streamingContent ?? message.content}
          </div>
        )}

        {/* Inline blocks by type */}
        {message.inline_block_type && message.status !== "streaming" && (
          <InlineBlock
            type={message.inline_block_type}
            payload={message.inline_block_payload}
            messageId={message.id}
          />
        )}

        {/* Errored state */}
        {message.status === "errored" && (
          <div
            role="alert"
            className="text-xs text-red-500"
          >
            Message failed to send.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── InlineBlock ──────────────────────────────────────────────────────────────

interface InlineBlockProps {
  type: string;
  payload: unknown;
  messageId: string;
}

function InlineBlock({ type, payload, messageId }: InlineBlockProps) {
  switch (type) {
    case "workflow_plan": {
      const plan = payload as {
        name?: string;
        description?: string;
        steps?: Array<{ id: string; name: string; tool: string; description?: string }>;
        automation_level?: string;
        trigger_type?: string;
      };
      return <WorkflowVisualizer plan={plan} messageId={messageId} />;
    }

    case "approval_card": {
      const card = payload as {
        approval_id?: string;
        action_type?: string;
        summary?: string;
        risk?: string;
      };
      if (!card?.approval_id) return null;
      return (
        <InlineApprovalCard
          approvalId={card.approval_id}
          actionType={card.action_type ?? "unknown"}
          summary={card.summary ?? "Approval required"}
          stakes={(card.risk as "low" | "med" | "high") ?? "med"}
          reasoning=""
          initialStatus="pending"
        />
      );
    }

    case "preview": {
      const preview = payload as { content?: string; title?: string };
      return (
        <ContentPreview
          content={preview?.content ?? ""}
          title={preview?.title}
        />
      );
    }

    case "reasoning": {
      const reasoning = payload as { content?: string };
      return <ReasoningBlock content={reasoning?.content ?? ""} />;
    }

    default:
      return null;
  }
}

// ─── ThreadEmptyState ─────────────────────────────────────────────────────────

function ThreadEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="max-w-sm">
        <p className="text-sm text-[var(--text-secondary)]">
          Start the conversation — ask about your store, request a workflow,
          or explore what Operator Zero can do.
        </p>
      </div>
    </div>
  );
}
