/**
 * app/app/activity/loading.tsx
 * Streaming skeleton for the Activity log surface.
 *
 * Rendered immediately by Next.js App Router while the RSC (page.tsx) loads.
 * Enables instant shell display (UX-04, PRD §5.4.2 — <1.5s p50 app shell).
 *
 * Structure mirrors the Activity layout:
 *   - Surface header skeleton
 *   - Activity entry skeletons (list rows)
 */
export default function ActivityLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)] animate-pulse">
      {/* Surface header skeleton */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg)] px-10 py-7">
        <div className="h-[11px] w-[90px] rounded-full bg-[var(--bg-elevated)]" />
        <div className="mt-3 h-[28px] w-[220px] rounded-[var(--r-sm)] bg-[var(--bg-elevated)]" />
        <div className="mt-2 h-[14px] w-[320px] rounded-full bg-[var(--bg-elevated)]" />
      </div>

      {/* Filter chips skeleton */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-10 py-[14px]">
        {[60, 80, 70, 90].map((w, i) => (
          <div
            key={i}
            className="h-[28px] rounded-[var(--r-pill)] bg-[var(--bg-elevated)]"
            style={{ width: w }}
          />
        ))}
      </div>

      {/* Activity entries skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[800px] px-10 py-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] p-4"
            >
              <div className="h-[32px] w-[32px] shrink-0 rounded-full bg-[var(--bg)]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="h-[14px] w-full rounded-full bg-[var(--bg)]" />
                <div className="h-[12px] w-[60%] rounded-full bg-[var(--bg)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
