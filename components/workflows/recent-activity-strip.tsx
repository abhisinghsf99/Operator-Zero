"use client";

/**
 * components/workflows/recent-activity-strip.tsx
 * Recent-activity strip with three real stats + "what just happened" ticker.
 *
 * Stats (D-15 — all three are real in v1):
 *   1. "Decisions outstanding"  — live pending-approvals count
 *   2. "Ran while you slept"   — L3 actions in last 12h
 *   3. "Time saved this week"  — per-action-type heuristic, labeled "estimated"
 *
 * Live updates via Supabase Realtime (Pattern 7, T-3-02-02):
 *   - Subscribes to activity:<userId> (INSERT on activity_entries)
 *   - Subscribes to approvals channel (INSERT + UPDATE) for pending count
 * Uses canonical createBrowserClient + setAuth + cancelled-flag + removeChannel pattern
 * (mirrors inline-approval-card.tsx lines 136-181, message-stream.tsx cleanup).
 *
 * T-3-02-03: cancelled-flag + removeChannel prevents duplicate subscriptions in
 * React StrictMode double-mount (RESEARCH Pitfall 2).
 */

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/auth/client";
import { type StripStats, type RecentActivityEntry } from "@/app/app/workflows/page";

// ─── Time formatting helpers ──────────────────────────────────────────────────

function formatTimeSaved(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = (minutes / 60).toFixed(1);
  return `${hrs} hrs`;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function resultIcon(result: string) {
  if (result === "success") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--success)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="Success"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (result === "partial") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--warning)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="Partial"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  if (result === "failed") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--danger)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="Failed"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  return null;
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface RecentActivityStripProps {
  stats: StripStats;
  userId: string;
}

// ─── RecentActivityStrip ──────────────────────────────────────────────────────

