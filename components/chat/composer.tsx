"use client";

/**
 * components/chat/composer.tsx
 * Chat message composer with FIFO queuing, draft auto-save, and error retry.
 *
 * CONV-09: Graceful degradation
 *   - FIFO queue: a send issued while a response is streaming is held in the
 *     zustand store and flushed exactly once after the in-flight stream completes
 *   - beforeunload draft-save: the handler persists in-progress text for recovery
 *   - Sonner toast + retry button on model error
 *
 * Exported pure functions (testable without a browser):
 *   createComposerStore()  — factory for composer zustand store (queue + streaming state)
 *   saveDraftOnUnload(threadId, text) — persists draft to sessionStorage
 *   loadDraft(threadId)    — recovers draft text from sessionStorage
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Textarea is labeled via aria-label
 *   - Send button is keyboard-operable (type="submit")
 *   - reduced-motion respected (no transition on streaming indicator)
 *
 * DESIGN: surface-conversation.jsx Composer section.
 *   Elevated card with border, textarea, keyboard hint row, Send button.
 */

import { useEffect, useRef, useCallback } from "react";
import { createStore, useStore } from "zustand";
import { toast } from "sonner";
import { Button, Kbd } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

// ─── Draft storage helpers ────────────────────────────────────────────────────

/**
 * saveDraftOnUnload — persists composer text to sessionStorage keyed by threadId.
 * Called from the window beforeunload handler.
 * Empty string removes the draft (clears it).
 * Pure function — no side-effects beyond sessionStorage.
 */
export function saveDraftOnUnload(threadId: string, text: string): void {
  try {
    if (text.trim().length === 0) {
      sessionStorage.removeItem(`oz:draft:${threadId}`);
    } else {
      sessionStorage.setItem(`oz:draft:${threadId}`, text);
    }
  } catch {
    // sessionStorage may be unavailable in some environments — fail silently
  }
}

/**
 * loadDraft — recovers a previously saved draft from sessionStorage.
 * Returns null if no draft exists for the given threadId.
 * Pure function — read-only side-effect.
 */
