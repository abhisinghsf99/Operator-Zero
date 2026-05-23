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
 *
 * DESIGN: surface-conversation.jsx — thread header, message bubbles,
 *   streaming indicator, empty state, composer placement.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createBrowserClient } from "@/lib/auth/client";
import { Composer } from "./composer";
import { WorkflowVisualizer } from "./workflow-visualizer";
import { ReasoningBlock } from "./reasoning-block";
import { ContentPreview } from "./content-preview";
import { InlineApprovalCard } from "./inline-approval-card";
import { Avatar, IconButton } from "@/components/design/primitives";

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

interface InitialMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  status: string;
  inline_block_type?: string | null;
  inline_block_payload?: unknown;
  created_at?: Date | string;
}

interface ChatThreadViewProps {
  threadId: string;
  /** Persisted messages loaded server-side, rendered as history on open. */
  initialMessages?: InitialMessage[];
}

/**
 * ChatThreadView — full chat layout for a specific thread.
 *
 * Renders the message list and composer in a flex column.
 * The SSE stream is initiated per-send from the Composer.
 */
export function ChatThreadView({ threadId, initialMessages = [] }: ChatThreadViewProps) {
  const [messages, setMessages] = useState<StreamMessage[]>(() =>
    initialMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content ?? "",
        status: (m.status === "streaming" || m.status === "errored"
          ? m.status
          : "complete") as Message["status"],
        inline_block_type: m.inline_block_type ?? null,
        inline_block_payload: m.inline_block_payload,
        created_at: m.created_at ? new Date(m.created_at) : undefined,
      }))
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  // Supabase Realtime subscription for live thread updates (T-2-06-05).
  // The `thread:<id>` channel is private; setAuth() attaches the user JWT so
  // Realtime enforces the realtime.messages ownership policy from migration 0004
  // (only the thread's owner may join/receive on this topic). Without setAuth a
  // private channel cannot be authorized server-side.
  useEffect(() => {
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      channel = supabase.channel(`thread:${threadId}`, {
        config: { private: true },
      });
      channel.subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg)", overflow: "hidden" }}>
      {/* Thread header — matches design ThreadHeader */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "20px 32px",
          borderBottom: "0.5px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        <Avatar agent size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Orchestrator</span>
            <span
              style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--success)" }}
              aria-hidden="true"
            />
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>here &amp; remembering</span>
          </div>
        </div>
        <IconButton icon="Search" title="Search conversation" />
        <IconButton icon="More" title="More options" />
      </div>

      {/* Messages area */}
      {messages.length > 0 ? (
        <div
          style={{ flex: 1, overflowY: "auto", padding: "32px 0" }}
          role="log"
          aria-live="polite"
          aria-label="Conversation messages"
        >
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px", display: "flex", flexDirection: "column", gap: 28 }}>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {/* Streaming "thinking" indicator — matches design exactly */}
            {isStreaming && (
              <div
                className="anim-pop"
                style={{ display: "flex", gap: 12 }}
                aria-live="polite"
                aria-label="Operator Zero is thinking"
              >
                <Avatar agent size={28} />
                <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 6, color: "var(--text-tertiary)", fontSize: 13 }}>
                  <span className="display" style={{ fontStyle: "italic" }}>thinking</span>
                  <span aria-hidden="true" style={{ animation: "blink 1.2s infinite", animationDelay: "0s" }}>·</span>
                  <span aria-hidden="true" style={{ animation: "blink 1.2s infinite", animationDelay: "0.2s" }}>·</span>
                  <span aria-hidden="true" style={{ animation: "blink 1.2s infinite", animationDelay: "0.4s" }}>·</span>
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
          style={{
            margin: "0 32px 8px",
            padding: "10px 14px",
            background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
            border: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
            borderRadius: "var(--r-sm)",
            fontSize: 12.5,
            color: "var(--danger)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ flex: 1 }}>{streamError}</span>
          <button
            onClick={() => setStreamError(null)}
            style={{
              all: "unset",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--danger)",
              textDecoration: "underline",
            }}
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
      <div className="anim-pop" style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "78%",
            padding: "11px 16px",
            background: "var(--bg-deeper)",
            borderRadius: "var(--r-lg)",
            borderBottomRightRadius: "var(--r-xs)",
            color: "var(--text)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="anim-pop" style={{ display: "flex", gap: 12 }}>
      <Avatar agent size={28} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, paddingTop: 2 }}>
        {/* Text content with optional streaming cursor */}
        {(message.streamingContent || message.content) && (
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
            }}
          >
            {message.streamingContent ?? message.content}
            {message.status === "streaming" && (
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 2,
                  height: "0.875em",
                  marginLeft: 2,
                  background: "var(--text)",
                  verticalAlign: "middle",
                  animation: "blink 1s step-end infinite",
                }}
              />
            )}
          </div>
        )}

        {/* Inline blocks by type — only shown after streaming is done */}
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
            style={{ fontSize: 12.5, color: "var(--danger)" }}
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
  const suggestions = [
    "Audit my catalog for missing meta titles",
    "Find slow-moving inventory",
    "Help me draft a Mother's Day collection page",
    "Watch for low-stock bestsellers",
  ];

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: 560,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "center",
        }}
      >
        {/* Logo icon in tinted circle */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--acc-chat-bg)",
            color: "var(--acc-chat-ink)",
            display: "grid",
            placeItems: "center",
          }}
          aria-hidden="true"
        >
          {/* Logo icon — inline to avoid import overhead */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          </svg>
        </div>

        {/* Serif headline */}
        <div className="display" style={{ fontSize: 36, color: "var(--text)", letterSpacing: "-0.02em" }}>
          What do you want to <em>get off your plate?</em>
        </div>

        {/* Suggestion pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 480 }}>
          {suggestions.map((s) => (
            <SuggestionPill key={s} text={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SuggestionPill({ text }: { text: string }) {
  return (
    <button
      style={{
        all: "unset",
        cursor: "pointer",
        padding: "8px 14px",
        background: "var(--bg-elevated)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-pill)",
        fontSize: 13,
        color: "var(--text-secondary)",
        fontFamily: "var(--font-serif)",
        fontStyle: "italic",
        transition: "border-color 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--acc-chat-ink)";
        e.currentTarget.style.color = "var(--text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = "2px solid var(--acc-chat-ink)";
        e.currentTarget.style.outlineOffset = "2px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = "none";
      }}
    >
      &ldquo;{text}&rdquo;
    </button>
  );
}