export function RecentActivityStrip({ stats, userId }: RecentActivityStripProps) {
  // Live state — initialized from server-fetched values, updated by Realtime
  const [pendingCount, setPendingCount] = useState(stats.pendingApprovalsCount);
  const [l3Count, setL3Count] = useState(stats.l3Last12hCount);
  const [timeSavedMins, setTimeSavedMins] = useState(stats.timeSavedMinutes);
  // Ticker entries — initialized from server, prepended by Realtime INSERTs
  const [ticker, setTicker] = useState<RecentActivityEntry[]>(stats.recentActivity);

  // ── Realtime subscription: activity:<userId> + approvals ─────────────────
  // Canonical pattern: createBrowserClient + setAuth + cancelled-flag + removeChannel
  // Source: inline-approval-card.tsx lines 136-181 (T-3-02-02, T-3-02-03)
  useEffect(() => {
    const supabase = createBrowserClient();
    let activityChannel: ReturnType<typeof supabase.channel> | null = null;
    let approvalsChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      // setAuth: required for the Realtime RLS policy on activity:<userId>
      // Migration 0005 policy: (split_part(realtime.topic(), ':', 2))::uuid = auth.uid()
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      // Activity channel: INSERT on activity_entries for this user
      // Channel name: activity:<userId> (matches migration 0005 RLS policy)
      activityChannel = supabase
        // WR-02: private channel engages migration 0005's realtime.messages RLS
        // policy (split_part(topic,':',2)::uuid = auth.uid()). Without this the
        // topic-name authorization is never evaluated.
        .channel(`activity:${userId}`, { config: { private: true } })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "activity_entries",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const entry = payload.new as {
              id: string;
              occurred_at: string;
              action_type: string;
              action_summary: string;
              result: string;
              automation_level: string | null;
              workflow_id: string | null;
            };

            // Update L3 count if this is an L3 action within the last 12h
            if (entry.automation_level === "L3") {
              const entryTime = new Date(entry.occurred_at).getTime();
              const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
              if (entryTime >= twelveHoursAgo) {
                setL3Count((prev) => prev + 1);
              }
            }

            // Update time-saved: add estimated minutes for this action type
            // TIME_SAVED_MINUTES constants mirror the RSC page — 3 min default
            const TIME_SAVED: Record<string, number> = {
              update_product: 4,
              update_meta_title: 3,
              update_meta_desc: 3,
              update_image_alt: 2,
              update_page_content: 5,
              update_price: 2,
              update_inventory: 2,
              update_status: 1,
              create_redirect: 3,
              send_email_draft: 6,
              send_email_reply: 5,
            };
            const mins = TIME_SAVED[entry.action_type] ?? 3;
            setTimeSavedMins((prev) => prev + mins);

            // Prepend to ticker (keep last 5)
            setTicker((prev) =>
              [
                {
                  id: entry.id,
                  occurred_at: new Date(entry.occurred_at),
                  action_type: entry.action_type,
                  summary: entry.action_summary,
                  result: entry.result,
                  automation_level: entry.automation_level,
                  workflow_id: entry.workflow_id,
                },
                ...prev,
              ].slice(0, 5)
            );
          }
        )
        .subscribe();

      if (cancelled) {
        void supabase.removeChannel(activityChannel);
        return;
      }

      // Approvals channel: UPDATE on approvals for this user (pending count changes)
      approvalsChannel = supabase
        // WR-02: private channel — paired with the realtime.messages RLS policy
        // for approvals-strip:<userId> added in migration 0005.
        .channel(`approvals-strip:${userId}`, { config: { private: true } })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "approvals",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            // New approval inserted → increment pending count
            setPendingCount((prev) => prev + 1);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "approvals",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const updated = payload.new as { status: string };
            // If an approval moved out of pending → decrement
            if (updated.status !== "pending") {
              setPendingCount((prev) => Math.max(0, prev - 1));
            }
          }
        )
        .subscribe();
    })();

    // Cleanup: cancelled-flag + removeChannel (T-3-02-03 / RESEARCH Pitfall 2)
    // Use removeChannel (not unsubscribe) — consistent with message-stream.tsx
    return () => {
      cancelled = true;
      if (activityChannel) void supabase.removeChannel(activityChannel);
      if (approvalsChannel) void supabase.removeChannel(approvalsChannel);
    };
  }, [userId]);

  return (
    <div>
      {/* Three-stat grid */}
      <div
        style={{
          padding: "16px 18px",
          background: "var(--bg-elevated)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-lg)",
          display: "grid",
          gridTemplateColumns: "1fr 0.5px 1fr 0.5px 1fr",
          gap: 18,
          alignItems: "center",
        }}
        role="region"
        aria-label="Recent activity stats"
      >
        {/* Stat 1: Decisions outstanding */}
        <RecentBlock
          label="Decisions outstanding"
          value={String(pendingCount)}
          iconPath="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2"
          accent="approval"
          hint="awaiting your approval"
          href="/app/approvals"
        />

        {/* Divider */}
        <span
          style={{ background: "var(--border)", height: 40, display: "block" }}
          aria-hidden="true"
        />

        {/* Stat 2: Ran while you slept */}
        <RecentBlock
          label="Ran while you slept"
          value={String(l3Count)}
          iconPath="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
          accent="workflow"
          hint="L3 actions, last 12 hours"
          href="/app/activity"
        />

        {/* Divider */}
        <span
          style={{ background: "var(--border)", height: 40, display: "block" }}
          aria-hidden="true"
        />

        {/* Stat 3: Time saved — D-15: always labeled "estimated" */}
        <RecentBlock
          label="Time saved this week"
          value={formatTimeSaved(timeSavedMins)}
          iconPath="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          accent="chat"
          hint="estimated — see how"
          href="/app/activity"
          isEstimated
        />
      </div>

      {/* "What just happened" ticker */}
      <div style={{ marginTop: 16 }}>
        {/* Section header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 0 10px",
          }}
        >
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
            }}
          >
            What just happened
          </span>
        </div>

        {ticker.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-faint)",
              padding: "8px 10px",
            }}
          >
            No recent activity.
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
            role="log"
            aria-label="Recent activity ticker"
            aria-live="polite"
            aria-atomic="false"
          >
            {ticker.slice(0, 5).map((a) => (
              <TickerRow key={a.id} entry={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RecentBlock ──────────────────────────────────────────────────────────────

interface RecentBlockProps {
  label: string;
  value: string;
  iconPath: string;
  accent: string;
  hint: string;
  href: string;
  isEstimated?: boolean;
}

function RecentBlock({
  label,
  value,
  iconPath,
  accent,
  hint,
  href,
  isEstimated,
}: RecentBlockProps) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "4px 6px",
        borderRadius: "var(--r-sm)",
        transition: "background 0.12s",
        textDecoration: "none",
        color: "inherit",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "transparent")
      }
      aria-label={`${label}: ${value}. ${hint}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={`var(--acc-${accent}-ink)`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={iconPath} />
        </svg>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          className="display"
          style={{
            fontSize: 32,
            color: "var(--text)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {/* D-15: "estimated" label is mandatory for time-saved */}
          {isEstimated ? "estimated" : hint}
        </span>
      </div>
    </a>
  );
}

// ─── TickerRow ────────────────────────────────────────────────────────────────

function TickerRow({ entry }: { entry: RecentActivityEntry }) {
  return (
    <a
      href="/app/activity"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        borderRadius: "var(--r-sm)",
        cursor: "pointer",
        transition: "background 0.12s",
        textDecoration: "none",
        color: "inherit",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "transparent")
      }
      aria-label={`${entry.summary} — ${entry.result}`}
    >
      {/* Result indicator */}
      <span style={{ flexShrink: 0 }}>{resultIcon(entry.result)}</span>

      {/* Time */}
      <span
        style={{
          fontSize: 12.5,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
          width: 88,
          flexShrink: 0,
        }}
      >
        {formatRelativeTime(new Date(entry.occurred_at))}
      </span>

      {/* Summary */}
      <span
        style={{
          fontSize: 13,
          color: "var(--text)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {entry.summary}
      </span>

      {/* Level badge */}
      {entry.automation_level && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 18,
            padding: "0 6px",
            background: "var(--bg-subtle)",
            color: "var(--acc-activity-ink)",
            borderRadius: "var(--r-pill)",
            fontFamily: "var(--font-mono)",
            fontWeight: 500,
            fontSize: 11,
            letterSpacing: "0.01em",
            border: "0.5px solid color-mix(in oklch, var(--acc-activity-ink) 18%, transparent)",
            flexShrink: 0,
          }}
        >
          {entry.automation_level}
        </span>
      )}
    </a>
  );
}
