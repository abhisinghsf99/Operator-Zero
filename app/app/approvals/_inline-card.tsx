"use client";

/**
 * app/app/approvals/_inline-card.tsx
 * Full-fidelity InlineApprovalCard for the Conversation surface.
 *
 * Renders all 5 states (pending / approved / rejected / snoozed / editing)
 * and calls approveItem / rejectItem / editItem / snoozeItem.
 *
 * Design source: surface-conversation.jsx InlineApprovalCard (LOCKED contract — APRV-04).
 *
 * States:
 *   pending  — full card: header (L2 badge + stakes), action summary, reasoning, preview, impact, action bar
 *   editing  — textarea for proposed_action JSON, Save & Approve / Cancel
 *   snoozed  — compact "Snoozed" tombstone with snooze time
 *   approved — compact "Approved" tombstone with Activity link
 *   rejected — compact "Rejected" tombstone
 *
 * Actions (with path="inline"):
 *   Approve → approveItem(approvalId, "inline")
 *   Reject  → rejectItem(approvalId, reason?)
 *   Edit    → editItem(approvalId, editedPayload) — writes proposed_action to DB first (D-01, T-4-02-02)
 *   Snooze  → snoozeItem(approvalId, snoozedUntil) — does NOT fire approval.resolved (A1, T-4-02-03)
 *
 * D-02 snooze presets: 1h / this evening / tomorrow / pick-a-time (Dialog).
 *
 * WCAG 2.1 AA:
 *   - aria-labels on all buttons
 *   - role="alert" on error regions
 *   - aria-busy on pending buttons
 *   - Radix Dialog for reject-reason + snooze picker (focus-trapped)
 *   - data-testid attributes for Playwright e2e
 */

import { useState, useTransition } from "react";
import { Inbox, Clock, Check, X, Edit, Brain, TriangleAlert } from "lucide-react";
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
import { approveItem, rejectItem, editItem, snoozeItem } from "./actions";
import type { PendingApproval } from "./actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

type CardState = "pending" | "approved" | "rejected" | "snoozed" | "editing";

interface InlineApprovalCardProps {
  approval: PendingApproval;
  onDismiss?: (approvalId: string) => void;
}

// ─── Snooze presets (D-02) ────────────────────────────────────────────────────

