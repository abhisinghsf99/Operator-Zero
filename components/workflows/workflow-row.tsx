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
import Link from "next/link";
import { editWorkflow, togglePause } from "@/lib/actions/workflows";
import { type WorkflowSummary } from "@/lib/workflows/grouping";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AutomationLevel = "L1" | "L2" | "L3";

// ─── StatusDot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "var(--success)",
    success: "var(--success)",
    paused: "var(--text-faint)",
    draft: "var(--text-faint)",
    error: "var(--danger)",
    failed: "var(--danger)",
    partial: "var(--warning)",
    running: "var(--acc-workflow)",
  };
  const pulse = status === "running" || status === "active";
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: colorMap[status] ?? "var(--text-faint)",
        flexShrink: 0,
        animation: pulse ? "glow 2.4s ease-in-out infinite" : "none",
      }}
      aria-label={`Status: ${status}`}
      role="img"
    />
  );
}

// ─── LevelToggle (inline, with L3 confirm) ────────────────────────────────────

interface LevelToggleProps {
  value: AutomationLevel;
  workflowId: string;
  isPending: boolean;
  onLevelSelect: (level: AutomationLevel) => void;
}

const LEVEL_TITLES: Record<AutomationLevel, string> = {
  L1: "Manual — agent prepares, you trigger",
  L2: "Approval-gated — agent proposes, you approve",
  L3: "Autonomous — agent acts, you observe",
};

function LevelToggle({
  value,
  workflowId,
  isPending,
  onLevelSelect,
}: LevelToggleProps) {
  const levels: AutomationLevel[] = ["L1", "L2", "L3"];
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        background: "var(--bg-subtle)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-sm)",
        gap: 1,
      }}
      role="group"
      aria-label={`Automation level for workflow. Currently ${value}.`}
      id={`level-toggle-${workflowId}`}
    >
      {levels.map((level) => {
        const active = value === level;
        return (
          <button
            key={level}
            type="button"
            title={LEVEL_TITLES[level]}
            aria-label={`Set to ${level}: ${LEVEL_TITLES[level]}`}
            aria-pressed={active}
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              if (!isPending && !active) {
                onLevelSelect(level);
              }
            }}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              letterSpacing: "0.02em",
              background: active ? "var(--bg-elevated)" : "transparent",
              color: active ? "var(--text)" : "var(--text-tertiary)",
              border: "0.5px solid",
              borderColor: active ? "var(--border-strong)" : "transparent",
              borderRadius: "var(--r-xs)",
              cursor: isPending || active ? (isPending ? "not-allowed" : "default") : "pointer",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              transition: "all 0.12s",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

// ─── WorkflowRow ──────────────────────────────────────────────────────────────

interface WorkflowRowProps {
  workflow: WorkflowSummary;
  isLast: boolean;
}

export function WorkflowRow({ workflow, isLast }: WorkflowRowProps) {
  const [hover, setHover] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic local status + level (updated immediately; reverted on error)
  const [localStatus, setLocalStatus] = useState(workflow.status);
  const [localLevel, setLocalLevel] = useState<AutomationLevel>(
    (workflow.automation_level as AutomationLevel) ?? "L2"
  );

  // L3 confirm dialog state (WF-08 — one-time confirmation)
  const [pendingL3, setPendingL3] = useState(false);

  // ── Level toggle handler ─────────────────────────────────────────────────

  const handleLevelSelect = useCallback(
    (level: AutomationLevel) => {
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
    async (level: AutomationLevel) => {
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

  const handleTogglePause = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
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

  return (
    <>
      {/* L3 Confirm Dialog (WF-08) */}
      {/* context_workflow_id is NOT set here — this is a level change, not new-workflow */}
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

      {/* Row */}
      <div
        role="listitem"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 110px 140px 140px auto",
          alignItems: "center",
          gap: 16,
          padding: "14px 18px",
          borderBottom: isLast ? "none" : "0.5px solid var(--border-hairline)",
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
            <StatusDot status={localStatus} />
            {/* Name links to detail page (D-01: inline edit in detail, not list) */}
            <Link
              href={`/app/workflows/${workflow.id}`}
              style={{
                fontSize: 14,
                color: "var(--text)",
                fontWeight: 500,
                letterSpacing: "-0.005em",
                textDecoration: "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {workflow.name}
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Domain badge from trigger_type (simplified — full domain data in detail) */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--text-tertiary)",
                padding: "1px 7px 1px 5px",
                background: "var(--bg-subtle)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--r-xs)",
                height: 20,
                flexShrink: 0,
              }}
            >
              {workflow.trigger_type}
            </span>
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

        {/* Level toggle (WF-08) */}
        {/* context_workflow_id not relevant here — this is level change, not new-workflow */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <LevelToggle
            value={localLevel}
            workflowId={workflow.id}
            isPending={isPending}
            onLevelSelect={handleLevelSelect}
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

        {/* Actions: pause/resume + accessible disabled states */}
        <div
          style={{
            display: "flex",
            gap: 2,
            opacity: hover ? 1 : 0.4,
            transition: "opacity 0.12s",
          }}
        >
          {/* Pause / Resume button (WF-09) */}
          <button
            type="button"
            onClick={handleTogglePause}
            disabled={isPending}
            aria-label={
              isPending
                ? "Saving..."
                : isPaused
                ? `Resume workflow: ${workflow.name}`
                : `Pause workflow: ${workflow.name}`
            }
            title={isPaused ? "Resume" : "Pause"}
            style={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "0.5px solid transparent",
              borderRadius: "var(--r-sm)",
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.5 : 1,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              if (!isPending) {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--bg-subtle)";
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-secondary)";
            }}
          >
            {isPaused ? (
              // Play icon (resume)
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            ) : (
              // Pause icon
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            )}
          </button>

          {/* More actions placeholder */}
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={`More actions for workflow: ${workflow.name}`}
            title="More"
            style={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "0.5px solid transparent",
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--bg-subtle)";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-secondary)";
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