export function loadDraft(threadId: string): string | null {
  try {
    const stored = sessionStorage.getItem(`oz:draft:${threadId}`);
    return stored && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

// ─── Composer store ───────────────────────────────────────────────────────────

export interface ComposerState {
  /** Current composer text (draft) */
  text: string;
  /** Whether a response is currently streaming */
  streaming: boolean;
  /** FIFO queue of sends issued while streaming=true */
  queue: string[];
  /** Error state: message string if last send errored */
  error: string | null;

  /** Actions */
  setText(text: string): void;
  setStreaming(streaming: boolean): void;
  /** Enqueue a message send — held while streaming=true */
  enqueueSend(message: string): void;
  /**
   * Flush the queue — returns all queued messages in FIFO order and clears the queue.
   * Idempotent: second call on empty queue returns [].
   */
  flushQueue(): string[];
  setError(error: string | null): void;
}

/**
 * createComposerStore — factory for a fresh composer zustand store.
 *
 * Exported as a factory so tests can create isolated instances.
 * In the component, a module-level singleton is created per thread
 * (keyed by threadId in practice; here we create one per component mount).
 */
export function createComposerStore() {
  return createStore<ComposerState>((set, get) => ({
    text: "",
    streaming: false,
    queue: [],
    error: null,

    setText(text) {
      set({ text });
    },

    setStreaming(streaming) {
      set({ streaming });
    },

    enqueueSend(message) {
      set((state) => ({ queue: [...state.queue, message] }));
    },

    flushQueue() {
      const { queue } = get();
      if (queue.length === 0) return [];
      set({ queue: [] });
      return queue;
    },

    setError(error) {
      set({ error });
    },
  }));
}

// ─── Component props ──────────────────────────────────────────────────────────

export interface ComposerProps {
  threadId: string;
  /** Called with the message text when a send is ready to dispatch */
  onSend: (message: string) => Promise<void>;
  /** Whether a response is currently streaming (controlled from parent) */
  isStreaming: boolean;
  /** Callback to flush queued messages when streaming ends */
  onStreamEnd?: (queuedMessages: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

// ─── Composer component ───────────────────────────────────────────────────────

/**
 * Composer — message input with FIFO queue, draft auto-save, and error retry.
 *
 * The FIFO queue and draft-save logic is extracted as pure functions
 * (createComposerStore, saveDraftOnUnload, loadDraft) so they can be
 * unit-asserted without a browser environment.
 */
export function Composer({
  threadId,
  onSend,
  isStreaming,
  onStreamEnd,
  disabled = false,
  placeholder = "Talk to the Orchestrator… describe what you want to automate.",
}: ComposerProps) {
  // One store per Composer instance (fresh per thread mount)
  const storeRef = useRef(createComposerStore());
  const store = storeRef.current;

  const text = useStore(store, (s) => s.text);
  const streaming = useStore(store, (s) => s.streaming);
  const queue = useStore(store, (s) => s.queue);
  const error = useStore(store, (s) => s.error);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external isStreaming prop into store
  useEffect(() => {
    const wasStreaming = store.getState().streaming;
    store.getState().setStreaming(isStreaming);

    // When streaming ends, flush the queue
    if (wasStreaming && !isStreaming) {
      const queued = store.getState().flushQueue();
      if (queued.length > 0 && onStreamEnd) {
        onStreamEnd(queued);
      }
    }
  }, [isStreaming, store, onStreamEnd]);

  // Load saved draft on mount
  useEffect(() => {
    const saved = loadDraft(threadId);
    if (saved) {
      store.getState().setText(saved);
    }
  }, [threadId, store]);

  // beforeunload — auto-save draft on tab close (CONV-09)
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveDraftOnUnload(threadId, store.getState().text);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [threadId, store]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [text]);

  const handleSend = useCallback(async () => {
    const msg = store.getState().text.trim();
    if (!msg) return;

    store.getState().setText("");
    store.getState().setError(null);

    // If streaming — enqueue for later dispatch (FIFO, CONV-09)
    if (store.getState().streaming) {
      store.getState().enqueueSend(msg);
      return;
    }

    try {
      await onSend(msg);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Send failed";
      store.getState().setError(errMsg);

      // Sonner toast with retry (CONV-09)
      toast.error("Failed to send message", {
        description: errMsg,
        action: {
          label: "Retry",
          onClick: () => {
            store.getState().setText(msg);
            store.getState().setError(null);
          },
        },
      });
    }
  }, [store, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const isDisabled = disabled || (streaming && queue.length >= 10);

  return (
    <div style={{ padding: "16px 32px 24px", background: "var(--bg)" }}>
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 8,
            padding: "8px 12px",
            background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
            border: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
            borderRadius: "var(--r-sm)",
            fontSize: 12.5,
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Queue indicator */}
      {streaming && queue.length > 0 && (
        <div
          aria-live="polite"
          style={{ marginBottom: 8, fontSize: 11, color: "var(--text-tertiary)" }}
        >
          {queue.length} message{queue.length > 1 ? "s" : ""} queued — will send after response
        </div>
      )}

      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "0.5px solid var(--border-strong)",
            borderRadius: "var(--r-lg)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            transition: "border-color 0.15s",
          }}
          onFocusCapture={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--acc-chat-ink)";
          }}
          onBlurCapture={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
          }}
        >
          <label htmlFor={`composer-${threadId}`} className="sr-only">
            {placeholder}
          </label>
          <textarea
            ref={textareaRef}
            id={`composer-${threadId}`}
            value={text}
            onChange={(e) => store.getState().setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            rows={1}
            aria-label={placeholder}
            aria-describedby={streaming ? "composer-streaming-indicator" : undefined}
            style={{
              all: "unset",
              width: "100%",
              minHeight: 40,
              maxHeight: 140,
              resize: "none",
              fontSize: 14,
              color: "var(--text)",
              lineHeight: 1.5,
              fontFamily: "inherit",
              background: "transparent",
              cursor: isDisabled ? "not-allowed" : "text",
              opacity: isDisabled ? 0.5 : 1,
            }}
          />

          {/* Bottom row: hints + send button */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Left: memory indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icons.Brain size={12} style={{ color: "var(--text-faint)" }} />
                remembers your store
              </span>
            </div>

            {/* Right: keyboard hints + send */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Kbd>&#9166;</Kbd> send &middot; <Kbd>&#8679;&#9166;</Kbd> newline
              </span>
              <Button
                variant="primary"
                accent="chat"
                size="sm"
                type="submit"
                onClick={() => void handleSend()}
                disabled={isDisabled || !text.trim()}
                icon="ArrowUp"
                aria-label="Send message"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
