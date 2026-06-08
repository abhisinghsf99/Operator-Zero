/**
 * app/app/chat/[threadId]/page.tsx
 * Chat thread page — RSC shell for a specific conversation thread.
 *
 * Redirects to onboarding if onboarding_completed_at is null.
 * Renders the thread sidebar, message stream, and composer.
 *
 * NEXT.JS 15: params is a Promise — must be awaited.
 * SECURITY: Middleware has validated JWT. Thread ownership is enforced
 *   by the SSE route (RLS + explicit user_id check).
 */

import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { listThreads, listMessages } from "../actions";
import { ThreadSidebar } from "@/components/chat/thread-sidebar";
import { ChatThreadView } from "@/components/chat/message-stream";

interface ChatThreadPageProps {
  params: Promise<{ threadId: string }>;
}

export default async function ChatThreadPage({ params }: ChatThreadPageProps) {
  // 1. Gate on onboarding — redirect if not completed
  const profile = await getOrCreateProfile();
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  // 2. Await params (Next.js 15)
  const { threadId } = await params;

  // 3. Load threads for sidebar + this thread's persisted messages (history)
  const [threadsResult, messagesResult] = await Promise.all([
    listThreads(),
    listMessages(threadId),
  ]);
  const threads =
    "threads" in threadsResult ? threadsResult.threads : [];
  const initialMessages =
    "messages" in messagesResult ? messagesResult.messages : [];

  // Derive the active thread's pinned_at and title from the already-loaded list
  // (no extra query needed — listThreads already fetches these fields)
  const active = threads.find((t) => t.id === threadId);
  const initialPinnedAt = active?.pinned_at ?? null;
  const initialTitle = active?.title ?? null;

  return (
    <div className="flex h-full overflow-hidden" data-testid="chat-thread-page">
      {/*
        Thread sidebar:
          Mobile (<md): hidden — a thread IS active, so the message stream fills full width.
          Desktop (md+): 260px, visible alongside the message stream.
        className="hidden md:flex" uses the default inline width=260 since no width class is passed
        (ThreadSidebar omits inline width only when className is provided — but hidden+flex
        doesn't affect layout below md, and at md+ inline 260 applies alongside display:flex).
      */}
      <ThreadSidebar threads={threads} activeThreadId={threadId} className="hidden md:flex" />

      {/* Active thread view — SSE consumer + composer */}
      <ChatThreadView
        key={threadId}
        threadId={threadId}
        initialMessages={initialMessages}
        initialPinnedAt={initialPinnedAt}
        initialTitle={initialTitle}
      />
    </div>
  );
}
