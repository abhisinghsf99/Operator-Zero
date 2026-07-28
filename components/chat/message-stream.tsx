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
 * NOTE (WS12 dead-code removal): a Supabase Realtime subscription used to live
 * here but subscribed to `thread:<id>` with zero event handlers — it did
 * nothing observable and was removed. Re-add with real handlers if/when live
 * status sync is actually implemented.
 *
 * NOTE (WS7.2, message_id adoption): sendMessage creates an optimistic
 * `asst-${Date.now()}` id for the assistant placeholder. The route emits a
 * `{ message_id }` SSE event as the FIRST event of the stream carrying the
 * real assistant message UUID; sendMessage swaps every subsequent
 * setMessages call to key off the real id (tracked in a local
 * `currentAsstId` variable) so later actions — notably Save as workflow,
 * which Zod-validates a UUID — operate on a real row id, not the optimistic
 * placeholder.
 *
 * NOTE (WS7.5, serialized queue flush): the Composer's onStreamEnd used to
 * fire `sendMessage` for every queued message in a tight loop; each call
 * aborts the previous in-flight stream (see abortRef below), so only the
 * LAST queued message ever actually sent. handleStreamEnd now appends
 * incoming queued messages to `pendingQueueRef` and a small effect drains it
 * one at a time as isStreaming transitions back to false, so queued sends
 * are genuinely serialized.
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
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Composer } from "./composer";
import { WorkflowVisualizer } from "./workflow-visualizer";
import { ReasoningBlock } from "./reasoning-block";
import { ContentPreview } from "./content-preview";
import { InlineApprovalCard } from "./inline-approval-card";
import { ChatHeaderMenu } from "./chat-header-menu";
import { ChatSearchBar } from "./chat-search-bar";
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
  /** Initial pinned_at value from the server — seeds the pinned state for ChatHeaderMenu. */
  initialPinnedAt?: Date | null;
  /** Initial thread title from the server — seeds the header title state. */
  initialTitle?: string | null;
}

/**
 * ChatThreadView — full chat layout for a specific thread.
 *
 * Renders the message list and composer in a flex column.
 * The SSE stream is initiated per-send from the Composer.
 */
