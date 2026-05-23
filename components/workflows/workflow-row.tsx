"use client";

/**
 * components/workflows/workflow-row.tsx
 * WorkflowRow — one row in the My Workflows surface.
 *
 * Features (per plan task 2):
 *   - StatusDot: visual status indicator (active/paused/running/draft)
 *   - Name: link to /app/workflows/[id] (Detail route)
 *   - LevelToggle (L1/L2/L3): calls editWorkflow on click; L3 shows one-time
 *     confirmation dialog before saving (WF-08)
 *   - Pause/Resume: calls togglePause, status flips active↔paused (WF-09);
 *     row stays in list
 *   - "+ New Workflow" is in the view header (not this row)
 *   - Accessible disabled states (aria-label, opacity/cursor) per inline-approval-card
 *
 * WF-10: context_workflow_id is NOT passed when "+ New Workflow" is clicked;
 *   the handler in _workflows-view.tsx navigates to /app/chat with no workflow context.
 *   This row only links to the detail route — not new-workflow creation.
 *
 * T-3-02-01: editWorkflow + togglePause Server Actions verify ownership via
 *   withUserRls + user_id filter; the UI cannot bypass this.
 *
 * DESIGN CONTRACT: surface-workflows.jsx WorkflowRow
 * ANALOGS:
 *   - inline-approval-card.tsx (async mutation + isPending guard + accessible disabled)
 *   - components/ui/dialog.tsx (L3 confirm Dialog)
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { editWorkflow, togglePause } from "@/lib/actions/workflows";
import { type WorkflowSummary } from "@/lib/workflows/grouping";
import {
  StatusDot,
  LevelToggle,
  IconButton,
  DomainBadge,
  type Level,
} from "@/components/design/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// ─── WorkflowRow ──────────────────────────────────────────────────────────────

interface WorkflowRowProps {
  workflow: WorkflowSummary;
  isLast: boolean;
}

export function WorkflowRow({ workflow, isLast }: WorkflowRowProps) {
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic local status + level (updated immediately; reverted on error)
  const [localStatus, setLocalStatus] = useState(workflow.status);
  const [localLevel, setLocalLevel] = useState<Level>(
    (workflow.automation_level as Level) ?? "L2"
  );

  // L3 confirm dialog state (WF-08 — one-time confirmation)
  const [pendingL3, setPendingL3] = useState(false);

  // ── Level toggle handler ─────────────────────────────────────────────────

  const handleLevelSelect = useCallback(
    (level: Level) => {
      if (isPending) return;
      if (level === "L3" && localLevel !== "L3") {
        // L3 selection: show one-time confirm dialog first (WF-08)
        setPendingL3(true);
        return;
      }
      void doEditLevel(level);
    },
    [isPending, localLevel] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const doEditLevel = useCallback(
    async (level: Level) => {
      const prevLevel = localLevel;
      setLocalLevel(level);
      setIsPending(true);
      setError(null);
      try {
        const result = await editWorkflow(workflow.id, { automation_level: level });
        if ("error" in result) {
          setLocalLevel(prevLevel); // Revert on error
          setError(result.error);
        }
      } catch (err) {
        setLocalLevel(prevLevel);
        setError(err instanceof Error ? err.message : "Failed to update level");
      } finally {
        setIsPending(false);
      }
    },
    [workflow.id, localLevel]
  );

  // L3 confirm dialog callbacks
  const handleL3Confirm = useCallback(() => {
    setPendingL3(false);
    void doEditLevel("L3");
  }, [doEditLevel]);

  const handleL3Cancel = useCallback(() => {
    setPendingL3(false);
  }, []);

  // ── Pause/resume handler ──────────────────────────────────────────────────
  // stopPropagation is handled at the actions wrapper div; no event arg needed.

  const handleTogglePause = useCallback(
    async () => {
      if (isPending) return;
      const prevStatus = localStatus;
      const nextStatus = localStatus === "paused" ? "active" : "paused";
      setLocalStatus(nextStatus); // Optimistic update
      setIsPending(true);
      setError(null);
      try {
        const result = await togglePause(workflow.id);
        if ("error" in result) {
          setLocalStatus(prevStatus); // Revert on error
          setError(result.error);
        }
      } catch (err) {
        setLocalStatus(prevStatus);
        setError(
          err instanceof Error ? err.message : "Failed to toggle pause"
        );
      } finally {
        setIsPending(false);
      }
    },
    [workflow.id, isPending, localStatus]
  );

  const isPaused = localStatus === "paused";
  // Show "running" pulse if workflow was active and updated within the last 10 min.
  // updated_at may be a Date or ISO string after RSC serialization.
  const isRunning =
    localStatus === "active" &&
    workflow.updated_at != null &&
    new Date(workflow.updated_at as Date | string).getTime() > Date.now() - 10 * 60 * 1000;

  // ── Row click → detail page ───────────────────────────────────────────────
  const handleRowClick = useCallback(() => {
    router.push(`/app/workflows/${workflow.id}`);
  }, [router, workflow.id]);

  return (
    <>
      {/* L3 Confirm Dialog (WF-08) */}
      <Dialog open={pendingL3} onOpenChange={(open) => !open && setPendingL3(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Autonomous (L3) mode?</DialogTitle>
            <DialogDescription>
              In L3 mode, the agent acts fully autonomously — no approval required
              for each action. It will execute this workflow without asking you first.
              You can always downgrade back to L2 or L1 at any time.
            </DialogDescription>
          </DialogHeader>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              padding: "0 0 4px",
            }}
          >
            Workflow: <strong>{workflow.name}</strong>
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <button
                type="button"
                onClick={handleL3Cancel}
                style={{
                  height: 34,
                  padding: "0 14px",
                  fontSize: 13,
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg-elevated)",
                  color: "var(--text)",
                  border: "0.5px solid var(--border-strong)",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={handleL3Confirm}
              aria-label="Confirm enabling L3 autonomous mode"
              style={{
                height: 34,
                padding: "0 14px",
                fontSize: 13,
                borderRadius: "var(--r-sm)",
                background: "var(--acc-workflow-ink)",
                color: "var(--bg)",
                border: "0.5px solid transparent",
                fontFamily: "inherit",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Enable L3
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Row — full row is clickable, navigates to detail page */}
      <div
        role="listitem"
        onClick={handleRowClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 110px 140px 140px auto",
          alignItems: "center",
          gap: 16,
          padding: "14px 18px",
          borderBottom: isLast ? "none" : "0.5px solid var(--border-hairline)",
          cursor: "pointer",
          background: hover ? "var(--bg-subtle)" : "transparent",
          transition: "background 0.12s",
          minHeight: 60,
        }}
      >
        {/* Name + description */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusDot status={isRunning ? "running" : localStatus} />
            {/* Name — stopPropagation so clicking the text still navigates via row */}
            <span
              style={{
                fontSize: 14,
                color: "var(--text)",
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            >
              {workflow.name}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* DomainBadge — shows trigger_type as domain label */}
            <DomainBadge domain={workflow.trigger_type} />
            {typeof workflow.description === "string" && workflow.description && (
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {workflow.description}
              </span>
            )}
          </div>

          {/* Inline error display */}
          {error && (
            <span
              style={{ fontSize: 11, color: "var(--danger)" }}
              role="alert"
            >
              {error}
            </span>
          )}
        </div>

        {/* Level toggle (WF-08) — stopPropagation to prevent row navigation */}
        <div
          style={{ display: "flex", justifyContent: "flex-start" }}
          onClick={(e) => e.stopPropagation()}
        >
          <LevelToggle
            value={localLevel}
            onChange={handleLevelSelect}
            size="sm"
          />
        </div>

        {/* Last run */}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "var(--font-mono)",
            }}
          >
            Last
          </span>
          <span
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {workflow.updated_at
              ? new Date(workflow.updated_at).toLocaleDateString()
              : "never"}
          </span>
        </div>

        {/* Next run (placeholder — schedule data lives in trigger_config) */}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "var(--font-mono)",
            }}
          >
            Next
          </span>
          <span
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            —
          </span>
        </div>

        {/* Actions: pause/resume + more — IconButton primitives */}
        <div
          style={{
            display: "flex",
            gap: 2,
            opacity: hover ? 1 : 0.4,
            transition: "opacity 0.12s",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pause / Resume — IconButton (WF-09) */}
          <IconButton
            icon={isPaused ? "Play" : "Pause"}
            size={28}
            title={
              isPending
                ? "Saving..."
                : isPaused
                ? `Resume workflow: ${workflow.name}`
                : `Pause workflow: ${workflow.name}`
            }
            aria-label={
              isPending
                ? "Saving..."
                : isPaused
                ? `Resume workflow: ${workflow.name}`
                : `Pause workflow: ${workflow.name}`
            }
            onClick={() => void handleTogglePause()}
          />

          {/* More actions placeholder */}
          <IconButton
            icon="More"
            size={28}
            title="More actions"
            aria-label={`More actions for workflow: ${workflow.name}`}
          />
        </div>
      </div>
    </>
  );
}