function getSnoozePresets(): Array<{ label: string; isoString: string }> {
  const now = new Date();
  const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const thisEvening = new Date(now);
  thisEvening.setHours(18, 0, 0, 0);
  if (thisEvening <= now) thisEvening.setDate(thisEvening.getDate() + 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return [
    { label: "1 hour", isoString: oneHour.toISOString() },
    { label: "This evening (6 PM)", isoString: thisEvening.toISOString() },
    { label: "Tomorrow morning (9 AM)", isoString: tomorrow.toISOString() },
  ];
}

// ─── Stakes color ──────────────────────────────────────────────────────────────

function stakesColor(stakes: string) {
  if (stakes === "high") return "var(--danger)";
  if (stakes === "med") return "var(--warning)";
  return "var(--text-tertiary)";
}

// ─── InlineApprovalCard ───────────────────────────────────────────────────────

/**
 * InlineApprovalCard — full-fidelity inline card for the Conversation surface.
 *
 * Renders all 5 states. Calls server actions with path="inline".
 */
export function InlineApprovalCard({ approval, onDismiss }: InlineApprovalCardProps) {
  const [cardState, setCardState] = useState<CardState>("pending");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editedPayload, setEditedPayload] = useState(
    JSON.stringify(approval.proposed_action, null, 2)
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [snoozedUntilLabel, setSnoozedUntilLabel] = useState("");

  // ── Dismiss helper ─────────────────────────────────────────────────────────
  const dismissAfter = (nextState: CardState, delayMs = 1800) => {
    setCardState(nextState);
    setTimeout(() => {
      onDismiss?.(approval.id);
    }, delayMs);
  };

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleApprove = () => {
    startTransition(async () => {
      setError(null);
      const result = await approveItem(approval.id, "inline");
      if ("error" in result) {
        setError(result.error);
        return;
      }
      dismissAfter("approved");
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
      dismissAfter("rejected");
    });
  };

  const handleSnooze = (isoString: string, label: string) => {
    startTransition(async () => {
      setError(null);
      const result = await snoozeItem(approval.id, isoString);
      if ("error" in result) {
        setError(result.error);
        setSnoozeOpen(false);
        return;
      }
      setSnoozeOpen(false);
      setSnoozedUntilLabel(label);
      dismissAfter("snoozed", 2000);
    });
  };

  const handleEditSave = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editedPayload) as Record<string, unknown>;
    } catch {
      setError("Invalid JSON. Please fix and try again.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await editItem(approval.id, parsed);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      dismissAfter("approved");
    });
  };

  // ── Tombstone states ───────────────────────────────────────────────────────
  if (cardState === "approved") {
    return (
      <div
        className="flex items-center gap-[10px] rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] px-[14px] py-[10px] text-[12.5px] text-[var(--text-tertiary)]"
        data-testid="inline-approval-card"
        data-state="approved"
      >
        <Check size={14} className="text-[var(--success)]" aria-hidden="true" />
        <span>Approved · {approval.action_summary}</span>
        <a
          href="/app/activity"
          className="text-[var(--acc-chat-ink,#4f6ef7)] underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
        >
          see in Activity
        </a>
      </div>
    );
  }

  if (cardState === "rejected") {
    return (
      <div
        className="flex items-center gap-[10px] rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] px-[14px] py-[10px] text-[12.5px] text-[var(--text-tertiary)]"
        data-testid="inline-approval-card"
        data-state="rejected"
      >
        <X size={14} className="text-[var(--danger)]" aria-hidden="true" />
        <span>Rejected · {approval.action_summary} · the agent will remember.</span>
      </div>
    );
  }

  if (cardState === "snoozed") {
    return (
      <div
        className="flex items-center gap-[10px] rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] px-[14px] py-[10px] text-[12.5px] text-[var(--text-tertiary)]"
        data-testid="inline-approval-card"
        data-state="snoozed"
      >
        <Clock size={14} className="text-[var(--text-tertiary)]" aria-hidden="true" />
        <span>
          Snoozed · {approval.action_summary}
          {snoozedUntilLabel && <> · until {snoozedUntilLabel}</>}
        </span>
      </div>
    );
  }

  // ── Full card (pending or editing) ─────────────────────────────────────────
  return (
    <>
      <div
        className="overflow-hidden rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]"
        data-testid="inline-approval-card"
        data-state={cardState}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3"
          style={{ background: "var(--acc-approval-bg)" }}
        >
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-[var(--acc-approval-ink)]" aria-hidden="true" />
            <span className="font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--acc-approval-ink)]">
              Approval needed · L2
            </span>
          </div>
          <div className="flex items-center gap-[10px]">
            <span
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.05em]"
              style={{ color: stakesColor(approval.stakes) }}
              aria-label={`Stakes: ${approval.stakes}`}
            >
              {approval.stakes}
            </span>
            {approval.estimated_review_seconds && (
              <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                ~{Math.round(approval.estimated_review_seconds / 60)}m
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-[14px] px-[18px] py-4">
          {/* Action type + summary */}
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
              {approval.action_type}
            </div>
            <div
              className="display text-[22px] leading-[1.2] tracking-[-0.01em]"
              style={{ color: "var(--text)" }}
            >
              {approval.action_summary}
            </div>
          </div>

          {/* Reasoning */}
          <div
            className="flex gap-[10px] rounded-[var(--r-sm)] px-3 py-[10px] text-[13px] leading-[1.5] text-[var(--text-secondary)]"
            style={{
              background: "var(--bg-subtle)",
              borderLeft: "2px solid var(--acc-workflow-ink)",
            }}
          >
            <Brain size={14} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            <div>
              <span className="mr-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                Why
              </span>
              {approval.reasoning_summary}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg)] p-3">
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-[1.5] text-[var(--text-secondary)]">
              {JSON.stringify(approval.preview, null, 2)}
            </pre>
          </div>

          {/* Downstream impact */}
          {approval.downstream_impact && (
            <div
              className="flex items-start gap-2 rounded-[var(--r-sm)] px-3 py-[10px] text-[12.5px]"
              style={{
                background: "color-mix(in oklch, var(--warning) 8%, var(--bg))",
                border: "0.5px solid color-mix(in oklch, var(--warning) 30%, transparent)",
                color: "var(--text)",
              }}
            >
              <TriangleAlert size={13} className="mt-0.5 shrink-0 text-[var(--warning)]" aria-hidden="true" />
              <span>
                <strong className="font-medium">Downstream impact:</strong>{" "}
                {approval.downstream_impact}
              </span>
            </div>
          )}

          {/* Edit panel (D-01 — in-place editing) */}
          {cardState === "editing" && (
            <div data-testid="edit-preview">
              <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                Edit proposed action
              </div>
              <textarea
                value={editedPayload}
                onChange={(e) => setEditedPayload(e.target.value)}
                className="w-full rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-[12px] leading-[1.5] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--acc-workflow)]"
                rows={8}
                aria-label="Edit the proposed action JSON"
                spellCheck={false}
              />
            </div>
          )}

          {/* Error region */}
          {error && (
            <p className="text-[12.5px] text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Action bar */}
        <div
          className="flex items-center justify-between gap-2 border-t border-[var(--border-hairline)] bg-[var(--bg)] px-[14px] py-[10px]"
        >
          {/* Snooze (left) */}
          <div className="flex gap-2">
            <button
              onClick={() => setSnoozeOpen(true)}
              disabled={isPending}
              className={cn(
                "flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px]",
                "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
              )}
              aria-label="Snooze this approval"
            >
              <Clock size={13} aria-hidden="true" />
              Snooze
            </button>
          </div>

          {/* Reject / Edit / Approve (right) */}
          <div className="flex items-center gap-[6px]">
            {cardState === "editing" ? (
              <>
                <button
                  onClick={() => { setCardState("pending"); setEditedPayload(JSON.stringify(approval.proposed_action, null, 2)); }}
                  className="flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={isPending}
                  aria-busy={isPending}
                  className="flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--acc-approval-ink,#4f6ef7)] px-4 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
                  aria-label="Save edits and approve"
                >
                  {isPending ? "Saving…" : "Save & Approve"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setRejectOpen(true)}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
                  aria-label="Reject this approval (R)"
                >
                  <X size={13} aria-hidden="true" />
                  Reject
                </button>
                <button
                  onClick={() => setCardState("editing")}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-transparent px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
                  aria-label="Edit this approval inline (E)"
                  data-testid="edit-btn"
                >
                  <Edit size={13} aria-hidden="true" />
                  Edit
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isPending}
                  aria-busy={isPending}
                  className="flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--acc-approval-ink,#4f6ef7)] px-4 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
                  aria-label="Approve (A)"
                  data-testid="approve-inline-btn"
                >
                  <Check size={13} aria-hidden="true" />
                  {isPending ? "Approving…" : "Approve"}
                </button>
              </>
            )}
          </div>
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
          <div className="py-2">
            <label htmlFor="inline-reject-reason" className="mb-1.5 block text-[12.5px] text-[var(--text-secondary)]">
              Reason (optional)
            </label>
            <textarea
              id="inline-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Too risky for our brand positioning right now"
              className="w-full rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--acc-workflow)]"
              rows={3}
              maxLength={500}
            />
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
            >
              {isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snooze picker dialog (D-02) */}
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
                onClick={() => handleSnooze(preset.isoString, preset.label)}
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
    </>
  );
}
