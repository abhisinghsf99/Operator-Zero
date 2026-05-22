"use client";

/**
 * components/activity/activity-row.tsx
 * Virtualizable activity log row (ACT-01).
 *
 * Renders: timeline node, timestamp, parent workflow name, summary,
 * ResultIndicator, automation level badge.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Keyboard-accessible via role="button" + tabIndex
 *   - aria-label includes summary for screen readers
 *   - ResultIndicator carries text label (not color-only)
 *   - Checkbox for select mode: aria-label + aria-checked
 *
 * DESIGN: Mirrors surface-activity.jsx ActivityRow layout:
 *   grid (timestamp | summary+workflow | level badge | result indicator)
 */

import { Check } from "lucide-react";
import type { ActivityEntryRow } from "@/app/app/activity/actions";

interface ActivityRowProps {
  entry: ActivityEntryRow;
  isActive: boolean;
  isSelected: boolean;
  selectMode: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function ResultIndicator({ result }: { result: string }) {
  const isFailed = result === "failed" || result === "partial";
  const isPartial = result === "partial";

  const color = isFailed
    ? isPartial
      ? "var(--acc-activity-ink)"
      : "var(--danger)"
    : "var(--success)";

  const label = result === "success" ? "Success" : result === "partial" ? "Partial" : "Failed";

  return (
    <span
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11.5,
        color,
        fontFamily: "var(--font-mono)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const isL3 = level === "L3";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        padding: "0 6px",
        fontSize: 11,
        background: "var(--bg-subtle)",
        color: isL3 ? "var(--acc-workflow-ink)" : "var(--acc-activity-ink)",
        borderRadius: "var(--r-pill)",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        border: `0.5px solid color-mix(in oklch, ${isL3 ? "var(--acc-workflow-ink)" : "var(--acc-activity-ink)"} 18%, transparent)`,
      }}
    >
      {level}
    </span>
  );
}

// ─── ActivityRow ───────────────────────────────────────────────────────────────

export function ActivityRow({
  entry,
  isActive,
  isSelected,
  selectMode,
  onClick,
  onToggleSelect,
}: ActivityRowProps) {
  const isFailed = entry.result === "failed" || entry.result === "partial";

  function handleClick(e: React.MouseEvent) {
    if (selectMode) {
      e.stopPropagation();
      onToggleSelect();
    } else {
      onClick();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (selectMode) {
        onToggleSelect();
      } else {
        onClick();
      }
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${entry.action_summary}${entry.workflowName ? ` from ${entry.workflowName}` : ""}`}
      aria-pressed={selectMode ? isSelected : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        padding: "10px 12px 10px 30px",
        marginBottom: 2,
        cursor: "pointer",
        borderRadius: "var(--r-sm)",
        background: isActive || isSelected ? "var(--bg-subtle)" : "transparent",
        transition: "background 0.12s",
        display: "grid",
        gridTemplateColumns: selectMode
          ? "24px 96px minmax(0, 1fr) auto auto"
          : "96px minmax(0, 1fr) auto auto",
        alignItems: "center",
        gap: 14,
        outline: "none",
      }}
      onMouseEnter={(e) => {
        if (!isActive && !isSelected)
          e.currentTarget.style.background = "var(--bg-subtle)";
      }}
      onMouseLeave={(e) => {
        if (!isActive && !isSelected)
          e.currentTarget.style.background = "transparent";
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = "2px solid var(--acc-workflow-ink)";
        e.currentTarget.style.outlineOffset = "1px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = "none";
      }}
    >
      {/* Timeline node */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 5,
          top: 14,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "var(--bg)",
          border: "1.5px solid",
          borderColor: isFailed ? "var(--danger)" : "var(--success)",
        }}
      />

      {/* Checkbox (select mode only) */}
      {selectMode && (
        <div
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`Select: ${entry.action_summary}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          style={{
            width: 18,
            height: 18,
            borderRadius: "var(--r-sm)",
            border: `1.5px solid ${isSelected ? "var(--acc-workflow-ink)" : "var(--border-strong)"}`,
            background: isSelected ? "var(--acc-workflow-ink)" : "transparent",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            flexShrink: 0,
            transition: "background 0.12s, border-color 0.12s",
          }}
        >
          {isSelected && (
            <Check
              size={11}
              style={{ color: "var(--bg)" }}
              aria-hidden="true"
            />
          )}
        </div>
      )}

      {/* Timestamp */}
      <span
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {formatTime(entry.occurred_at)}
      </span>

      {/* Summary + workflow */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 13.5,
            color: "var(--text)",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.action_summary}
        </span>
        {entry.workflowName && (
          <span
            style={{
              fontSize: 11.5,
              color: "var(--text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.workflowName}
          </span>
        )}
      </div>

      {/* Level badge */}
      <LevelBadge level={entry.automation_level} />

      {/* Result indicator */}
      <ResultIndicator result={entry.result} />
    </div>
  );
}
