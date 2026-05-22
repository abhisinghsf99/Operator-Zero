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
    <div className="flex h-full overflow-hidden" data-testid="chat-page">
      {/* Thread sidebar */}
      <ThreadSidebar threads={threads} activeThreadId={null} />

      {/* Empty state — no active thread */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="max-w-sm">
          <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
            Start a conversation
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Select a thread from the sidebar or create a new one to start
            chatting with Operator Zero.
          </p>
        </div>
      </div>
    </div>
  );
}
