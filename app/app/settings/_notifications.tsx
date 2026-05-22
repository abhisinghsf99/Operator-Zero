/**
 * app/app/settings/_notifications.tsx
 * Notifications section — badge explainer + "coming soon" placeholder only.
 *
 * SET-08: Shows the in-app sidebar badge explanation + a "coming soon" placeholder
 * for the full notification surface. NO functional toggles (deferred to v2 NOTIF-01).
 *
 * This component is intentionally minimal and server-renderable — it has no
 * client-side state and imports nothing from actions.ts.
 *
 * WCAG 2.1 AA:
 *   - aria-labelledby on the section
 */

import { useId } from "react";
import { Bell } from "lucide-react";

export function NotificationsSection() {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-testid="notifications-section"
      className="mt-8"
    >
      <div className="mb-5">
        <h2
          id={headingId}
          className="display text-[28px] tracking-[-0.015em] text-[var(--text)]"
        >
          Notifications
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
          How Operator Zero surfaces things that need your attention.
        </p>
      </div>

      <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-[18px] py-[18px]">
        {/* Sidebar badge explainer */}
        <div className="flex items-start gap-3.5">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
            aria-hidden="true"
          >
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[14px] font-medium text-[var(--text)]">
              In-app sidebar badge
            </p>
            <p className="mt-1 max-w-[520px] text-[13px] leading-[1.55] text-[var(--text-tertiary)]">
              The badge on the Approvals item in the left sidebar shows how many
              workflow actions are waiting for your review. It updates in real time
              as approvals come in and are resolved. No settings needed — it&apos;s always on.
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 border-t-[0.5px] border-[var(--border)]" />

        {/* Coming soon placeholder — SET-08: no functional toggles, honest about v1 scope */}
        <div className="flex items-start gap-3.5">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-subtle)] text-[var(--text-faint)]"
            aria-hidden="true"
          >
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-medium text-[var(--text-secondary)]">
                Email &amp; push notifications
              </p>
              <span className="inline-flex items-center rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                coming soon
              </span>
            </div>
            <p className="mt-1 max-w-[520px] text-[13px] leading-[1.55] text-[var(--text-tertiary)]">
              Per-workflow email and push delivery for approvals and activity
              digests — shipping in v2 (NOTIF-01). No toggles yet.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
