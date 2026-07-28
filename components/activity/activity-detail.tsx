"use client";

/**
 * components/activity/activity-detail.tsx
 * Activity entry detail panel (ACT-03 / ACT-04 / ACT-06).
 *
 * Renders:
 *   - Level badge, timestamp, result indicator
 *   - Action summary heading
 *   - Parent workflow link
 *   - BeforeAfterDiff (D-14)
 *   - ReasoningChain (Discretion 4)
 *   - Revert control: enabled (calls revertActivity) or disabled (RevertTooltip)
 *   - Save as Workflow (D-10: navigates to scoped thread)
 *
 * canRevert(entry, shopifyUpdatedAt) decides show/disable (D-11).
 * shopifyUpdatedAt from entry.shopifyUpdatedAt — joined server-side for product/page targets.
 * Server Action re-evaluates independently (T-3-04-02).
 *
 * SECURITY:
 *   - Imports revertActivity/saveAsWorkflow from lib/actions/activity (NOT route-local)
 *   - canRevert is UI parity only — Server Action enforces independently
 *   - No dangerouslySetInnerHTML anywhere (T-3-04-04)
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Focus trap not needed (panel is persistent, not modal)
 *   - Workflow link: aria-label
 *   - Revert button: isPending guard + accessible disabled state via RevertTooltip
 *
 * DESIGN: Matches surface-activity.jsx ActivityDetail pixel-for-pixel.
 *   Uses Badge, ResultIndicator, Card, SectionHeader, Button from shared primitives.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { canRevert } from "@/lib/workflows/revert";
import {
  revertActivity,
  saveAsWorkflow,
} from "@/lib/actions/activity";
import {
  Badge,
  ResultIndicator,
  Card,
  SectionHeader,
  Button,
} from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
import { BeforeAfterDiff } from "./before-after-diff";
import { ReasoningChain } from "./reasoning-chain";
import { RevertTooltip } from "./revert-tooltip";
import { humanizeGids } from "@/lib/activity/humanize-gids";
import type { ActivityEntryRow } from "@/app/app/activity/actions";
import type { CanRevertResult } from "@/lib/workflows/revert";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFullTime(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── ActivityDetail ────────────────────────────────────────────────────────────

interface ActivityDetailProps {
  entry: ActivityEntryRow;
  /** Shopify GID → product title map for humanizing the heading + diff. */
  gidTitles?: Record<string, string>;
  onClose?: () => void;
}