export function ChatThreadView({
  threadId,
  initialMessages = [],
  initialPinnedAt = null,
  initialTitle = null,
}: ChatThreadViewProps) {
  const router = useRouter();
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

  // ─── Header / search state ──────────────────────────────────────────────────
  const [headerTitle, setHeaderTitle] = useState(initialTitle ?? "Orchestrator");
  const [pinned, setPinned] = useState(initialPinnedAt != null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  // Message ref map — maps message.id → bubble container HTMLDivElement for scroll
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerBubbleRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) bubbleRefs.current.set(id, el);
    else bubbleRefs.current.delete(id);
  }, []);

  // Detect reduced-motion preference for scroll behavior. Read once via a
  // useState initializer (WS7.4) rather than on every render — this also
  // keeps it out of the scroll effect's exhaustive-deps churn below.
  const [prefersReducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  // WS7.4 — follow the stream as text arrives. The old effect only depended
  // on messages.length + isStreaming, so it never re-ran while a single
  // message's content grew during streaming (only fired once when the
  // placeholder was first appended). Deriving a key from the last message's
  // content length forces a re-run on every delta.
  const lastMessage = messages[messages.length - 1];
  const lastMessageContentLength =
    (lastMessage?.streamingContent ?? lastMessage?.content ?? "").length;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages.length, isStreaming, lastMessageContentLength, prefersReducedMotion]);

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

      // 2. Add streaming placeholder for assistant. WS7.2 — currentAsstId is a
      // mutable local (not the const asstMsgId) because the route swaps this
      // optimistic id for the real assistant message UUID via the `message_id`
      // SSE event; every subsequent setMessages call below must key off
      // currentAsstId's CURRENT value, not the initial placeholder id.
      const asstMsgId = `asst-${Date.now()}`;
      let currentAsstId = asstMsgId;
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
          if (resp.status === 429) {
            throw new Error("The model is rate-limited right now. Wait a moment and try again.");
          } else if (resp.status === 401 || resp.status === 403) {
            throw new Error("Your session needs a refresh — reload and sign in again.");
          } else {
            throw new Error(err.error ?? `HTTP ${resp.status}`);
          }
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
                throw new Error(event.message ?? "The reply stream was interrupted. Try sending again.");
              }

              if (event.message_id) {
                // WS7.2 — adopt the real assistant message UUID. Swap the
                // placeholder's id in state, then repoint currentAsstId so
                // every later branch in this loop (text, inline blocks,
                // finalize, error) targets the real row.
                const realId = event.message_id as string;
                setMessages((prev) =>
                  prev.map((m) => (m.id === currentAsstId ? { ...m, id: realId } : m))
                );
                currentAsstId = realId;
              }

              if (event.text) {
                // Append text delta
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === currentAsstId
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
                    m.id === currentAsstId
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
              // Re-throw intentional stream errors (from event.error branch above).
              // Swallow JSON parse errors on individual SSE lines — skip and keep reading.
              if (parseErr instanceof SyntaxError) {
                continue;
              }
              throw parseErr;
            }
          }
        }

        // 5. Finalize assistant message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentAsstId
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
            m.id === currentAsstId ? { ...m, status: "errored" as const } : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [threadId]
  );

  // WS7.5 — serialized queue flush. pendingQueueRef holds every queued
  // message that hasn't been sent yet, across possibly-multiple onStreamEnd
  // calls (the Composer flushes ITS queue once per streaming->false
  // transition, but a new send re-enters streaming=true immediately, so a
  // user who queues 3 messages during one long reply gets 3 separate
  // onStreamEnd calls over time, one per completed reply).
  //
  // The old implementation looped `void sendMessage(msg)` over every queued
  // message at once — each sendMessage call aborts the previous in-flight
  // stream (abortRef.current?.abort() above), so only the LAST queued
  // message ever actually completed. This drains exactly one at a time.
  const pendingQueueRef = useRef<string[]>([]);
  const isStreamingRef = useRef(false);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const handleStreamEnd = useCallback(
    (queuedMessages: string[]) => {
      pendingQueueRef.current.push(...queuedMessages);
      if (!isStreamingRef.current) {
        const next = pendingQueueRef.current.shift();
        if (next) void sendMessage(next);
      }
    },
    [sendMessage]
  );

  // When a stream finishes and there's still a queued message waiting
  // (queued while THIS reply was in flight), send the next one. Guards
  // against the ordering race with handleStreamEnd above via the plain
  // shift() — whichever runs first empties the ref, the other is a no-op.
  useEffect(() => {
    if (!isStreaming && pendingQueueRef.current.length > 0) {
      const next = pendingQueueRef.current.shift();
      if (next) void sendMessage(next);
    }
  }, [isStreaming, sendMessage]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg)", overflow: "hidden" }}>
      {/* Thread header — matches design ThreadHeader, responsive padding */}
      <div
        className="px-4 md:px-8"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingTop: 20,
          paddingBottom: 20,
          borderBottom: searchOpen ? "none" : "0.5px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        {/* Mobile-only: back to threads navigation (D-11) */}
        <button
          className="md:hidden"
          onClick={() => router.push("/app/chat")}
          aria-label="Back to threads"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            padding: "6px",
            borderRadius: "var(--r-sm)",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-subtle)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <Avatar agent size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {headerTitle}
            </span>
            <span
              style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--success)" }}
              aria-hidden="true"
            />
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>here &amp; remembering</span>
          </div>
        </div>
        <IconButton
          icon="Search"
          title="Search conversation"
          active={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
        />
        <ChatHeaderMenu
          threadId={threadId}
          threadTitle={headerTitle}
          pinned={pinned}
          messages={messages.map((m) => ({ role: m.role, content: m.content }))}
          onRenamed={(t) => setHeaderTitle(t)}
          onPinnedChange={setPinned}
        />
      </div>

      {/* In-thread search bar — shown when searchOpen */}
      {searchOpen && (
        <ChatSearchBar
          messages={messages.map((m) => ({ id: m.id, content: m.content }))}
          onActiveMatchChange={(id) => {
            setActiveMatchId(id);
            if (id) {
              const el = bubbleRefs.current.get(id);
              el?.scrollIntoView({
                behavior: prefersReducedMotion ? "auto" : "smooth",
                block: "center",
              });
            }
          }}
          onClose={() => {
            setSearchOpen(false);
            setActiveMatchId(null);
          }}
        />
      )}

      {/* Messages area */}
      {messages.length > 0 ? (
        <div
          style={{ flex: 1, overflowY: "auto", padding: "32px 0" }}
          role="log"
          aria-live="polite"
          aria-label="Conversation messages"
        >
          <div className="px-4 md:px-8" style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                registerRef={registerBubbleRef}
                highlighted={message.id === activeMatchId}
              />
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
        <ThreadEmptyState onSuggestion={(t) => void sendMessage(t)} />
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

interface MessageBubbleProps {
  message: StreamMessage;
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
  highlighted?: boolean;
}

function MessageBubble({ message, registerRef, highlighted = false }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div
        className="anim-pop"
        ref={(el) => registerRef?.(message.id, el)}
        style={{
          display: "flex",
          justifyContent: "flex-end",
          ...(highlighted
            ? {
                outline: "2px solid var(--acc-chat-ink)",
                outlineOffset: "2px",
                borderRadius: "var(--r-lg)",
              }
            : {}),
        }}
      >
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
    <div
      className="anim-pop"
      ref={(el) => registerRef?.(message.id, el)}
      style={{
        display: "flex",
        gap: 12,
        ...(highlighted
          ? {
              outline: "2px solid var(--acc-chat-ink)",
              outlineOffset: "2px",
              borderRadius: "var(--r-md)",
            }
          : {}),
      }}
    >
      <Avatar agent size={28} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, paddingTop: 2 }}>
        {/* Text content — rendered as sanitized markdown for assistant messages */}
        {(message.streamingContent || message.content) && (
          <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text)" }}>
            <ReactMarkdown
              // SECURITY: rehype-raw is intentionally NOT included — raw HTML passthrough
              // is disabled. react-markdown's default renderer produces safe React elements
              // only, preventing XSS from model-generated markdown content (T-2-06-02).
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 style={{ fontWeight: 600, color: "var(--text)", fontSize: "1.1em", margin: "1em 0 0.4em" }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{ fontWeight: 600, color: "var(--text)", fontSize: "1em", margin: "0.9em 0 0.35em" }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.95em", margin: "0.8em 0 0.3em" }}>{children}</h3>
                ),
                p: ({ children }) => (
                  <p style={{ marginBottom: "0.65em", color: "var(--text)" }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ listStyleType: "disc", paddingLeft: "1.25em", marginBottom: "0.65em", color: "var(--text)" }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ listStyleType: "decimal", paddingLeft: "1.25em", marginBottom: "0.65em", color: "var(--text)" }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ marginBottom: "0.2em", color: "var(--text)" }}>{children}</li>
                ),
                strong: ({ children }) => (
                  <strong style={{ fontWeight: 600, color: "var(--text)" }}>{children}</strong>
                ),
                em: ({ children }) => (
                  <em style={{ fontStyle: "italic", color: "var(--text-secondary)" }}>{children}</em>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ color: "var(--text)", textDecoration: "underline" }}
                  >
                    {children}
                  </a>
                ),
                code: ({ children }) => (
                  <code style={{ fontFamily: "monospace", background: "var(--bg-deeper)", borderRadius: "var(--r-sm)", padding: "1px 4px", fontSize: "0.85em" }}>{children}</code>
                ),
                pre: ({ children }) => (
                  <pre style={{ fontFamily: "monospace", background: "var(--bg-deeper)", borderRadius: "var(--r-sm)", padding: "10px 14px", overflowX: "auto", marginBottom: "0.65em", fontSize: "0.85em" }}>{children}</pre>
                ),
                blockquote: ({ children }) => (
                  <blockquote style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.75em", margin: "0.5em 0", color: "var(--text-secondary)", fontStyle: "italic" }}>{children}</blockquote>
                ),
                hr: () => (
                  <hr style={{ border: "none", borderTop: "0.5px solid var(--border)", margin: "0.75em 0" }} />
                ),
                // GFM table elements — priority styling for inventory reports
                table: ({ children }) => (
                  <div style={{ display: "block", overflowX: "auto", marginBottom: "0.65em" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9em" }}>{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead>{children}</thead>,
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => <tr>{children}</tr>,
                th: ({ children }) => (
                  <th style={{ fontWeight: 600, background: "var(--bg-subtle)", color: "var(--text)", border: "0.5px solid var(--border)", padding: "6px 10px", textAlign: "left" }}>{children}</th>
                ),
                td: ({ children }) => (
                  <td style={{ color: "var(--text)", border: "0.5px solid var(--border)", padding: "6px 10px" }}>{children}</td>
                ),
              }}
            >
              {message.streamingContent ?? message.content}
            </ReactMarkdown>
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

        {/* Errored state — covers both a live send failure and a reaped stale
            stream (WS7.9: listMessages marks abandoned 'streaming' rows
            'errored' on reload). This block is intentionally a sibling of the
            text-content div above, not nested inside it, so a message with
            empty content (the reaped case — nothing ever streamed) still
            renders this notice instead of an empty bubble. */}
        {message.status === "errored" && (
          <div
            role="alert"
            style={{ fontSize: 12.5, color: "var(--danger)" }}
          >
            This reply was interrupted.
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
      // WS7.11 — status/reasoning/preview/risk are populated server-side by
      // listMessages (Plan 2 task 1 Part C) from the live approvals row.
      // Reading them here (instead of hardcoding "pending"/"") is what makes
      // a resolved approval render its resolved state on reload rather than
      // live Approve/Reject buttons.
      const card = payload as {
        approval_id?: string;
        action_type?: string;
        summary?: string;
        risk?: string;
        status?: "pending" | "approved" | "rejected" | "expired" | "snoozed";
        reasoning?: string;
        preview?: Record<string, unknown>;
      };
      if (!card?.approval_id) return null;
      return (
        <InlineApprovalCard
          approvalId={card.approval_id}
          actionType={card.action_type ?? "unknown"}
          summary={card.summary ?? "Approval required"}
          stakes={(card.risk as "low" | "med" | "high") ?? "med"}
          preview={card.preview}
          reasoning={card.reasoning ?? ""}
          initialStatus={card.status ?? "pending"}
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

interface ThreadEmptyStateProps {
  /** WS7.8 — called with the suggestion text when a pill is clicked. */
  onSuggestion: (text: string) => void;
}

function ThreadEmptyState({ onSuggestion }: ThreadEmptyStateProps) {
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
            <SuggestionPill key={s} text={s} onClick={onSuggestion} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface SuggestionPillProps {
  text: string;
  /** WS7.8 — invoked with the pill's text on click. */
  onClick: (text: string) => void;
}

function SuggestionPill({ text, onClick }: SuggestionPillProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(text)}
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
