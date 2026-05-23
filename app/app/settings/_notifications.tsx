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
import { Icons } from "@/components/design/icons";
import { Card, Badge } from "@/components/design/primitives";

export function NotificationsSection() {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-testid="notifications-section"
    >
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <h2
          id={headingId}
          className="display"
          style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
        >
          Notifications
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 580 }}>
          How Operator Zero surfaces things that need your attention.
        </p>
      </div>

      <Card padding={18}>
        {/* Sidebar badge explainer */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--r-sm)",
              background: "var(--bg-subtle)",
              color: "var(--text-secondary)",
            }}
            aria-hidden="true"
          >
            <Icons.Inbox size={16} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", margin: 0 }}>
              In-app sidebar badge
            </p>
            <p style={{ marginTop: 4, maxWidth: 520, fontSize: 13, lineHeight: 1.55, color: "var(--text-tertiary)" }}>
              The badge on the Approvals item in the left sidebar shows how many
              workflow actions are waiting for your review. It updates in real time
              as approvals come in and are resolved. No settings needed — it&apos;s always on.
            </p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ margin: "16px 0", borderTop: "0.5px solid var(--border)" }} />

        {/* Coming soon placeholder — SET-08: no functional toggles, honest about v1 scope */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--r-sm)",
              background: "var(--bg-subtle)",
              color: "var(--text-faint)",
            }}
            aria-hidden="true"
          >
            <Icons.Sparkles size={16} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", margin: 0 }}>
                Email &amp; push notifications
              </p>
              <Badge size="sm" accent="experiment">v2</Badge>
            </div>
            <p style={{ marginTop: 4, maxWidth: 520, fontSize: 13, lineHeight: 1.55, color: "var(--text-tertiary)" }}>
              Per-workflow email and push delivery for approvals and activity
              digests — shipping in v2 (NOTIF-01). No toggles yet.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
