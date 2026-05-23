/**
 * app/app/chat/loading.tsx
 * Streaming skeleton for the Conversation (Chat) surface.
 *
 * Rendered immediately by Next.js App Router while the RSC (page.tsx) loads.
 * Enables instant shell display (UX-04, PRD §5.4.2 — <1.5s p50 app shell).
 *
 * Structure mirrors the Chat layout:
 *   - Thread list panel skeleton (left sidebar on desktop)
 *   - Main conversation area skeleton
 */
export default function ChatLoading() {
  return (
    <div className="flex h-full overflow-hidden bg-[var(--bg)] animate-pulse">
      {/* Thread list skeleton (desktop) */}
      <div className="hidden w-[280px] shrink-0 flex-col border-r border-[var(--border)] md:flex">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <div className="h-[32px] rounded-[var(--r-sm)] bg-[var(--bg-elevated)]" />
        </div>
        <div className="flex-1 space-y-1 p-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-[56px] rounded-[var(--r-sm)] bg-[var(--bg-elevated)]"
            />
          ))}
        </div>
      </div>

      {/* Conversation area skeleton */}
      <div className="flex flex-1 flex-col">
        {/* Chat header */}
        <div className="shrink-0 border-b border-[var(--border)] px-6 py-4">
          <div className="h-[20px] w-[160px] rounded-full bg-[var(--bg-elevated)]" />
        </div>

        {/* Messages area */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {[200, 120, 280, 100].map((w, i) => (
            <div
              key={i}
              className="flex"
              style={{ justifyContent: i % 2 === 0 ? "flex-start" : "flex-end" }}
            >
              <div
                className="h-[40px] rounded-[var(--r-lg)] bg-[var(--bg-elevated)]"
                style={{ width: Math.min(w, 280) }}
              />
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-[var(--border)] px-6 py-4">
          <div className="h-[44px] rounded-[var(--r-lg)] bg-[var(--bg-elevated)]" />
        </div>
      </div>
    </div>
  );
}
