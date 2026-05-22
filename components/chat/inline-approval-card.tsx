"use client";

/**
 * components/chat/inline-approval-card.tsx
 * Inline L2 approval card — rendered inside the message stream when the agent
 * proposes an action that requires user approval (automation_level = 'L2').
 *
 * ARCHITECTURE:
 *   - Client component ("use client") — subscribes to Supabase Realtime for live
 *     status sync (Pitfall 5: must use { private: true } channel with user JWT)
 *   - Calls approveItem / rejectItem Server Actions to resolve the approval
 *     and fire the Inngest resume event
 *   - Rendered by message-stream (02-06) via inline_block_type='approval_card'
 *
 * ACCESSIBILITY (UX-03, CLAUDE.md):
 *   - All buttons have aria-label
 *   - Full keyboard navigation (focus-visible styles, no pointer-only interactions)
 *   - Reduced-motion support (prefers-reduced-motion disables slide animation)
 *
 * THREAT MODEL:
 *   T-2-07-02 (forged event): Server Actions re-verify ownership before firing event
 *   T-2-07-04 (cross-user): Realtime channel uses { private: true } + user JWT
 *   T-2-07-05 (unlogged): approveItem/rejectItem fires after DB update, not before
 *
 * DESIGN CONTRACT:
 *   Follows "Operator Zero Design Files/surface-conversation.jsx" InlineApprovalCard
 *   visual specification — action type badge, summary, reasoning, preview, impact.
 */

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/auth/client";
import { approveItem, rejectItem } from "@/app/app/approvals/actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "snoozed";

export interface InlineApprovalCardProps {
  /** The approval row UUID */
  approvalId: string;
  /** Action type label (e.g., 'shopify_update_meta_title') */
  actionType: string;
  /** One-line summary shown to the user */
  summary: string;
  /** Risk level: 'low' | 'med' | 'high' */
  stakes: "low" | "med" | "high";
  /** Structured preview data */
  preview?: Record<string, unknown>;
  /** Agent's reasoning summary */
  reasoning: string;
  /** Downstream impact description (optional, shown for high-stakes) */
  impact?: string;
  /** Estimated review time (e.g., '< 1 min') */
  estTime?: string;
  /** Initial status (from server-rendered message data) */
  initialStatus?: ApprovalStatus;
  /** The Inngest event key for correlation */
  inngestEventKey?: string;
}

// ─── Stakes indicator ─────────────────────────────────────────────────────────

function StakesIndicator({ level }: { level: "low" | "med" | "high" }) {
  const colors: Record<string, string> = {
    low: "var(--success, #22c55e)",
    med: "var(--warning, #f59e0b)",
    high: "var(--danger, #ef4444)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontFamily: "var(--font-mono, monospace)",
        color: colors[level],
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
      aria-label={`Stakes: ${level}`}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: colors[level],
          display: "inline-block",
        }}
      />
      {level}
    </span>
  );
}

// ─── InlineApprovalCard ───────────────────────────────────────────────────────

/**
 * InlineApprovalCard — full-fidelity L2 approval card.
 *
 * Subscribes to Supabase Realtime `approvals` table via a private channel so
 * the card status syncs in real-time when the approval is resolved from another
 * surface (e.g., the Inbox page).
 *
 * The Approve and Reject buttons call Server Actions which:
 *   1. Re-verify ownership (T-2-07-02)
 *   2. Update the DB row
 *   3. Fire the Inngest approval.resolved event to resume the paused run
 */
