"use client";

/**
 * components/workflows/workflow-detail-header.tsx
 * Workflow Detail header.
 *
 * Features (D-01/D-03/D-06/WF-11/WF-12):
 *   - InlineEditableText for name (large display heading) + description
 *   - Automation level selector with L3 one-time confirm dialog (D-03)
 *   - "Open in Chat" → creates a scoped thread with context_workflow_id = workflowId (D-06/WF-12)
 *   - "Run Now" button → opens RunNowDialog (D-05/WF-13)
 *   - Pause/Resume toggle button
 *   - Schedule picker link (trigger_type / trigger_config inline editing per D-02)
 *   - Each edit calls editWorkflow → version increments (D-03)
 *
 * SECURITY:
 *   T-3-03-01: editWorkflow Server Action verifies ownership via withUserRls + user_id
 *   T-3-03-02: runNow Server Action verifies ownership before inngest.send
 *
 * ACCESSIBILITY: WCAG 2.1 AA — all interactive elements have aria-labels;
 *   L3 confirm dialog is focus-trapped via Radix Dialog.
 */

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { InlineEditableText } from "@/components/workflows/inline-editable-text";
import { SchedulePicker } from "@/components/workflows/schedule-picker";
import { RunNowDialog } from "@/components/workflows/run-now-dialog";
import { editWorkflow, togglePause } from "@/lib/actions/workflows";
import { openWorkflowInChat } from "@/app/app/chat/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { WorkflowDetailData, WorkflowRunData } from "@/app/app/workflows/[id]/page";

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorkflowDetailHeaderProps {
  workflow: WorkflowDetailData;
  onWorkflowUpdate: (
    patch: Partial<
      Pick<
        WorkflowDetailData,
        "name" | "description" | "automation_level" | "trigger_type" | "trigger_config"
      >
    >
  ) => void;
  onRunsUpdated: (newRun: WorkflowRunData) => void;
}

// ─── AutomationLevel toggle with L3 confirm ───────────────────────────────────

type AutomationLevel = "L1" | "L2" | "L3";

const LEVEL_LABELS: Record<AutomationLevel, string> = {
  L1: "Manual (L1)",
  L2: "Approval-gated (L2)",
  L3: "Autonomous (L3)",
};

interface LevelSelectorProps {
  workflowId: string;
  currentLevel: AutomationLevel;
  onLevelChanged: (level: AutomationLevel) => void;
}

