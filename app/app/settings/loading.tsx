/**
 * app/app/settings/loading.tsx
 * Streaming skeleton for the Settings surface.
 *
 * Rendered immediately by Next.js App Router while the RSC (page.tsx) loads.
 * Enables instant shell display (UX-04, PRD §5.4.2 — <1.5s p50 app shell).
 *
 * Structure mirrors the Settings layout:
 *   - Page header skeleton
 *   - Section card skeletons (connections + brand voice + autonomy)
 */
export default function SettingsLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] animate-pulse">
      {/* Page header skeleton */}
      <div className="border-b-[0.5px] border-[var(--border)] bg-[var(--bg)] px-4 md:px-10 py-7">
        <div className="mx-auto max-w-[800px]">
          <div className="h-[11px] w-[70px] rounded-full bg-[var(--bg-elevated)]" />
          <div className="mt-3 h-[36px] w-[240px] rounded-[var(--r-sm)] bg-[var(--bg-elevated)]" />
          <div className="mt-2 h-[14px] w-[380px] rounded-full bg-[var(--bg-elevated)]" />
        </div>
      </div>

      {/* Content skeletons */}
      <div className="mx-auto max-w-[800px] px-4 md:px-10 py-8 space-y-8">
        {[120, 200, 160, 100].map((h, i) => (
          <div
            key={i}
            className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]"
            style={{ height: h }}
          />
        ))}
      </div>
    </div>
  );
}
