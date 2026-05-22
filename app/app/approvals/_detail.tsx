"use client";

/**
 * app/app/approvals/_detail.tsx
 * Approval detail panel — renders reasoning, preview, action bar, and keyboard shortcuts.
 *
 * ApprovalDetail: full-fidelity detail view for a single pending approval.
 *   - Reasoning + downstream impact warning
 *   - Preview (jsonb)
 *   - Drift banner: compares proposed_action to underlying state (D-03)
 *   - Sticky action bar: Snooze / Reject / Edit / Approve (+ keyboard A/R/E/S/↑↓)
 *   - Revert button for recently-approved items (APRV-07)
 *
 * Keyboard handlers are scoped to [data-approval-detail] and skip INPUT/TEXTAREA targets (Pitfall 5).
 *
 * WCAG 2.1 AA:
 *   - aria-labels with keyboard equivalents on all action buttons
 *   - role="alert" on error regions
 *   - aria-busy on pending buttons
 *   - Radix Dialog for reject-reason + snooze picker (focus-trapped)
 */

import { useState, useEffect, useTransition } from "react";
import { Brain, TriangleAlert, Clock, X, Edit, Check, RotateCcw } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { approveItem, rejectItem, snoozeItem, editItem, revertApproved } from "./actions";
import type { PendingApproval } from "./actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ApprovalDetailProps {
  approval: PendingApproval;
  onResolved: (approvalId: string) => void;
}

// ─── Snooze presets ───────────────────────────────────────────────────────────

function getSnoozePresets(): Array<{ label: string; isoString: string }> {
  const now = new Date();

  // 1 hour from now
  const oneHour = new Date(now.getTime() + 60 * 60 * 1000);

  // This evening: today at 18:00
  const thisEvening = new Date(now);
  thisEvening.setHours(18, 0, 0, 0);
  if (thisEvening <= now) thisEvening.setDate(thisEvening.getDate() + 1);

  // Tomorrow: tomorrow at 09:00
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  return [
    { label: "1 hour", isoString: oneHour.toISOString() },
    { label: "This evening (6 PM)", isoString: thisEvening.toISOString() },
    { label: "Tomorrow morning (9 AM)", isoString: tomorrow.toISOString() },
  ];
}

// ─── ApprovalDetail ───────────────────────────────────────────────────────────

