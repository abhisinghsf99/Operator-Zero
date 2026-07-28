"use client";

/**
 * components/chat/thread-sidebar.tsx
 * Thread list sidebar for the Conversation surface.
 *
 * Renders the reverse-chronological thread list + New Thread button.
 * Calls createThread Server Action on new thread creation.
 *
 * Design contract: surface-conversation.jsx ThreadSidebar section.
 *
 * Mobile drill-down:
 *   - When a thread is active ([threadId]/page.tsx), caller passes
 *     className="hidden md:flex" to hide the sidebar below md.
 *   - On the chat index (page.tsx), caller passes className="flex w-full md:w-[260px]"
 *     so the sidebar fills full width below md (it IS the thread list the user picks from).
 *   - Desktop (md+): sidebar is always 260px; className overrides are additive.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Thread list items are buttons with full keyboard nav
 *   - Active thread indicated by aria-current="page"
 *   - New Thread button has clear label
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createThread } from "@/app/app/chat/actions";
import type { ThreadListItem } from "@/app/app/chat/actions";
import { Button, SectionHeader } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

interface ThreadSidebarProps {
  threads: ThreadListItem[];
  activeThreadId: string | null;
  /** Optional className applied to the <aside> — used for mobile breakpoint gating. */
  className?: string;
}

export function ThreadSidebar({ threads, activeThreadId, className }: ThreadSidebarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleNewThread = () => {
    startTransition(async () => {
      // The literal "New conversation" title here is load-bearing: it's the
      // exact string autoNameThreadIfDefault (app/app/chat/actions.ts) checks
      // for before renaming a thread from its first message (WS7.3). If any
      // other call site ever creates a thread with a different placeholder
      // title, that thread will never get auto-named.
      const result = await createThread("New conversation");
      if ("threadId" in result) {
        router.push(`/app/chat/${result.threadId}`);
      }
    });
  };

  const formatRelativeTime = (date: Date | null): string => {
    if (!date) return "";
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <aside
      className={className}
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: "0.5px solid var(--border)",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
      aria-label="Conversations"
    >
      {/* Header + New Thread button */}
      <div style={{ padding: "20px 16px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Button
          variant="secondary"
          icon="Plus"
          onClick={handleNewThread}
          disabled={isPending}
          aria-label="New thread"
          style={{ justifyContent: "flex-start", width: "100%" }}
        >
          New thread
        </Button>
      </div>

      {/* Thread list */}
      <nav
        style={{ padding: "0 8px 16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}
        aria-label="Thread list"
      >
        {threads.length > 0 && (
          <div style={{ padding: "10px 10px 6px" }}>
            <SectionHeader>Threads</SectionHeader>
          </div>
        )}

        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          return (
            <button
              key={thread.id}
              onClick={() => router.push(`/app/chat/${thread.id}`)}
              aria-current={isActive ? "page" : undefined}
              style={{
                all: "unset",
                padding: "10px 10px",
                cursor: "pointer",
                borderRadius: "var(--r-sm)",
                background: isActive ? "var(--bg-subtle)" : "transparent",
                borderLeft: "2px solid",
                borderLeftColor: isActive ? "var(--acc-chat-ink)" : "transparent",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--bg-subtle)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
              // focus-visible ring via global :focus-visible rule (keyboard nav)
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid var(--acc-chat-ink)";
                e.currentTarget.style.outlineOffset = "-2px";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: isActive ? "var(--text)" : "var(--text-secondary)",
                  fontWeight: isActive ? 500 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {thread.pinned_at != null && (
                  <>
                    <Icons.Pin
                      size={11}
                      style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                      aria-hidden
                    />
                    <span className="sr-only">Pinned. </span>
                  </>
                )}
                {thread.title ?? "Untitled thread"}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {formatRelativeTime(thread.last_message_at)}
              </span>
            </button>
          );
        })}

        {threads.length === 0 && (
          <div
            style={{
              padding: "40px 16px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icons.Chat size={18} style={{ color: "var(--text-faint)" }} />
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No threads yet.</span>
          </div>
        )}
      </nav>
    </aside>
  );
}
