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
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Thread list items are buttons with full keyboard nav
 *   - Active thread indicated by aria-current="page"
 *   - New Thread button has clear label
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createThread } from "@/app/app/chat/actions";
import type { ThreadListItem } from "@/app/app/chat/actions";

interface ThreadSidebarProps {
  threads: ThreadListItem[];
  activeThreadId: string | null;
}

export function ThreadSidebar({ threads, activeThreadId }: ThreadSidebarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleNewThread = () => {
    startTransition(async () => {
      // Create a thread with an empty first message to get the ID
      // The user's actual first message will be sent via the composer
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
      className={cn(
        "flex w-[260px] flex-shrink-0 flex-col",
        "border-r border-[var(--border)] bg-[var(--bg)]"
      )}
      aria-label="Conversations"
    >
      {/* Header + New Thread button */}
      <div className="flex flex-col gap-3 px-4 pb-3 pt-5">
        <button
          onClick={handleNewThread}
          disabled={isPending}
          aria-label="New thread"
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-[var(--border)]",
            "bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)]",
            "hover:bg-[var(--bg-deeper)] hover:text-[var(--text)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-chat-ink)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors"
          )}
        >
          <Plus size={14} aria-hidden="true" />
          New thread
        </button>
      </div>

      {/* Thread list */}
      <nav
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4"
        aria-label="Thread list"
      >
        {threads.length > 0 && (
          <div className="px-2 pb-1.5 pt-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Threads
            </span>
          </div>
        )}

        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          return (
            <button
              key={thread.id}
              onClick={() => router.push(`/app/chat/${thread.id}`)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2.5",
                "border-l-2 text-left",
                isActive
                  ? "border-l-[var(--acc-chat-ink)] bg-[var(--bg-subtle)]"
                  : "border-l-transparent hover:bg-[var(--bg-subtle)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-chat-ink)]",
                "transition-colors"
              )}
            >
              <span
                className={cn(
                  "truncate text-[13px]",
                  isActive
                    ? "font-medium text-[var(--text)]"
                    : "font-normal text-[var(--text-secondary)]"
                )}
              >
                {thread.title ?? "Untitled thread"}
              </span>
              <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                {formatRelativeTime(thread.last_message_at)}
              </span>
            </button>
          );
        })}

        {threads.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-[var(--text-tertiary)]">
            No threads yet. Start a new conversation.
          </p>
        )}
      </nav>
    </aside>
  );
}
