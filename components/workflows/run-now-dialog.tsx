"use client";

/**
 * components/workflows/run-now-dialog.tsx
 * Run Now confirmation dialog (D-05/WF-13).
 *
 * Behavior (D-05):
 *   - For WRITE or L3 workflows: show a one-tap confirm dialog summarizing what
 *     Run Now will do, then call runNow(workflowId) on confirm.
 *   - For READ-ONLY (L1 manual) or MANUAL trigger workflows: call runNow directly
 *     without showing a dialog (instant execution).
 *
 * "Write" workflows = L3 (fully autonomous, potentially writes data externally).
 * "Read-only / manual" = L1 (manual trigger, user-initiated) — lower risk.
 * L2 is approval-gated — confirm dialog shown as a precaution.
 *
 * After a successful runNow, calls onRunTriggered with a synthetic run row so
 * the HistoricalRunsPanel shows the new run optimistically. Realtime will sync
 * the real status within seconds.
 *
 * ANALOG: components/app/settings/_connections.tsx (Radix Dialog + useTransition)
 * ACCESSIBILITY: WCAG 2.1 AA — focus-trapped dialog, aria-busy pending state.
 *
 * SECURITY: T-3-03-02 — runNow Server Action verifies ownership via withUserRls;
 *   the confirm dialog is a client-side UX gate only.
 */

import { useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { runNow } from "@/lib/actions/workflows";
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
import type { WorkflowRunData } from "@/app/app/workflows/[id]/page";

// ─── Props ────────────────────────────────────────────────────────────────────

interface RunNowDialogProps {
  workflowId: string;
  workflowName: string;
  /** Automation level: 'L1' | 'L2' | 'L3' */
  automationLevel: string;
  open: boolean;
  onClose: () => void;
  /** Called with a synthetic run row after successful trigger */
  onRunTriggered: (run: WorkflowRunData) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine if a confirm dialog is required before running.
 * D-05: confirm for write/L3 and L2 workflows; instant for L1 manual.
 */
function requiresConfirmDialog(automationLevel: string): boolean {
  // L3 (fully autonomous) and L2 (approval-gated) get the confirm dialog
  // L1 (manual trigger) runs instantly without dialog
  return automationLevel === "L3" || automationLevel === "L2";
}

// ─── RunNowDialog ─────────────────────────────────────────────────────────────

export function RunNowDialog({
  workflowId,
  workflowName,
  automationLevel,
  open,
  onClose,
  onRunTriggered,
}: RunNowDialogProps) {
  const [isPending, startTransition] = useTransition();
  const needsConfirm = requiresConfirmDialog(automationLevel);
  // WR-03: guard so the L1 auto-run fires exactly once per open (StrictMode
  // double-mount + parent re-renders must not trigger duplicate runNow calls).
  const hasFiredRef = useRef(false);

  async function executeRun() {
    startTransition(async () => {
      const result = await runNow(workflowId);
      if ("error" in result) {
        toast.error(`Could not run workflow: ${result.error}`);
      } else {
        toast.success(`Running "${workflowName}"…`);
        // Emit a synthetic run row for optimistic UI in HistoricalRunsPanel (WF-13)
        const syntheticRun: WorkflowRunData = {
          id: `optimistic-${Date.now()}`,
          workflow_id: workflowId,
          workflow_version_id: "",
          trigger_source: "manual",
          status: "queued",
          current_step_id: null,
          error_summary: null,
          started_at: new Date(),
          completed_at: null,
        };
        onRunTriggered(syntheticRun);
        onClose();
      }
    });
  }

  // WR-03: L1 manual workflows run instantly with no dialog. Trigger the run
  // from an effect (not the render body) so it cannot fire on every re-render.
  // Reset the once-guard when the dialog closes so a subsequent open re-runs.
  useEffect(() => {
    if (needsConfirm) return;
    if (open && !hasFiredRef.current) {
      hasFiredRef.current = true;
      void executeRun();
    }
    if (!open) {
      hasFiredRef.current = false;
    }
    // executeRun is stable enough for this once-per-open trigger; keying on
    // open + needsConfirm is the intended dependency set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needsConfirm]);

  // L1 manual: no dialog UI is rendered — execution is handled by the effect above
  if (!needsConfirm) {
    return null;
  }

  // L2/L3: show confirm dialog
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent data-testid="run-now-dialog">
        <DialogHeader>
          <DialogTitle>Run "{workflowName}" now?</DialogTitle>
          <DialogDescription>
            {automationLevel === "L3"
              ? "This workflow runs fully autonomously (L3). It may take external actions without further approval. Confirm to proceed."
              : "This workflow requires approval for some actions (L2). A run will be triggered and paused at any steps requiring your sign-off."}
          </DialogDescription>
        </DialogHeader>

        {/* Summary of what will happen */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--r-sm)",
            background: "var(--bg-subtle)",
            border: "0.5px solid var(--border)",
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--text-tertiary)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 4,
            }}
          >
            What happens
          </span>
          An immediate execution will be triggered via the workflow engine.
          {automationLevel === "L3"
            ? " The agent will run all steps autonomously."
            : " Steps requiring approval will appear in your Approvals inbox."}
          {" "}The run will appear in Historical Runs within seconds.
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="default"
            size="sm"
            onClick={executeRun}
            disabled={isPending}
            aria-busy={isPending}
            aria-label={`Confirm run "${workflowName}" now`}
            data-testid="run-now-confirm-button"
          >
            {isPending ? "Running…" : "Run now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
