/**
 * app/app/approvals/loading.tsx
 * Streaming skeleton for the Approval Inbox surface.
 *
 * Rendered immediately by Next.js App Router while the RSC (page.tsx) loads.
 * Provides an instant visual shell before data is available — enables <1.5s
 * perceived load time (UX-04, PRD §5.4.2).
 *
 * Structure mirrors the two-pane approvals layout:
 *   - Header skeleton (kicker + title)
 *   - Filter chip skeletons
 *   - List panel: 5 skeleton rows
 *   - Detail panel: content skeleton
 */
export default function ApprovalsLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)] animate-pulse">
      {/* Surface header skeleton */}
      <div
        className="shrink-0 border-b border-[var(--border)] bg-[var(--bg)]"
        style={{ padding: "28px 40px 20px" }}
      >
        <div className="h-[11px] w-[120px] rounded-full bg-[var(--bg-elevated)]" />
        <div className="mt-3 h-[28px] w-[260px] rounded-[var(--r-sm)] bg-[var(--bg-elevated)]" />
        <div className="mt-2 h-[14px] w-[340px] rounded-full bg-[var(--bg-elevated)]" />
      </div>

      {/* Filter chips skeleton */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-10 py-[14px]">
        {[80, 100, 80, 60, 56, 90].map((w, i) => (
          <div
            key={i}
            className="h-[28px] rounded-[var(--r-pill)] bg-[var(--bg-elevated)]"
            style={{ width: w }}
          />
        ))}
      </div>

      {/* Two-pane skeleton */}
      <div className="flex flex-1 overflow-hidden">
        {/* List panel skeleton — 380px on md+ */}
        <div className="hidden w-[380px] shrink-0 flex-col border-r border-[var(--border)] md:flex">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex gap-[10px] border-b border-[var(--border-hairline,var(--border))] px-5 py-[14px]"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                <div className="flex items-center gap-2">
                  <div className="h-[10px] w-[30px] rounded-full bg-[var(--bg-elevated)]" />
                  <div className="ml-auto h-[10px] w-[20px] rounded-full bg-[var(--bg-elevated)]" />
                </div>
                <div className="h-[14px] w-full rounded-[var(--r-xs)] bg-[var(--bg-elevated)]" />
                <div className="h-[11px] w-[80px] rounded-full bg-[var(--bg-elevated)]" />
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel skeleton */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="mx-auto w-full max-w-[720px] px-9 py-8">
            <div className="mb-[18px] flex flex-col gap-[6px]">
              <div className="h-[11px] w-[100px] rounded-full bg-[var(--bg-elevated)]" />
              <div className="h-[32px] w-[300px] rounded-[var(--r-sm)] bg-[var(--bg-elevated)]" />
              <div className="h-[12px] w-[80px] rounded-full bg-[var(--bg-elevated)]" />
            </div>
            <div className="h-[80px] rounded-[var(--r-md)] bg-[var(--bg-elevated)]" />
            <div className="mt-4 h-[120px] rounded-[var(--r-md)] bg-[var(--bg-elevated)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
