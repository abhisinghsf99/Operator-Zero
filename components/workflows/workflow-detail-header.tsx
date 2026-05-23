"use client";

/**
 * components/workflows/workflow-detail-header.tsx
 * Workflow Detail header.
 *
 * Features (D-01/D-03/D-06/WF-11/WF-12):
 *   - InlineEditableText for name (large display heading) + description
 *   - LevelToggle (design primitive) with L3 one-time confirm dialog (D-03)
 *   - StatusDot (design primitive) for status indicator
 *   - "Open in chat" ghost Button (design primitive, Chat icon) — creates a scoped thread (D-06/WF-12)
 *   - Pause/Resume Button (design primitive) — primary when paused, secondary when active
 *   - Run Now IconButton for explicit trigger (D-05/WF-13)
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
import { Button as ShadcnButton } from "@/components/ui/button";
import {
  Button,
  LevelToggle,
  StatusDot,
  type Level,
} from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
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

// ─── LevelToggleWithConfirm ───────────────────────────────────────────────────
// Wraps the design LevelToggle primitive with L3 one-time confirm dialog (D-03)

interface LevelToggleWithConfirmProps {
  workflowId: string;
  currentLevel: Level;
  onLevelChanged: (level: Level) => void;
}

function LevelToggleWithConfirm({
  workflowId,
  currentLevel,
  onLevelChanged,
}: LevelToggleWithConfirmProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleLevelChange(level: Level) {
    if (level === currentLevel || isPending) return;
    if (level === "L3") {
      // L3 requires explicit confirmation (D-03)
      setConfirmOpen(true);
    } else {
      applyLevel(level);
    }
  }

  function applyLevel(level: Level) {
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
        style={{ opacity: isPending ? 0.6 : 1, transition: "opacity 0.15s" }}
        aria-label="Automation level"
      >
        <LevelToggle
          value={currentLevel}
          onChange={handleLevelChange}
        />
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
              <ShadcnButton variant="secondary" size="sm">
                Cancel
              </ShadcnButton>
            </DialogClose>
            <ShadcnButton
              variant="default"
              size="sm"
              onClick={handleConfirmL3}
              aria-label="Confirm enable L3 autonomous mode"
            >
              Enable L3
            </ShadcnButton>
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

  const isPaused = workflow.status === "paused";

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
        <StatusDot status={workflow.status} />
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

          {/* Level toggle (D-03) — design primitive with L3 confirm */}
          <div style={{ marginTop: 12 }}>
            <LevelToggleWithConfirm
              workflowId={workflow.id}
              currentLevel={workflow.automation_level as Level}
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
            <Icons.Calendar size={12} aria-hidden />
            {workflow.trigger_type}
          </button>
        </div>

        {/* Action buttons — matching design: Open in chat (ghost) + Pause/Resume */}
        <div
          style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}
        >
          {/* Open in Chat (D-06/WF-12) — ghost variant with Chat icon */}
          <Button
            variant="ghost"
            icon="Chat"
            onClick={handleOpenInChat}
            aria-label="Open workflow in Chat"
          >
            Open in chat
          </Button>

          {/* Run Now button (D-05/WF-13) — secondary */}
          <Button
            variant="secondary"
            icon="Play"
            onClick={() => setRunNowOpen(true)}
            aria-label="Run this workflow now"
          >
            Run Now
          </Button>

          {/* Pause/Resume — primary when paused (to resume), secondary when active */}
          <Button
            variant={isPaused ? "primary" : "secondary"}
            icon={isPaused ? "Play" : "Pause"}
            onClick={handleTogglePause}
            disabled={isPausingTransition}
            aria-label={isPaused ? "Resume workflow" : "Pause workflow"}
          >
            {isPausingTransition
              ? isPaused
                ? "Resuming…"
                : "Pausing…"
              : isPaused
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
