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

// ── LevelToggle ───────────────────────────────────────────────────────────────

const LEVEL_META: Record<AutomationLevel, string> = {
  L1: "Manual — agent prepares, you trigger",
  L2: "Approval-gated — agent proposes, you approve",
  L3: "Autonomous — agent acts, you observe",
};

function LevelToggle({
  value,
  onChange,
}: {
  value: AutomationLevel;
  onChange: (v: AutomationLevel) => void;
}) {
  const levels: AutomationLevel[] = ["L1", "L2", "L3"];
  return (
    <div
      className="inline-flex gap-[1px] rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] p-[2px]"
      role="radiogroup"
      aria-label="Automation level"
    >
      {levels.map((l) => {
        const active = value === l;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            title={LEVEL_META[l]}
            aria-label={`${l}: ${LEVEL_META[l]}`}
            onClick={() => onChange(l)}
            className={[
              "rounded-[var(--r-xs)] border-[0.5px] px-[10px] py-[3px] font-mono text-[12px] font-medium tracking-[0.02em] transition-all duration-[0.12s]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1",
              active
                ? "border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-[var(--shadow-sm)]"
                : "border-transparent bg-transparent text-[var(--text-tertiary)]",
            ].join(" ")}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
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
      className={[
        "relative h-[22px] w-[36px] cursor-pointer rounded-[var(--r-pill)] transition-colors duration-[0.2s]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1",
        on ? "bg-[var(--acc-workflow-ink)]" : "bg-[var(--bg-deeper)]",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-[left] duration-[0.2s]",
          on ? "left-[16px]" : "left-[2px]",
        ].join(" ")}
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

  function handleLevelChange(level: AutomationLevel) {
    setDefaultLevel(level);
    persistThresholds(level, overrides);
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
    <section aria-labelledby="autonomy-heading" className="mt-8">
      {/* Section header */}
      <div className="mb-5">
        <h2
          id="autonomy-heading"
          className="display text-[28px] tracking-[-0.015em] text-[var(--text)]"
        >
          Autonomy thresholds
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
          Where the agent acts on its own, where it pauses for you.
          Overrides can only <em>add</em> friction — they cannot loosen a workflow&rsquo;s own gate.
        </p>
      </div>

      {/* Default level card */}
      <div className="mb-[18px] rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-[20px] py-[20px]">
        <div className="mb-[6px] text-[12px] font-mono uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
          Default for new workflows
        </div>
        <div className="flex items-center gap-[14px]">
          <LevelToggle value={defaultLevel} onChange={handleLevelChange} />
          <span className="text-[12.5px] text-[var(--text-tertiary)]">
            Applies to new workflows only — existing workflows keep their own level.
          </span>
        </div>
      </div>

      {/* Per-action overrides card (D-05 curated set) */}
      <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-[20px] py-[20px]">
        <div className="mb-[6px] text-[12px] font-mono uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
          Always require approval, regardless of workflow level
        </div>
        <p className="mb-[10px] text-[12.5px] leading-[1.5] text-[var(--text-tertiary)]">
          These override any workflow-level setting — forcing a human approval before
          the action runs. They cannot make an action <em>more</em> autonomous.
        </p>

        <div className="flex flex-col gap-0">
          {OVERRIDE_ROWS.map((row, idx) => {
            const isOn = row.key in overrides && overrides[row.key] === "L2";
            const isLast = idx === OVERRIDE_ROWS.length - 1;
            return (
              <div
                key={row.key}
                className={[
                  "flex items-center gap-[16px] py-[14px]",
                  isLast ? "" : "border-b-[0.5px] border-[var(--border-hairline,var(--border))]",
                ].join(" ")}
              >
                <div className="flex-1">
                  <div className="text-[13.5px] font-medium text-[var(--text)]">{row.label}</div>
                  <div className="mt-[2px] text-[12.5px] text-[var(--text-tertiary)]">{row.desc}</div>
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
      </div>

      {/* Feedback */}
      {isPending && (
        <p className="mt-2 text-[12.5px] text-[var(--text-tertiary)]" aria-live="polite">
          Saving…
        </p>
      )}
      {!isPending && saved && (
        <p className="mt-2 text-[12.5px] text-[var(--success)]" aria-live="polite">
          Saved.
        </p>
      )}
      {error && (
        <p className="mt-2 text-[12.5px] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
