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
 *   visual specification at full fidelity. Uses shared primitives from
 *   components/design/primitives.tsx.
 */

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/auth/client";
import { approveItem, rejectItem } from "@/app/app/approvals/actions";
import { Button, StakesIndicator } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

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
  /** Risk level: 'low' | 'med' | 'medium' | 'high' */
  stakes: "low" | "med" | "medium" | "high";
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
        className="anim-pop"
        role="status"
        aria-label="Approval confirmed"
        style={{
          padding: "10px 14px",
          background: "var(--bg-subtle)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-md)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5,
          color: "var(--text-tertiary)",
        }}
      >
        <Icons.Check size={14} style={{ color: "var(--success)" }} />
        <span>Approved &middot; {summary}</span>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div
        className="anim-pop"
        role="status"
        aria-label="Approval rejected"
        style={{
          padding: "10px 14px",
          background: "var(--bg-subtle)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-md)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5,
          color: "var(--text-tertiary)",
        }}
      >
        <Icons.X size={14} style={{ color: "var(--danger)" }} />
        <span>Rejected &middot; {summary} &middot; the agent will remember.</span>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div
        className="anim-pop"
        role="status"
        aria-label="Approval expired"
        style={{
          padding: "10px 14px",
          background: "var(--bg-subtle)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-md)",
          fontSize: 12.5,
          color: "var(--text-tertiary)",
        }}
      >
        This approval request has expired.
      </div>
    );
  }

  // ── Pending state — full card ─────────────────────────────────────────────

  return (
    <div
      role="region"
      aria-label={`Approval needed: ${summary}`}
      style={{
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-lg)",
        background: "var(--bg-elevated)",
        overflow: "hidden",
      }}
    >
      {/* Header — approval accent */}
      <div
        style={{
          padding: "12px 16px",
          background: "var(--acc-approval-bg)",
          borderBottom: "0.5px solid var(--border-hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icons.Inbox size={14} style={{ color: "var(--acc-approval-ink)" }} />
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--acc-approval-ink)",
              fontWeight: 500,
            }}
          >
            Approval needed &middot; L2
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StakesIndicator level={stakes === "med" ? "medium" : stakes} />
          {estTime && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
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
        {/* Action type + summary (display font) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {actionType}
          </div>
          <div
            className="display"
            style={{
              fontSize: 22,
              color: "var(--text)",
              letterSpacing: "-0.01em",
            }}
          >
            {summary}
          </div>
        </div>

        {/* Reasoning block — left border accent */}
        {reasoning && (
          <div
            style={{
              padding: "10px 12px",
              background: "var(--bg-subtle)",
              borderRadius: "var(--r-sm)",
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--text-secondary)",
              display: "flex",
              gap: 10,
              borderLeft: "2px solid var(--acc-workflow-ink)",
            }}
          >
            <Icons.Brain size={14} style={{ flexShrink: 0, marginTop: 2, color: "var(--text-tertiary)" }} />
            <div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
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
        )}

        {/* Preview */}
        {preview && Object.keys(preview).length > 0 && (
          <ApprovalPreview preview={preview} />
        )}

        {/* Downstream impact (high-stakes warning) */}
        {impact && (
          <div
            style={{
              padding: "10px 12px",
              background: "color-mix(in oklch, var(--warning) 8%, var(--bg))",
              border: "0.5px solid color-mix(in oklch, var(--warning) 30%, transparent)",
              borderRadius: "var(--r-sm)",
              fontSize: 12.5,
              color: "var(--text)",
              display: "flex",
              gap: 8,
            }}
          >
            <Icons.Warning size={13} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
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
              background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
              border: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
              borderRadius: "var(--r-sm)",
              fontSize: 12.5,
              color: "var(--danger)",
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
          borderTop: "0.5px solid var(--border-hairline)",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {/* Left: snooze */}
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="ghost"
            size="sm"
            icon="Clock"
            aria-label="Snooze approval"
          >
            Snooze
          </Button>
        </div>

        {/* Right: reject / edit / approve */}
        <div style={{ display: "flex", gap: 6 }}>
          <Button
            variant="ghost"
            size="sm"
            icon="X"
            onClick={() => void handleReject()}
            disabled={isPending}
            aria-label={`Reject: ${summary}`}
          >
            Reject
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="Edit"
            aria-label="Edit this action"
          >
            Edit
          </Button>
          <Button
            variant="primary"
            accent="approval"
            size="sm"
            icon="Check"
            onClick={() => void handleApprove()}
            disabled={isPending}
            aria-label={`Approve: ${summary}`}
          >
            {isPending ? "Processing…" : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ApprovalPreview ──────────────────────────────────────────────────────────

type PreviewPayload = Record<string, unknown>;

function ApprovalPreview({ preview }: { preview: PreviewPayload }) {
  const kind = preview.kind as string | undefined;

  if (kind === "content-diff") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <PreviewRow label="From" body={String(preview.before ?? "")} tone="muted" />
        <PreviewRow label="To" body={String(preview.after ?? "")} tone="primary" />
      </div>
    );
  }

  if (kind === "email") {
    return (
      <div
        style={{
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-sm)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            background: "var(--bg-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "0.5px solid var(--border-hairline)",
          }}
        >
          <Icons.Gmail size={14} style={{ color: "var(--text-tertiary)" }} />
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", gap: 16, flex: 1 }}>
            <span>
              <strong style={{ color: "var(--text)", fontWeight: 500 }}>To:</strong>{" "}
              {String(preview.to ?? "")}
            </span>
          </div>
        </div>
        <div style={{ padding: "10px 14px", background: "var(--bg-elevated)", borderBottom: "0.5px solid var(--border-hairline)" }}>
          <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
            {String(preview.subject ?? "")}
          </div>
        </div>
        <div
          style={{
            padding: "14px 16px",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--text)",
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-serif)",
          }}
        >
          {String(preview.body ?? "")}
        </div>
      </div>
    );
  }

  if (kind === "list" && Array.isArray(preview.items)) {
    const items = preview.items as Array<{ from?: string; to?: string }>;
    return (
      <div style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              padding: "9px 14px",
              borderBottom: i === items.length - 1 ? "none" : "0.5px solid var(--border-hairline)",
              display: "grid",
              gridTemplateColumns: "1fr 16px 1.5fr",
              alignItems: "center",
              gap: 12,
              fontSize: 12.5,
            }}
          >
            <span
              style={{
                color: "var(--text-tertiary)",
                textDecoration: it.to ? "line-through" : "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {String(it.from ?? "")}
            </span>
            {it.to && <Icons.ArrowRight size={11} style={{ color: "var(--text-faint)" }} />}
            <span
              style={{
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {String(it.to ?? "")}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Fallback: generic pre-formatted JSON preview
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--bg-subtle)",
        borderRadius: "var(--r-sm)",
        fontSize: 12,
        color: "var(--text)",
      }}
    >
      <pre
        style={{
          margin: 0,
          fontFamily: "var(--font-mono)",
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
  );
}

// ─── PreviewRow ───────────────────────────────────────────────────────────────

function PreviewRow({ label, body, tone }: { label: string; body: string; tone: "primary" | "muted" }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        gap: 12,
        padding: "8px 12px",
        background: tone === "primary" ? "var(--bg-elevated)" : "var(--bg-subtle)",
        border: tone === "primary" ? "0.5px solid var(--acc-approval-ink)" : "0.5px solid var(--border)",
        borderRadius: "var(--r-sm)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontFamily: "var(--font-mono)",
          color: tone === "primary" ? "var(--acc-approval-ink)" : "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          paddingTop: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: tone === "primary" ? "var(--text)" : "var(--text-tertiary)",
          lineHeight: 1.55,
          fontFamily: tone === "primary" ? "var(--font-serif)" : "var(--font-sans)",
        }}
      >
        {body}
      </div>
    </div>
  );
}