export function InlineApprovalCard({
  approvalId,
  actionType,
  summary,
  stakes,
  preview,
  reasoning,
  impact,
  estTime,
  initialStatus = "pending",
  inngestEventKey,
}: InlineApprovalCardProps) {
  const [status, setStatus] = useState<ApprovalStatus>(initialStatus);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Realtime subscription (Pitfall 5: private channel required) ───────────
  // T-2-07-04: the `approval:<id>` channel is private. setAuth() attaches the
  // user JWT so Realtime enforces the realtime.messages ownership policy from
  // migration 0004 (only the approval's owner may receive on this topic).
  useEffect(() => {
    if (status !== "pending") return; // Already resolved — no need to subscribe

    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      // Required for { private: true }: scope the socket to the user JWT so the
      // server-side realtime.messages authorization policy can verify ownership.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      channel = supabase.channel(`approval:${approvalId}`, {
        config: { private: true },
      });

      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "approvals",
            filter: `id=eq.${approvalId}`,
          },
          (payload) => {
            const newStatus = payload.new?.status as ApprovalStatus | undefined;
            if (
              newStatus &&
              ["approved", "rejected", "expired", "snoozed"].includes(newStatus)
            ) {
              setStatus(newStatus);
            }
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [approvalId, status]);

  // ── Approve handler ───────────────────────────────────────────────────────

  const handleApprove = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await approveItem(approvalId, "inline");
      if ("error" in result) {
        setError(result.error);
      } else {
        setStatus("approved");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setIsPending(false);
    }
  }, [approvalId, isPending]);

  // ── Reject handler ────────────────────────────────────────────────────────

  const handleReject = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await rejectItem(approvalId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setStatus("rejected");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setIsPending(false);
    }
  }, [approvalId, isPending]);

  // ── Post-resolution confirmation states ───────────────────────────────────

  if (status === "approved") {
    return (
      <div
        className="inline-approval-card inline-approval-card--resolved"
        role="status"
        aria-label="Approval confirmed"
        style={{
          padding: "10px 14px",
          background: "var(--bg-subtle, #f9fafb)",
          border: "0.5px solid var(--border, #e5e7eb)",
          borderRadius: "var(--r-md, 8px)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5,
          color: "var(--text-tertiary, #6b7280)",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--success, #22c55e)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>Approved &middot; {summary}</span>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div
        className="inline-approval-card inline-approval-card--resolved"
        role="status"
        aria-label="Approval rejected"
        style={{
          padding: "10px 14px",
          background: "var(--bg-subtle, #f9fafb)",
          border: "0.5px solid var(--border, #e5e7eb)",
          borderRadius: "var(--r-md, 8px)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5,
          color: "var(--text-tertiary, #6b7280)",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--danger, #ef4444)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <span>Rejected &middot; {summary} &middot; the agent will remember.</span>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div
        className="inline-approval-card inline-approval-card--resolved"
        role="status"
        aria-label="Approval expired"
        style={{
          padding: "10px 14px",
          background: "var(--bg-subtle, #f9fafb)",
          border: "0.5px solid var(--border, #e5e7eb)",
          borderRadius: "var(--r-md, 8px)",
          fontSize: 12.5,
          color: "var(--text-tertiary, #6b7280)",
        }}
      >
        This approval request has expired.
      </div>
    );
  }

  // ── Pending state — full card ─────────────────────────────────────────────

  return (
    <div
      className="inline-approval-card"
      role="region"
      aria-label={`Approval needed: ${summary}`}
      style={{
        border: "0.5px solid var(--border, #e5e7eb)",
        borderRadius: "var(--r-lg, 12px)",
        background: "var(--bg-elevated, #ffffff)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          background: "var(--acc-approval-bg, color-mix(in oklch, var(--approval, #f59e0b) 8%, var(--bg, #ffffff)))",
          borderBottom: "0.5px solid var(--border-hairline, #f3f4f6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Inbox icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--acc-approval-ink, #d97706)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono, monospace)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--acc-approval-ink, #d97706)",
              fontWeight: 500,
            }}
          >
            Approval needed &middot; L2
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StakesIndicator level={stakes} />
          {estTime && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-tertiary, #9ca3af)",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              ~{estTime}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Action type + summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--text-tertiary, #9ca3af)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {actionType}
          </div>
          <div
            style={{
              fontSize: 18,
              color: "var(--text, #111827)",
              letterSpacing: "-0.01em",
              fontWeight: 500,
            }}
          >
            {summary}
          </div>
        </div>

        {/* Reasoning */}
        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg-subtle, #f9fafb)",
            borderRadius: "var(--r-sm, 6px)",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--text-secondary, #4b5563)",
            display: "flex",
            gap: 10,
            borderLeft: "2px solid var(--acc-workflow-ink, #6366f1)",
          }}
        >
          {/* Brain icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-tertiary, #9ca3af)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: 2 }}
            aria-hidden="true"
          >
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
          </svg>
          <div>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-tertiary, #9ca3af)",
                fontFamily: "var(--font-mono, monospace)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginRight: 8,
              }}
            >
              Why
            </span>
            {reasoning}
          </div>
        </div>

        {/* Preview */}
        {preview && Object.keys(preview).length > 0 && (
          <div
            style={{
              padding: "10px 12px",
              background: "var(--bg-subtle, #f9fafb)",
              borderRadius: "var(--r-sm, 6px)",
              fontSize: 12.5,
              color: "var(--text, #111827)",
            }}
          >
            <pre
              style={{
                margin: 0,
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 12,
                overflow: "auto",
                maxHeight: 200,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}

        {/* Downstream impact (high-stakes warning) */}
        {impact && (
          <div
            style={{
              padding: "10px 12px",
              background:
                "color-mix(in oklch, var(--warning, #f59e0b) 8%, var(--bg, #ffffff))",
              border:
                "0.5px solid color-mix(in oklch, var(--warning, #f59e0b) 30%, transparent)",
              borderRadius: "var(--r-sm, 6px)",
              fontSize: 12.5,
              color: "var(--text, #111827)",
              display: "flex",
              gap: 8,
            }}
          >
            {/* Warning icon */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--warning, #f59e0b)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 2 }}
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              <strong style={{ fontWeight: 500 }}>Downstream impact:</strong>{" "}
              {impact}
            </span>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              background: "color-mix(in oklch, var(--danger, #ef4444) 8%, var(--bg, #ffffff))",
              border: "0.5px solid color-mix(in oklch, var(--danger, #ef4444) 30%, transparent)",
              borderRadius: "var(--r-sm, 6px)",
              fontSize: 12.5,
              color: "var(--danger, #ef4444)",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "0.5px solid var(--border-hairline, #f3f4f6)",
          background: "var(--bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={handleReject}
          disabled={isPending}
          aria-label={`Reject: ${summary}`}
          style={{
            padding: "6px 12px",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: "var(--r-sm, 6px)",
            border: "0.5px solid var(--border, #e5e7eb)",
            background: "transparent",
            color: "var(--text, #111827)",
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.5 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "inherit",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Reject
        </button>

        <button
          type="button"
          onClick={handleApprove}
          disabled={isPending}
          aria-label={`Approve: ${summary}`}
          style={{
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: "var(--r-sm, 6px)",
            border: "0.5px solid var(--acc-approval-ink, #d97706)",
            background: "var(--acc-approval-bg, color-mix(in oklch, #f59e0b 15%, #ffffff))",
            color: "var(--acc-approval-ink, #d97706)",
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.5 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "inherit",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {isPending ? "Processing…" : "Approve"}
        </button>
      </div>
    </div>
  );
}
