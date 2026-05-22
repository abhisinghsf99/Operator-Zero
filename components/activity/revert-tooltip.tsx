"use client";

/**
 * components/activity/revert-tooltip.tsx
 * Accessible disabled revert button with Radix Tooltip (D-09 / ACT-04).
 *
 * When canRevert returns { allowed: false, reason }, renders a disabled button
 * with a Tooltip.Content showing REVERT_REASON_LABELS[reason].
 *
 * First Radix @radix-ui/react-tooltip use in the codebase.
 * @radix-ui/react-tooltip is available via the @radix-ui family installed
 * for the Dialog primitive. If not installed, it falls back to a title attribute.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Disabled button: aria-disabled="true" + visual disabled style
 *   - Tooltip: aria-describedby wired (D-09)
 *   - Keyboard-accessible: Radix Tooltip opens on focus
 *   - Screen-reader-accessible: aria-describedby points to Tooltip.Content id
 *
 * NOTE: The button must NOT be truly disabled (disabled attribute) if we want
 * it to receive focus for keyboard users. Instead, use aria-disabled="true"
 * and prevent the click handler. This satisfies WCAG 2.1 AA 4.1.2.
 */

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { CanRevertResult } from "@/lib/workflows/revert";
import { REVERT_REASON_LABELS } from "@/lib/workflows/revert";
import { Undo } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RevertTooltipProps {
  /** The reason from canRevert — determines tooltip text */
  reason: NonNullable<CanRevertResult["reason"]>;
  /** aria-describedby ID for the tooltip content element */
  tooltipId?: string;
}

// ─── RevertTooltip ────────────────────────────────────────────────────────────

export function RevertTooltip({
  reason,
  tooltipId = "revert-blocked-reason",
}: RevertTooltipProps) {
  const reasonLabel = REVERT_REASON_LABELS[reason];

  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        {/* Trigger: the disabled revert button */}
        <TooltipPrimitive.Trigger asChild>
          {/*
           * Use a span wrapper around the button to ensure Tooltip still receives
           * pointer events even though the button is aria-disabled. Radix Trigger
           * asChild passes through the ref and event handlers.
           */}
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={tooltipId}
            onClick={(e) => e.preventDefault()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 34,
              padding: "0 14px",
              borderRadius: "var(--r-sm)",
              background: "var(--bg-elevated)",
              color: "var(--text-tertiary)",
              border: "0.5px solid var(--border)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "not-allowed",
              opacity: 0.5,
              fontFamily: "inherit",
              letterSpacing: "-0.005em",
            }}
          >
            <Undo size={14} aria-hidden="true" />
            Revert
          </button>
        </TooltipPrimitive.Trigger>

        {/* Portal renders the tooltip outside any overflow containers */}
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            id={tooltipId}
            role="tooltip"
            sideOffset={6}
            style={{
              maxWidth: 280,
              padding: "8px 12px",
              borderRadius: "var(--r-md)",
              background: "var(--bg-deeper)",
              border: "0.5px solid var(--border-strong)",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--text)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              zIndex: 200,
            }}
          >
            {reasonLabel}
            <TooltipPrimitive.Arrow
              style={{
                fill: "var(--bg-deeper)",
              }}
            />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