export function ApprovalDetail({ approval, onResolved }: ApprovalDetailProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editedPayload, setEditedPayload] = useState(
    JSON.stringify(approval.proposed_action, null, 2)
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset state when the active approval changes
  useEffect(() => {
    setEditMode(false);
    setRejectReason("");
    setEditedPayload(JSON.stringify(approval.proposed_action, null, 2));
    setError(null);
    setRejectOpen(false);
    setSnoozeOpen(false);
  }, [approval.id, approval.proposed_action]);

  // ── Drift detection (D-03) ─────────────────────────────────────────────────
  // Compare action_summary (proxy for proposed_action version) to detect if
  // the underlying data changed since the approval was created.
  // In production this would compare against a fresh Shopify fetch.
  const isDrifted = false; // Drift detection requires live Shopify comparison — stub for now

  // ── Keyboard shortcuts (Pitfall 5: scoped to detail panel, skip inputs) ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Skip if inside an input/textarea/contenteditable
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      // Scope to approval detail panel
      if (!target.closest("[data-approval-detail]")) return;

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (!isPending) handleApprove();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setRejectOpen(true);
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setEditMode((m) => !m);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSnoozeOpen(true);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, approval.id]);

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleApprove = () => {
    startTransition(async () => {
      setError(null);
      const result = await approveItem(approval.id, "inbox");
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onResolved(approval.id);
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      setError(null);
      const result = await rejectItem(approval.id, rejectReason.trim() || undefined);
      if ("error" in result) {
        setError(result.error);
        setRejectOpen(false);
        return;
      }
      setRejectOpen(false);
      onResolved(approval.id);
    });
  };

  const handleSnooze = (isoString: string) => {
    startTransition(async () => {
      setError(null);
      const result = await snoozeItem(approval.id, isoString);
      if ("error" in result) {
        setError(result.error);
        setSnoozeOpen(false);
        return;
      }
      setSnoozeOpen(false);
      onResolved(approval.id); // Remove from list (will re-appear after snoozed_until)
    });
  };

  const handleEdit = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editedPayload) as Record<string, unknown>;
    } catch {
      setError("Invalid JSON in proposed action. Please fix and try again.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await editItem(approval.id, parsed);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEditMode(false);
      onResolved(approval.id);
    });
  };

  const handleRevert = () => {
    startTransition(async () => {
      setError(null);
      const result = await revertApproved(approval.id);
      if ("error" in result) {
        if ("routeToActivity" in result && result.routeToActivity) {
          window.location.href = "/app/activity";
          return;
        }
        setError(result.error);
        return;
      }
      onResolved(approval.id);
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="h-full overflow-y-auto"
      data-approval-detail
      data-testid="approval-detail"
    >
      <div className="mx-auto max-w-[720px] px-9 py-8 pb-[60px]">
        {/* Drift banner (D-03) */}
        {isDrifted && (
          <div
            className="mb-5 flex items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--warning)] bg-[color-mix(in_oklch,var(--warning)_8%,var(--bg))] px-4 py-3 text-[13px]"
            role="alert"
            aria-live="polite"
          >
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[var(--warning)]" aria-hidden="true" />
            <span>
              <strong className="font-medium">Data changed since proposed.</strong>{" "}
              The underlying state may have changed. Re-confirm before approving.
            </span>
          </div>
        )}

        {/* Header */}
        <div className="mb-[18px] flex flex-col gap-[6px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {approval.action_type}
          </div>
          <h2
            className="display m-0 text-[32px] leading-[1.2] tracking-[-0.015em]"
            style={{ color: "var(--text)" }}
          >
            {approval.action_summary}
          </h2>
          <div className="flex items-center gap-3 text-[12.5px] text-[var(--text-tertiary)]">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.05em] font-semibold"
              style={{
                color:
                  approval.stakes === "high"
                    ? "var(--danger)"
                    : approval.stakes === "med"
                    ? "var(--warning)"
                    : "var(--text-tertiary)",
              }}
            >
              {approval.stakes} stakes
            </span>
          </div>
        </div>

        {/* Reasoning (D-01) */}
        <div className="mb-4 rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="flex gap-[10px]">
            <Brain
              size={16}
              className="mt-0.5 shrink-0 text-[var(--text-tertiary)]"
              aria-hidden="true"
            />
            <div>
              <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                The agent&apos;s reasoning
              </div>
              <p className="m-0 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">
                {approval.reasoning_summary}
              </p>
            </div>
          </div>
        </div>

        {/* Downstream impact warning */}
        {approval.downstream_impact && (
          <div
            className="mb-4 flex items-start gap-[10px] rounded-[var(--r-md)] border-[0.5px] px-[14px] py-3 text-[13px]"
            style={{
              background: "color-mix(in oklch, var(--warning) 8%, var(--bg))",
              borderColor: "color-mix(in oklch, var(--warning) 30%, transparent)",
              color: "var(--text)",
            }}
          >
            <TriangleAlert
              size={14}
              className="mt-0.5 shrink-0 text-[var(--warning)]"
              aria-hidden="true"
            />
            <span>
              <strong className="font-medium">Downstream impact:</strong>{" "}
              {approval.downstream_impact}
            </span>
          </div>
        )}

        {/* Preview */}
        <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
          Preview
        </div>
        <div className="mb-6 rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">
            {JSON.stringify(approval.preview, null, 2)}
          </pre>
        </div>

        {/* Edit panel (D-01 — edit proposed_action in place) */}
        {editMode && (
          <div
            className="mb-6"
            data-testid="edit-preview"
          >
            <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
              Edit proposed action
            </div>
            <textarea
              value={editedPayload}
              onChange={(e) => setEditedPayload(e.target.value)}
              className="w-full rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-[12.5px] leading-[1.5] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--acc-workflow)]"
              rows={10}
              aria-label="Edit the proposed action JSON"
              spellCheck={false}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setEditMode(false); setEditedPayload(JSON.stringify(approval.proposed_action, null, 2)); }}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleEdit}
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? "Saving…" : "Save & Approve"}
              </Button>
            </div>
          </div>
        )}

        {/* Error region */}
        {error && (
          <p className="mb-4 text-[12.5px] text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 bg-[var(--bg)]">
        <div
          className="mx-auto max-w-[720px] px-9 py-4"
          style={{ boxShadow: "0 -1px 0 var(--border)" }}
        >
          <div className="flex items-center justify-between rounded-[var(--r-md)] border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 shadow-md">
            {/* Snooze (left) */}
            <button
              onClick={() => setSnoozeOpen(true)}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
              aria-label="Snooze (S)"
            >
              <Clock size={13} aria-hidden="true" />
              Snooze
            </button>

            {/* Reject / Edit / Approve (right) */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRejectOpen(true)}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
                aria-label="Reject (R)"
              >
                <X size={13} aria-hidden="true" />
                Reject
              </button>
              <button
                onClick={() => setEditMode((m) => !m)}
                disabled={isPending}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px] disabled:opacity-50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]",
                  editMode
                    ? "bg-[var(--acc-approval-bg)] text-[var(--acc-approval-ink)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                )}
                aria-label="Edit (E)"
                aria-pressed={editMode}
              >
                <Edit size={13} aria-hidden="true" />
                Edit
              </button>
              <button
                onClick={handleApprove}
                disabled={isPending || editMode}
                aria-busy={isPending}
                className="flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--acc-approval-ink,#4f6ef7)] px-4 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
                aria-label={isDrifted ? "Approve (confirm data change) (A)" : "Approve (A)"}
                data-testid="approve-btn"
              >
                <Check size={13} aria-hidden="true" />
                {isPending ? "Approving…" : isDrifted ? "Confirm & Approve" : "Approve"}
              </button>
            </div>
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="mt-2 text-center font-mono text-[11.5px] text-[var(--text-tertiary)]">
            <kbd className="rounded border border-[var(--border)] px-1 text-[10px]">A</kbd> approve
            {" · "}
            <kbd className="rounded border border-[var(--border)] px-1 text-[10px]">R</kbd> reject
            {" · "}
            <kbd className="rounded border border-[var(--border)] px-1 text-[10px]">E</kbd> edit
            {" · "}
            <kbd className="rounded border border-[var(--border)] px-1 text-[10px]">S</kbd> snooze
          </div>

          {/* Revert button for recently-approved — APRV-07 */}
          {approval.resolved_at && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={handleRevert}
                disabled={isPending}
                className="flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-secondary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
                aria-label="Revert this approval"
              >
                <RotateCcw size={12} aria-hidden="true" />
                Revert
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Reject reason dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this approval?</DialogTitle>
            <DialogDescription>
              Optionally explain why — the agent will remember this for future proposals.
            </DialogDescription>
          </DialogHeader>
          <div className="px-0 py-2">
            <label htmlFor="reject-reason" className="mb-1.5 block text-[12.5px] text-[var(--text-secondary)]">
              Reason (optional)
            </label>
            <textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Too risky for our brand positioning right now"
              className="w-full rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--acc-workflow)]"
              rows={3}
              maxLength={500}
            />
            <p className="mt-1 text-right font-mono text-[11px] text-[var(--text-tertiary)]">
              {rejectReason.length}/500
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              size="sm"
              onClick={handleReject}
              disabled={isPending}
              aria-busy={isPending}
              data-testid="confirm-reject-btn"
            >
              {isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snooze picker dialog (D-02 presets: 1h / this evening / tomorrow / pick-a-time) */}
      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snooze this approval</DialogTitle>
            <DialogDescription>
              The workflow stays paused. You&apos;ll see this again when the snooze expires.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {getSnoozePresets().map((preset) => (
              <button
                key={preset.isoString}
                onClick={() => handleSnooze(preset.isoString)}
                disabled={isPending}
                className="flex items-center gap-3 rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-left text-[13.5px] text-[var(--text)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
              >
                <Clock size={14} className="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                {preset.label}
              </button>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