export function ActivityDetail({
  entry,
  gidTitles,
  onClose,
}: ActivityDetailProps) {
  const router = useRouter();
  const [isReverting, setIsReverting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ─── canRevert check (D-11, UI parity — Server Action enforces independently) ──

  // For product/page targets: pass the joined shopify_updated_at (WARNING 2)
  // For non-Shopify targets: pass undefined (drift rule does not apply)
  const shopifyUpdatedAt =
    (entry.target_type === "product" || entry.target_type === "page") &&
    entry.shopifyUpdatedAt !== undefined
      ? entry.shopifyUpdatedAt
      : undefined;

  const revertCheck: CanRevertResult = canRevert(
    {
      action_type: entry.action_type,
      occurred_at: entry.occurred_at,
      is_revertable: entry.is_revertable,
      reverted_at: entry.reverted_at,
      before_state: entry.before_state as Record<string, unknown> | null,
    },
    shopifyUpdatedAt
  );

  // ─── Revert handler ────────────────────────────────────────────────────────

  const handleRevert = useCallback(async () => {
    if (isReverting || !revertCheck.allowed) return;
    setIsReverting(true);
    try {
      const result = await revertActivity(entry.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Action reverted successfully");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revert");
    } finally {
      setIsReverting(false);
    }
  }, [entry.id, isReverting, revertCheck.allowed]);

  // ─── Save as Workflow handler ──────────────────────────────────────────────

  const handleSaveAsWorkflow = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveAsWorkflow(entry.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        router.push(`/app/chat/${result.threadId}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save as workflow");
    } finally {
      setIsSaving(false);
    }
  }, [entry.id, isSaving, router]);

  const isL3 = entry.automation_level === "L3";

  return (
    <div
      style={{
        padding: "28px 28px 60px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {/* Header row: level badge, timestamp, result, close */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {entry.automation_level && (
          <span aria-label={`Automation level: ${entry.automation_level}`}>
            <Badge
              accent={isL3 ? "workflow" : "activity"}
              size="md"
              mono
            >
              {entry.automation_level}
            </Badge>
          </span>
        )}
        <span
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {formatFullTime(entry.occurred_at)}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <ResultIndicator result={entry.result as "success" | "partial" | "failed"} />
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            style={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              borderRadius: "var(--r-sm)",
              background: "transparent",
              color: "var(--text-tertiary)",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Icons.X size={14} aria-hidden={true} />
          </button>
        )}
      </div>

      {/* Action summary heading — 26px per design */}
      <h2
        className="display"
        style={{
          fontSize: 26,
          color: "var(--text)",
          margin: 0,
          lineHeight: 1.25,
          letterSpacing: "-0.015em",
        }}
      >
        {humanizeGids(entry.action_summary, gidTitles)}
      </h2>

      {/* Parent workflow link (ACT-03) */}
      {entry.workflow_id && (
        <a
          href={`/app/workflows/${entry.workflow_id}`}
          aria-label={`View workflow: ${entry.workflowName ?? entry.workflow_id}`}
          style={{
            fontSize: 13,
            color: "var(--acc-workflow-ink)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
            width: "fit-content",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.textDecoration = "underline")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.textDecoration = "none")
          }
        >
          <Icons.Workflows size={12} aria-hidden={true} />
          from {entry.workflowName ?? "View workflow"}
          <Icons.ArrowRight size={11} aria-hidden={true} />
        </a>
      )}

      {/* Failed action banner */}
      {entry.result === "failed" && (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
            border: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
            borderRadius: "var(--r-md)",
            fontSize: 13,
            color: "var(--text)",
            display: "flex",
            gap: 10,
          }}
        >
          <Icons.Warning
            size={14}
            style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }}
            aria-hidden={true}
          />
          <div>
            <strong style={{ fontWeight: 500 }}>This needs your attention.</strong>{" "}
            {entry.result_details ??
              "The agent stopped instead of guessing. Open it in chat to handle manually."}
          </div>
        </div>
      )}

      {/* Before/after diff (D-14 / ACT-03) */}
      {(entry.before_state !== null || entry.after_state !== null) && (
        <Card padding={16}>
          <SectionHeader>Changes</SectionHeader>
          <BeforeAfterDiff
            before={entry.before_state as Record<string, unknown> | null}
            after={entry.after_state as Record<string, unknown> | null}
            targetType={entry.target_type}
            gidTitles={gidTitles}
          />
        </Card>
      )}

      {/* Reasoning chain (ACT-03 / Discretion 4) */}
      {(entry.reasoning_chain !== null || entry.reasoning_chain_url) && (
        <Card padding={16}>
          <ReasoningChain
            reasoning_chain={entry.reasoning_chain}
            reasoning_chain_url={entry.reasoning_chain_url}
          />
        </Card>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {/* Revert control (ACT-04 / D-09) */}
        {revertCheck.allowed ? (
          <Button
            variant="secondary"
            size="md"
            icon="Undo"
            onClick={handleRevert}
            disabled={isReverting}
            aria-label={isReverting ? "Reverting..." : "Revert this action"}
          >
            {isReverting ? "Reverting..." : "Revert"}
          </Button>
        ) : (
          // Disabled revert with accessible tooltip (D-09)
          <RevertTooltip
            reason={revertCheck.reason!}
            tooltipId={`revert-reason-${entry.id}`}
          />
        )}

        {/* Save as Workflow / Open in chat (ACT-06 / D-10) */}
        <Button
          variant="ghost"
          size="md"
          icon="Chat"
          onClick={handleSaveAsWorkflow}
          disabled={isSaving}
          aria-label="Save this action as a reusable workflow"
        >
          {isSaving ? "Opening..." : "Open in chat"}
        </Button>
      </div>

      {/* Drift note (informational) */}
      <p
        style={{
          margin: 0,
          fontSize: 11.5,
          color: "var(--text-tertiary)",
          lineHeight: 1.5,
          fontStyle: "italic",
        }}
      >
        Reverts are subject to drift rules. Sent emails can&apos;t be unsent — the
        agent can draft a follow-up if needed.
      </p>
    </div>
  );
}
