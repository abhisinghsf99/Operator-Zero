/**
 * app/app/chat/page.tsx
 * Chat index page — RSC shell for the Conversation surface.
 *
 * Redirects to onboarding if onboarding_completed_at is null.
 * Lists threads and renders the chat layout with no active thread
 * (prompts user to select a thread or start a new one).
 *
 * SECURITY: Middleware has already validated the JWT before this renders.
 *   getOrCreateProfile() performs the live DB round-trip (RLS enforced).
 *
 * DESIGN: surface-conversation.jsx — the "select or create a thread" state
 *   shows the same centered empty-state visual as ThreadEmptyState in message-stream.
 */

import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { listThreads } from "./actions";
import { ThreadSidebar } from "@/components/chat/thread-sidebar";

export default async function ChatPage() {
  // 1. Gate on onboarding — redirect if not completed
  const profile = await getOrCreateProfile();
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  // 2. Load threads for sidebar
  const threadsResult = await listThreads();
  const threads =
    "threads" in threadsResult ? threadsResult.threads : [];

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }} data-testid="chat-page">
      {/* Thread sidebar */}
      <ThreadSidebar threads={threads} activeThreadId={null} />

      {/* No-thread empty state — centered, matches design language */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 14,
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
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            </svg>
          </div>
          <div
            className="display"
            style={{ fontSize: 28, color: "var(--text)", letterSpacing: "-0.02em" }}
          >
            Select a thread to continue
          </div>
          <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>
            Or create a new thread to start chatting with the Orchestrator.
          </p>
        </div>
      </div>
    </div>
  );
}
