"use client";

/**
 * components/activity/before-after-diff.tsx
 * Before → after field-level diff renderer (D-14 / ACT-03).
 *
 * Renders before_state → after_state as human-readable field-level diff
 * (old → new per field) from the existing before_state/after_state JSONB.
 *
 * SECURITY:
 *   T-3-04-04: All field values treated as plain text — React auto-escapes.
 *   NEVER render raw HTML in diff output — React auto-escapes all values. XSS not possible.
 *
 * DESIGN (RESEARCH.md Pattern 6):
 *   - renderFieldDiff() maps known field keys to display labels per target_type
 *   - email: shows "sent" badge instead of full diff (Discretion 3)
 *   - page body_html: truncates at 300 chars with "Show more" (Discretion 3)
 */

import { useState } from "react";

// ─── Field label maps (Pattern 6: RESEARCH.md D-14) ──────────────────────────

const FIELD_LABELS: Record<string, Record<string, string>> = {
  product: {
    meta_title: "Meta title",
    meta_description: "Meta description",
    body_html: "Description",
    status: "Status",
    price: "Price",
    inventory_quantity: "Inventory",
    title: "Product title",
    handle: "URL handle",
    vendor: "Vendor",
    product_type: "Product type",
  },
  email: {
    subject: "Subject",
    body: "Body",
    to: "To",
    from: "From",
    status: "Status",
  },
  page: {
    title: "Page title",
    body_html: "Page content",
    handle: "URL handle",
    published_at: "Published",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export interface FieldDiff {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * renderFieldDiff — compute field-level diff between before and after state.
 * Only returns fields where oldValue !== newValue.
 * Falls back to raw key name for unknown fields.
 */
export function renderFieldDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  targetType: string
): FieldDiff[] {
  if (!before && !after) return [];

  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  const labels = FIELD_LABELS[targetType] ?? {};

  return [...allKeys]
    .map((key) => ({
      field: key,
      label: labels[key] ?? key,
      oldValue: (before ?? {})[key],
      newValue: (after ?? {})[key],
    }))
    .filter((d) => {
      // Only show fields that actually changed
      return JSON.stringify(d.oldValue) !== JSON.stringify(d.newValue);
    });
}

// ─── Value rendering ──────────────────────────────────────────────────────────

const PAGE_BODY_TRUNCATE = 300;

function renderValue(
  value: unknown,
  field: string,
  targetType: string,
  expanded: boolean,
  onExpandToggle?: () => void
): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
        (empty)
      </span>
    );
  }

  const str = typeof value === "string" ? value : JSON.stringify(value);

  // Page body_html: truncate at 300 chars with "Show more" (Discretion 3)
  if (
    (targetType === "page" || targetType === "product") &&
    field === "body_html" &&
    str.length > PAGE_BODY_TRUNCATE
  ) {
    return (
      <span>
        {expanded ? str : str.slice(0, PAGE_BODY_TRUNCATE) + "…"}
        {onExpandToggle && (
          <button
            type="button"
            onClick={onExpandToggle}
            aria-expanded={expanded}
            style={{
              marginLeft: 6,
              color: "var(--acc-activity-ink)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
              padding: 0,
            }}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </span>
    );
  }

  return <span>{str}</span>;
}

// ─── DiffRow ──────────────────────────────────────────────────────────────────

function DiffRow({
  diff,
  targetType,
}: {
  diff: FieldDiff;
  targetType: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 0",
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      {/* Field label */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {diff.label}
      </span>

      {/* Before value */}
      {diff.oldValue !== undefined && (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--danger)",
              marginTop: 6,
              flexShrink: 0,
            }}
          />
          <span
            aria-label={`Before: ${String(diff.oldValue)}`}
            style={{
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--text-secondary)",
              textDecoration: "line-through",
              wordBreak: "break-word",
              flex: 1,
            }}
          >
            {renderValue(diff.oldValue, diff.field, targetType, expanded, () =>
              setExpanded((v) => !v)
            )}
          </span>
        </div>
      )}

      {/* After value */}
      {diff.newValue !== undefined && (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--success)",
              marginTop: 6,
              flexShrink: 0,
            }}
          />
          <span
            aria-label={`After: ${String(diff.newValue)}`}
            style={{
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--text)",
              wordBreak: "break-word",
              flex: 1,
            }}
          >
            {renderValue(diff.newValue, diff.field, targetType, expanded, () =>
              setExpanded((v) => !v)
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── BeforeAfterDiff ──────────────────────────────────────────────────────────

interface BeforeAfterDiffProps {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  targetType: string | null;
}

export function BeforeAfterDiff({
  before,
  after,
  targetType,
}: BeforeAfterDiffProps) {
  const type = targetType ?? "product";

  // Email: show sent badge instead of full diff (Discretion 3)
  if (type === "email") {
    const status = (after ?? {})["status"];
    const isSent =
      status === "sent" ||
      typeof (after ?? {})["sent_at"] !== "undefined";

    return (
      <div
        aria-label="Email action details"
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {isSent && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 22,
              padding: "0 8px",
              borderRadius: "var(--r-pill)",
              background: "var(--acc-activity-bg)",
              color: "var(--acc-activity-ink)",
              fontSize: 11.5,
              fontWeight: 500,
              border: "0.5px solid color-mix(in oklch, var(--acc-activity-ink) 18%, transparent)",
              width: "fit-content",
            }}
          >
            Email sent
          </span>
        )}
        {/* Render subject/to if available */}
        {Object.keys(after ?? {})
          .filter((k) => k !== "status" && (after ?? {})[k] !== undefined)
          .slice(0, 3)
          .map((key) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {(FIELD_LABELS["email"] ?? {})[key] ?? key}
              </span>
              <span
                style={{ fontSize: 12.5, color: "var(--text)", wordBreak: "break-word" }}
              >
                {String((after ?? {})[key])}
              </span>
            </div>
          ))}
      </div>
    );
  }

  const diffs = renderFieldDiff(before, after, type);

  if (diffs.length === 0) {
    return (
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--text-tertiary)",
          fontStyle: "italic",
        }}
      >
        No field-level changes recorded.
      </p>
    );
  }

  return (
    <div
      aria-label={`${diffs.length} field${diffs.length === 1 ? "" : "s"} changed`}
      style={{ display: "flex", flexDirection: "column" }}
    >
      {diffs.map((diff) => (
        <DiffRow key={diff.field} diff={diff} targetType={type} />
      ))}
    </div>
  );
}
