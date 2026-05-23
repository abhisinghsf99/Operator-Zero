"use client";

/**
 * app/app/settings/_autonomy.tsx
 * Autonomy Thresholds settings section — SET-03 / D-05 / D-06.
 *
 * Two parts:
 *   1. Default level for NEW workflows (LevelToggle L1/L2/L3).
 *      "Applies to new workflows only" — D-07: does NOT retroactively change existing.
 *   2. Per-action overrides for the D-05 curated set (price, status, redirects,
 *      inventory, send-customer-email, page/content) — displayed as "always require
 *      approval" toggles. These can ONLY add friction (D-06 copy in the UI).
 *
 * IMPORTANT (D-06): Override toggles only add friction. When "on" the override
 * forces L2 (approval-gated) for that action, regardless of workflow level.
 * When "off" the workflow's own level is respected. The engine enforces
 * one-directionality (execute-workflow-run.ts) — this copy reinforces the mental model.
 *
 * WCAG 2.1 AA:
 *   - All buttons have aria-label
 *   - Toggle state announced via aria-checked + role=switch
 *   - Error state uses role=alert
 *   - focus-visible ring on all interactive elements
 */

import { useState, useTransition } from "react";
import { LevelToggle, Card, SectionHeader } from "@/components/design/primitives";
import type { Level } from "@/components/design/primitives";
import { saveAutonomyThresholds } from "@/app/app/settings/actions";

// ── D-05 curated override rows ────────────────────────────────────────────────
//
// Keys map to the exact AGENT-03 write tool names (D-05 curated set).
// NO "discount codes" row — no v1 write tool for that action.
// NOT user-extensible — this is a fixed set enforced by Zod in saveAutonomyThresholds.

const OVERRIDE_ROWS = [
  {
    key: "shopify_update_variant_price",
    label: "Price changes",
    desc: "Any modification to product price or compare-at price.",
  },
  {
    key: "shopify_update_product_status",
    label: "Product retirement",
    desc: "Marking a product as unavailable or archiving it.",
  },
  {
    key: "shopify_create_redirect",
    label: "Redirect creation",
    desc: "Adding or modifying URL redirects.",
  },
  {
    key: "shopify_update_variant_inventory",
    label: "Inventory changes",
    desc: "Moving or adjusting stock quantities.",
  },
  {
    key: "gmail_send_email",
    label: "Send-to-customer email",
    desc: "Outbound email replies in customer support workflows.",
  },
  {
    key: "shopify_update_page_content",
    label: "Page / content updates",
    desc: "Updating the HTML content of a Shopify page.",
  },
] as const;

type AutomationLevel = "L1" | "L2" | "L3";

interface AutonomySectionProps {
  thresholds: { default_level: string; per_action_overrides: Record<string, string> } | null;
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────────

function ToggleSwitch({
  on,
  onToggle,
  ariaLabel,
}: {
  on: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onToggle}
      style={{
        position: "relative",
        width: 36,
        height: 22,
        borderRadius: "var(--r-pill)",
        background: on ? "var(--acc-workflow-ink)" : "var(--bg-deeper)",
        cursor: "pointer",
        border: "none",
        transition: "background 0.2s",
        flexShrink: 0,
        outline: "none",
      }}
      className="focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "white",
          transition: "left 0.2s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
        aria-hidden="true"
      />
    </button>
  );
}

// ── AutonomySection ───────────────────────────────────────────────────────────

/**
 * AutonomySection — the full Autonomy Thresholds settings section.
 *
 * @param thresholds - server-loaded autonomy thresholds (null = use defaults)
 */
export function AutonomySection({ thresholds }: AutonomySectionProps) {
  const [defaultLevel, setDefaultLevel] = useState<AutomationLevel>(
    (thresholds?.default_level as AutomationLevel) ?? "L2"
  );

  // Override map: key → "L2" when on, undefined when off
  // "On" means force L2 (approval-gated) regardless of workflow level (D-06)
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const saved = thresholds?.per_action_overrides ?? {};
    return { ...saved };
  });

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleLevelChange(level: Level) {
    setDefaultLevel(level as AutomationLevel);
    persistThresholds(level as AutomationLevel, overrides);
  }

  function handleOverrideToggle(key: string, currentlyOn: boolean) {
    const next = { ...overrides };
    if (currentlyOn) {
      // Turn off — remove the override key
      delete next[key];
    } else {
      // Turn on — force L2 (require approval)
      next[key] = "L2";
    }
    setOverrides(next);
    persistThresholds(defaultLevel, next);
  }

  function persistThresholds(level: AutomationLevel, ov: Record<string, string>) {
    setSaved(false);
    startTransition(async () => {
      setError(null);
      const result = await saveAutonomyThresholds(level, ov);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <section aria-labelledby="autonomy-heading">
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <h2
          id="autonomy-heading"
          className="display"
          style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
        >
          Autonomy thresholds
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 580 }}>
          Where the agent acts on its own, where it pauses for you.
          Overrides can only <em>add</em> friction — they cannot loosen a workflow&rsquo;s own gate.
        </p>
      </div>

      {/* Default level card */}
      <Card padding={20} style={{ marginBottom: 18 }}>
        <SectionHeader>Default for new workflows</SectionHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
          <LevelToggle value={defaultLevel} onChange={handleLevelChange} />
          <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Applies to new workflows only — existing workflows keep their own level.
          </span>
        </div>
      </Card>

      {/* Per-action overrides card (D-05 curated set) */}
      <Card padding={20}>
        <SectionHeader>Always require approval, regardless of workflow level</SectionHeader>
        <p style={{ marginBottom: 10, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-tertiary)" }}>
          These override any workflow-level setting — forcing a human approval before
          the action runs. They cannot make an action <em>more</em> autonomous.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {OVERRIDE_ROWS.map((row, idx) => {
            const isOn = row.key in overrides && overrides[row.key] === "L2";
            const isLast = idx === OVERRIDE_ROWS.length - 1;
            return (
              <div
                key={row.key}
                style={{
                  padding: "14px 0",
                  borderBottom: isLast ? "none" : "0.5px solid var(--border-hairline)",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text)" }}>{row.label}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>{row.desc}</div>
                </div>
                <ToggleSwitch
                  on={isOn}
                  onToggle={() => handleOverrideToggle(row.key, isOn)}
                  ariaLabel={`${isOn ? "Disable" : "Enable"} always-require-approval for ${row.label}`}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Feedback */}
      {isPending && (
        <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-tertiary)" }} aria-live="polite">
          Saving…
        </p>
      )}
      {!isPending && saved && (
        <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--success)" }} aria-live="polite">
          Saved.
        </p>
      )}
      {error && (
        <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
