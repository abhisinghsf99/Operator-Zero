/**
 * app/app/workflows/loading.tsx
 * Streaming skeleton for the My Workflows surface.
 *
 * Rendered immediately by Next.js App Router while the RSC (page.tsx) loads.
 * Enables <500ms p50 perceived load for My Workflows (UX-04, PRD §5.4.2).
 *
 * Structure mirrors the WorkflowsView layout:
 *   - Strip stats row skeleton
 *   - Section header skeleton
 *   - Workflow card skeletons
 */
export default function WorkflowsLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] animate-pulse">
      {/* Strip stats skeleton */}
      <div className="border-b border-[var(--border)] px-4 md:px-10 py-5">
        <div className="flex gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="h-[24px] w-[40px] rounded-[var(--r-xs)] bg-[var(--bg-elevated)]" />
              <div className="h-[11px] w-[80px] rounded-full bg-[var(--bg-elevated)]" />
            </div>
          ))}
        </div>
      </div>

      {/* Page header skeleton */}
      <div className="px-4 md:px-10 pt-8 pb-4">
        <div className="h-[11px] w-[100px] rounded-full bg-[var(--bg-elevated)]" />
        <div className="mt-3 h-[36px] w-[280px] rounded-[var(--r-sm)] bg-[var(--bg-elevated)]" />
        <div className="mt-2 h-[14px] w-[380px] rounded-full bg-[var(--bg-elevated)]" />
      </div>

      {/* Workflow cards skeleton */}
      <div className="px-4 md:px-10 py-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[72px] rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]"
          />
        ))}
      </div>
    </div>
  );
}
