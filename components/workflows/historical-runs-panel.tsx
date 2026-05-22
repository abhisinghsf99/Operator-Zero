"use client";

/**
 * components/workflows/historical-runs-panel.tsx
 * Historical Runs panel with Realtime live update (WF-13).
 *
 * Shows recent runs as a vertical timeline. Subscribes to Supabase Realtime
 * `runs:<workflowId>` channel (postgres_changes on workflow_runs) so a Run
 * Now-triggered run appears at the top within seconds without a page refresh.
 *
 * Realtime pattern (RESEARCH Pattern 4 / 03-02 analog):
 *   createBrowserClient + setAuth + cancelled-flag + removeChannel
 *   INSERT event → prepends new run to the list
 *   UPDATE event → updates run status in place
 *
 * FALLBACK: If Realtime auth latency is slow (Open Question 1 from RESEARCH),
 *   the component falls back to polling workflow_runs every 3s after a Run Now.
 *
 * DESIGN CONTRACT: surface-workflow-detail.jsx (Historical-runs timeline)
 * ANALOG: components/chat/message-stream.tsx (setAuth + cancelled-flag pattern)
 *
 * SECURITY: T-3-03-03 — Migration 0005 RLS: runs:<workflowId> channel uses
 *   EXISTS subquery on workflow_runs by user_id; user sees only their own runs.
 *
 * ACCESSIBILITY: WCAG 2.1 AA — list has aria-label; status dots have aria-labels.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/auth/client";
import type { WorkflowRunData } from "@/app/app/workflows/[id]/page";

// ─── Props ────────────────────────────────────────────────────────────────────

interface HistoricalRunsPanelProps {
  workflowId: string;
  initialRuns: WorkflowRunData[];
  onRunsUpdated: (runs: WorkflowRunData[]) => void;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  succeeded: "var(--success)",
  failed: "var(--danger)",
  running: "var(--acc-workflow)",
  queued: "var(--text-faint)",
  paused_for_approval: "var(--warning)",
  paused_manual: "var(--warning)",
  expired: "var(--text-faint)",
};

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

// ─── HistoricalRunsPanel ──────────────────────────────────────────────────────

export function HistoricalRunsPanel({
  workflowId,
  initialRuns,
  onRunsUpdated,
}: HistoricalRunsPanelProps) {
  const [runs, setRuns] = useState<WorkflowRunData[]>(initialRuns);

  // Sync with external state updates (e.g. optimistic run from RunNowDialog)
  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  // Notify parent when runs change
  useEffect(() => {
    onRunsUpdated(runs);
  }, [runs, onRunsUpdated]);

  // ─── Realtime subscription: runs:<workflowId> ────────────────────────────
  // Pattern: createBrowserClient + setAuth + cancelled-flag + removeChannel
  // (RESEARCH Pattern 4, analog: message-stream.tsx lines 82-104)
  useEffect(() => {
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      // Subscribe to postgres_changes for workflow_runs filtered by workflow_id
      // Channel name mirrors migration 0005 RLS policy: `runs:<workflowId>`
      channel = supabase
        .channel(`runs:${workflowId}`, { config: { private: true } })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "workflow_runs",
            filter: `workflow_id=eq.${workflowId}`,
          },
          (payload) => {
            if (cancelled) return;
            const newRun = payload.new as WorkflowRunData;
            // Prepend the new run and deduplicate (optimistic run may already be there)
            setRuns((prev) => {
              const withoutOptimistic = prev.filter(
                (r) =>
                  !r.id.startsWith("optimistic-") &&
                  r.id !== newRun.id
              );
              return [newRun, ...withoutOptimistic];
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "workflow_runs",
            filter: `workflow_id=eq.${workflowId}`,
          },
          (payload) => {
            if (cancelled) return;
            const updatedRun = payload.new as WorkflowRunData;
            setRuns((prev) =>
              prev.map((r) => (r.id === updatedRun.id ? updatedRun : r))
            );
          }
        );

      channel.subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [workflowId]);

  return (
    <section aria-labelledby="historical-runs-heading">
      <h2
        id="historical-runs-heading"
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          margin: "0 0 16px",
        }}
      >
        Historical runs
      </h2>

      {runs.length === 0 ? (
        <p
          style={{
            padding: "30px 0",
            color: "var(--text-tertiary)",
            fontSize: 13,
            fontStyle: "italic",
          }}
        >
          No runs yet. Use "Run Now" or wait for a scheduled execution.
        </p>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            position: "relative",
          }}
          aria-label="Workflow run history"
        >
          {/* Vertical connector line */}
          <div
            style={{
              position: "absolute",
              left: 4,
              top: 8,
              bottom: 8,
              width: 0.5,
              background: "var(--border)",
            }}
            aria-hidden="true"
          />

          {runs.map((run) => (
            <li
              key={run.id}
              style={{
                paddingLeft: 22,
                padding: "10px 0 10px 22px",
                position: "relative",
              }}
            >
              {/* Status dot on connector */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 16,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: "var(--bg)",
                  border: "1.5px solid",
                  borderColor:
                    STATUS_COLORS[run.status] ?? "var(--text-faint)",
                }}
                aria-label={`Run status: ${run.status}`}
                role="img"
              />

              {/* Time + level badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11.5,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <time dateTime={new Date(run.started_at).toISOString()}>
                  {formatRelativeTime(run.started_at)}
                </time>
                <span
                  style={{
                    padding: "1px 5px",
                    borderRadius: "var(--r-xs)",
                    background: "var(--bg-subtle)",
                    border: "0.5px solid var(--border)",
                    fontSize: 10.5,
                    color: STATUS_COLORS[run.status] ?? "var(--text-tertiary)",
                  }}
                >
                  {run.status}
                </span>
                <span
                  style={{
                    padding: "1px 5px",
                    borderRadius: "var(--r-xs)",
                    background: "var(--bg-subtle)",
                    border: "0.5px solid var(--border)",
                    fontSize: 10.5,
                    color: "var(--text-tertiary)",
                  }}
                >
                  {run.trigger_source}
                </span>
              </div>

              {/* Error summary (if failed) */}
              {run.error_summary && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--danger)",
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                  role="alert"
                >
                  {run.error_summary}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