function LevelSelector({ workflowId, currentLevel, onLevelChanged }: LevelSelectorProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const levels: AutomationLevel[] = ["L1", "L2", "L3"];

  function handleLevelClick(level: AutomationLevel) {
    if (level === currentLevel || isPending) return;
    if (level === "L3") {
      // L3 requires explicit confirmation (D-03)
      setConfirmOpen(true);
    } else {
      applyLevel(level);
    }
  }

  function applyLevel(level: AutomationLevel) {
    startTransition(async () => {
      const result = await editWorkflow(workflowId, { automation_level: level });
      if ("error" in result) {
        toast.error(`Could not update automation level: ${result.error}`);
      } else {
        onLevelChanged(level);
        toast.success(`Automation level set to ${level}`);
      }
    });
  }

  function handleConfirmL3() {
    // WR-04: pass the level explicitly rather than reading async pendingLevel
    // state — removes any chance of applying a stale/nulled value on a fast
    // double-confirm or interleaved re-render (mirrors workflow-row.tsx).
    setConfirmOpen(false);
    applyLevel("L3");
  }

  return (
    <>
      <div
        role="group"
        aria-label="Automation level"
        style={{ display: "flex", gap: 4 }}
      >
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => handleLevelClick(level)}
            disabled={isPending}
            aria-pressed={currentLevel === level}
            aria-label={`Set automation level to ${LEVEL_LABELS[level]}`}
            style={{
              padding: "3px 9px",
              borderRadius: "var(--r-xs)",
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              border: "0.5px solid",
              borderColor:
                currentLevel === level
                  ? "var(--acc-workflow-ink)"
                  : "var(--border)",
              background:
                currentLevel === level
                  ? "var(--acc-workflow)"
                  : "transparent",
              color:
                currentLevel === level
                  ? "var(--text)"
                  : "var(--text-tertiary)",
              cursor: isPending || currentLevel === level ? "default" : "pointer",
              opacity: isPending ? 0.6 : 1,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            {level}
          </button>
        ))}
      </div>

      {/* L3 one-time confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Autonomous (L3) mode?</DialogTitle>
            <DialogDescription>
              In L3 mode, the agent will execute this workflow fully autonomously —
              no approvals required for any action it takes. Make sure you trust the
              workflow definition before enabling this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirmL3}
              aria-label="Confirm enable L3 autonomous mode"
            >
              Enable L3
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── WorkflowDetailHeader ─────────────────────────────────────────────────────

export function WorkflowDetailHeader({
  workflow,
  onWorkflowUpdate,
  onRunsUpdated,
}: WorkflowDetailHeaderProps) {
  const router = useRouter();
  const [runNowOpen, setRunNowOpen] = useState(false);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [isPausingTransition, startPauseTransition] = useTransition();

  // Save name inline edit → editWorkflow + version increment (D-01/D-03)
  const handleSaveName = useCallback(
    async (newValue: string) => {
      const result = await editWorkflow(workflow.id, { name: newValue });
      if ("error" in result) throw new Error(result.error);
      onWorkflowUpdate({ name: newValue });
      toast.success("Workflow name updated");
    },
    [workflow.id, onWorkflowUpdate]
  );

  // Save description inline edit → editWorkflow + version increment (D-01/D-03)
  const handleSaveDescription = useCallback(
    async (newValue: string) => {
      const result = await editWorkflow(workflow.id, { description: newValue });
      if ("error" in result) throw new Error(result.error);
      onWorkflowUpdate({ description: newValue });
      toast.success("Description updated");
    },
    [workflow.id, onWorkflowUpdate]
  );

  // Open in Chat → create scoped thread with context_workflow_id (D-06/WF-12)
  const handleOpenInChat = useCallback(async () => {
    const result = await openWorkflowInChat(workflow.id, workflow.name);
    if ("error" in result) {
      toast.error(`Could not open chat: ${result.error}`);
      return;
    }
    // Thread is created with context_workflow_id set in the DB (D-06)
    router.push(`/app/chat/${result.threadId}`);
  }, [workflow.id, workflow.name, router]);

  // Pause/Resume toggle
  const handleTogglePause = useCallback(() => {
    startPauseTransition(async () => {
      const result = await togglePause(workflow.id);
      if ("error" in result) {
        toast.error(`Could not ${workflow.status === "paused" ? "resume" : "pause"}: ${result.error}`);
      } else {
        toast.success(workflow.status === "paused" ? "Workflow resumed" : "Workflow paused");
      }
    });
  }, [workflow.id, workflow.status]);

  const statusLabel =
    workflow.status === "active"
      ? "Active"
      : workflow.status === "paused"
      ? "Paused"
      : workflow.status;

  return (
    <header
      style={{
        padding: "20px 40px 24px",
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      {/* Status + domain row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background:
              workflow.status === "active"
                ? "var(--success)"
                : workflow.status === "paused"
                ? "var(--text-faint)"
                : "var(--text-faint)",
            display: "inline-block",
            flexShrink: 0,
            animation:
              workflow.status === "active"
                ? "glow 2.4s ease-in-out infinite"
                : "none",
          }}
          aria-label={`Status: ${statusLabel}`}
          role="img"
        />
        <span
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.05em",
            fontFamily: "var(--font-mono)",
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Name + actions row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Inline-editable name (D-01/D-03) */}
          <InlineEditableText
            value={workflow.name}
            onSave={handleSaveName}
            ariaLabel="Workflow name"
            placeholder="Workflow name"
            className="display"
            style={{
              fontSize: 36,
              color: "var(--text)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              fontWeight: 700,
              display: "block",
              width: "100%",
            }}
            inputStyle={{ fontSize: 36, fontWeight: 700 }}
          />

          {/* Inline-editable description (D-01/D-03) */}
          <InlineEditableText
            value={workflow.description ?? ""}
            onSave={handleSaveDescription}
            ariaLabel="Workflow description"
            placeholder="Add a description…"
            style={{
              marginTop: 8,
              display: "block",
              fontSize: 14,
              color: "var(--text-tertiary)",
              lineHeight: 1.5,
              maxWidth: 680,
            }}
          />

          {/* Level selector (D-03) */}
          <div style={{ marginTop: 12 }}>
            <LevelSelector
              workflowId={workflow.id}
              currentLevel={workflow.automation_level as "L1" | "L2" | "L3"}
              onLevelChanged={(level) => onWorkflowUpdate({ automation_level: level })}
            />
          </div>

          {/* Schedule / trigger (D-02) */}
          <button
            onClick={() => setSchedulePickerOpen(true)}
            aria-label={`Edit schedule: currently ${workflow.trigger_type}`}
            style={{
              all: "unset",
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--text-tertiary)",
              cursor: "pointer",
              padding: "2px 0",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {workflow.trigger_type}
          </button>
        </div>

        {/* Action buttons */}
        <div
          style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}
        >
          {/* Open in Chat (D-06/WF-12) — sets context_workflow_id */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenInChat}
            aria-label="Open workflow in Chat"
            data-context-workflow-id={workflow.id}
          >
            Open in Chat
          </Button>

          {/* Run Now button (D-05/WF-13) */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setRunNowOpen(true)}
            aria-label="Run this workflow now"
          >
            Run Now
          </Button>

          {/* Pause/Resume */}
          <Button
            variant={workflow.status === "paused" ? "default" : "secondary"}
            size="sm"
            onClick={handleTogglePause}
            disabled={isPausingTransition}
            aria-label={workflow.status === "paused" ? "Resume workflow" : "Pause workflow"}
            aria-busy={isPausingTransition}
          >
            {isPausingTransition
              ? workflow.status === "paused"
                ? "Resuming…"
                : "Pausing…"
              : workflow.status === "paused"
              ? "Resume"
              : "Pause"}
          </Button>
        </div>
      </div>

      {/* Schedule Picker (D-02) */}
      {schedulePickerOpen && (
        <SchedulePicker
          workflowId={workflow.id}
          currentTriggerType={workflow.trigger_type}
          currentTriggerConfig={workflow.trigger_config}
          onSaved={(patch) => {
            onWorkflowUpdate(patch);
            setSchedulePickerOpen(false);
          }}
          onClose={() => setSchedulePickerOpen(false)}
        />
      )}

      {/* Run Now Dialog (D-05/WF-13) */}
      <RunNowDialog
        workflowId={workflow.id}
        workflowName={workflow.name}
        automationLevel={workflow.automation_level}
        open={runNowOpen}
        onClose={() => setRunNowOpen(false)}
        onRunTriggered={onRunsUpdated}
      />
    </header>
  );
}
