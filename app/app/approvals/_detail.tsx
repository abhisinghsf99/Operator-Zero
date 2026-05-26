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

import { useState, useEffect, useTransition, useCallback, type RefObject } from "react";
import { RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button as ShadButton } from "@/components/ui/button";
import { approveItem, rejectItem, snoozeItem, editItem, revertApproved } from "./actions";
import type { PendingApproval } from "./actions";
import { ApprovalPreview } from "./_preview";
import {
  Button,
  Card,
  SectionHeader,
  StakesIndicator,
  DomainBadge,
  Kbd,
} from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ApprovalDetailProps {
  approval: PendingApproval;
  onResolved: (approvalId: string) => void;
  /** Optional ref for the detail heading — receives focus on mobile drill-down open (D-11) */
  detailHeadingRef?: RefObject<HTMLHeadingElement | null>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApprovalDomainLabel(actionType: string): string {
  if (actionType.includes("product") || actionType.includes("catalog")) return "Catalog";
  if (actionType.includes("meta") || actionType.includes("seo")) return "SEO";
  if (actionType.includes("email") || actionType.includes("reply")) return "Q&A";
  if (actionType.includes("inventory") || actionType.includes("stock")) return "Inventory";
  return "Catalog";
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

export function ApprovalDetail({ approval, onResolved, detailHeadingRef }: ApprovalDetailProps) {
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

  const domainLabel = getApprovalDomainLabel(approval.action_type);
  const stakesLevel =
    approval.stakes === "med"
      ? "medium"
      : (approval.stakes as "low" | "medium" | "high");

  // ── Action handlers ────────────────────────────────────────────────────────
  // WR-05: useCallback so handleApprove is stable across renders and can be
  // safely listed in the useEffect dependency array without a stale closure.
  const handleApprove = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const result = await approveItem(approval.id, "inbox");
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onResolved(approval.id);
    });
  }, [approval.id, startTransition, onResolved]);

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
  }, [isPending, handleApprove]);

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
      style={{ height: "100%", overflowY: "auto" }}
      data-approval-detail
      data-testid="approval-detail"
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 36px 60px" }}>
        {/* Drift banner (D-03) */}
        {isDrifted && (
          <div
            style={{
              marginBottom: 20,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              borderRadius: "var(--r-md)",
              border: "0.5px solid",
              borderColor: "color-mix(in oklch, var(--warning) 30%, transparent)",
              background: "color-mix(in oklch, var(--warning) 8%, var(--bg))",
              padding: "12px 14px",
              fontSize: 13,
              color: "var(--text)",
            }}
            role="alert"
            aria-live="polite"
          >
            <Icons.Warning
              size={14}
              style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }}
              aria-hidden
            />
            <span>
              <strong style={{ fontWeight: 500 }}>Data changed since proposed.</strong>{" "}
              The underlying state may have changed. Re-confirm before approving.
            </span>
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DomainBadge domain={domainLabel} />
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {approval.action_type}
          </div>
          <h2
            ref={detailHeadingRef}
            className="display"
            style={{
              fontSize: 32,
              color: "var(--text)",
              margin: 0,
              letterSpacing: "-0.015em",
              lineHeight: 1.2,
            }}
            tabIndex={-1}
          >
            {approval.action_summary}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            <StakesIndicator level={stakesLevel} />
            {approval.estimated_review_seconds && (
              <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                · est. review ~{Math.round(approval.estimated_review_seconds / 60)}m
              </span>
            )}
          </div>
        </div>

        {/* Reasoning (D-01) */}
        <Card padding={16} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <Icons.Brain
              size={16}
              style={{ color: "var(--text-tertiary)", flexShrink: 0, marginTop: 2 }}
              aria-hidden
            />
            <div>
              <SectionHeader>The agent&apos;s reasoning</SectionHeader>
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                }}
              >
                {approval.reasoning_summary}
              </p>
            </div>
          </div>
        </Card>

        {/* Downstream impact warning */}
        {approval.downstream_impact && (
          <div
            style={{
              padding: "12px 14px",
              background: "color-mix(in oklch, var(--warning) 8%, var(--bg))",
              border: "0.5px solid color-mix(in oklch, var(--warning) 30%, transparent)",
              borderRadius: "var(--r-md)",
              fontSize: 13,
              color: "var(--text)",
              display: "flex",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <Icons.Warning
              size={14}
              style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }}
              aria-hidden
            />
            <span>
              <strong style={{ fontWeight: 500 }}>Downstream impact:</strong>{" "}
              {approval.downstream_impact}
            </span>
          </div>
        )}

        {/* Preview */}
        <SectionHeader>Preview</SectionHeader>
        <div style={{ marginBottom: 24 }}>
          <ApprovalPreview preview={approval.preview} />
        </div>

        {/* Edit panel (D-01 — edit proposed_action in place) */}
        {editMode && (
          <div style={{ marginBottom: 24 }} data-testid="edit-preview">
            <SectionHeader>Edit proposed action</SectionHeader>
            <textarea
              value={editedPayload}
              onChange={(e) => setEditedPayload(e.target.value)}
              style={{
                width: "100%",
                borderRadius: "var(--r-md)",
                border: "0.5px solid var(--border)",
                background: "var(--bg-elevated)",
                padding: "12px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                lineHeight: 1.5,
                color: "var(--text)",
                resize: "vertical",
                boxSizing: "border-box",
              }}
              rows={10}
              aria-label="Edit the proposed action JSON"
              spellCheck={false}
              className="focus:outline-none focus:ring-2 focus:ring-[var(--acc-workflow)]"
            />
            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditMode(false);
                  setEditedPayload(JSON.stringify(approval.proposed_action, null, 2));
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                accent="approval"
                size="sm"
                onClick={handleEdit}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save & Approve"}
              </Button>
            </div>
          </div>
        )}

        {/* Error region */}
        {error && (
          <p
            style={{ marginBottom: 16, fontSize: 12.5, color: "var(--danger)" }}
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      {/* Sticky action bar */}
      <div style={{ position: "sticky", bottom: 0, background: "var(--bg-subtle)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 36px 16px" }}>
          <div
            style={{
              padding: "12px 16px",
              background: "var(--bg-elevated)",
              border: "0.5px solid var(--border-strong)",
              borderRadius: "var(--r-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {/* Snooze (left) */}
            <Button
              variant="ghost"
              size="md"
              icon="Clock"
              onClick={() => setSnoozeOpen(true)}
              disabled={isPending}
              aria-label="Snooze (S)"
            >
              Snooze
            </Button>

            {/* Reject / Edit / Approve (right) */}
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="ghost"
                size="md"
                icon="X"
                onClick={() => setRejectOpen(true)}
                disabled={isPending}
                aria-label="Reject (R)"
              >
                Reject
              </Button>
              <Button
                variant="secondary"
                size="md"
                icon="Edit"
                onClick={() => setEditMode((m) => !m)}
                disabled={isPending}
                aria-label="Edit (E)"
                aria-pressed={editMode}
                style={
                  editMode
                    ? {
                        background: "var(--acc-approval-bg)",
                        color: "var(--acc-approval-ink)",
                        border: "0.5px solid color-mix(in oklch, var(--acc-approval-ink) 25%, transparent)",
                      }
                    : undefined
                }
              >
                Edit
              </Button>
              <Button
                variant="primary"
                accent="approval"
                size="md"
                icon="Check"
                onClick={handleApprove}
                disabled={isPending || editMode}
                aria-label={isDrifted ? "Approve (confirm data change) (A)" : "Approve (A)"}
                data-testid="approve-btn"
              >
                {isPending ? "Approving…" : isDrifted ? "Confirm & Approve" : "Approve"}
              </Button>
            </div>
          </div>

          {/* Keyboard shortcuts hint */}
          <div
            style={{
              textAlign: "center",
              marginTop: 10,
              fontSize: 11.5,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <Kbd>A</Kbd> approve{" · "}
            <Kbd>R</Kbd> reject{" · "}
            <Kbd>E</Kbd> edit{" · "}
            <Kbd>S</Kbd> snooze
          </div>

          {/* Revert button for recently-approved — APRV-07 */}
          {approval.resolved_at && (
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
              <button
                onClick={handleRevert}
                disabled={isPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  cursor: isPending ? "not-allowed" : "pointer",
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                  opacity: isPending ? 0.5 : 1,
                }}
                className="hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-approval-ink)]"
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
            <label
              htmlFor="reject-reason"
              className="mb-1.5 block text-[12.5px] text-[var(--text-secondary)]"
            >
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
              <ShadButton variant="secondary" size="sm">Cancel</ShadButton>
            </DialogClose>
            <ShadButton
              variant="danger"
              size="sm"
              onClick={handleReject}
              disabled={isPending}
              aria-busy={isPending}
              data-testid="confirm-reject-btn"
            >
              {isPending ? "Rejecting…" : "Reject"}
            </ShadButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snooze picker dialog (D-02 presets: 1h / this evening / tomorrow) */}
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: "var(--r-md)",
                  border: "0.5px solid var(--border)",
                  background: "var(--bg-elevated)",
                  padding: "12px 16px",
                  textAlign: "left",
                  fontSize: 13.5,
                  color: "var(--text)",
                  cursor: isPending ? "not-allowed" : "pointer",
                  opacity: isPending ? 0.5 : 1,
                  transition: "background 0.12s",
                }}
                className="hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
              >
                <Icons.Clock
                  size={14}
                  style={{ flexShrink: 0, color: "var(--text-tertiary)" }}
                  aria-hidden
                />
                {preset.label}
              </button>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <ShadButton variant="secondary" size="sm">Cancel</ShadButton>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
