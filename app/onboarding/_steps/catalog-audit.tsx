"use client";

/**
 * app/onboarding/_steps/catalog-audit.tsx
 * Step 4: Catalog audit + starter workflow selection.
 *
 * Polls for catalog audit results (from the catalogAudit Inngest function).
 * Renders suggestions as selectable checkboxes.
 * On confirm, inserts selected starters as Draft L2 workflows (source='onboarding').
 *
 * Full implementation in Task 2 (02-08 Plan).
 */
import { useState, useEffect } from "react";
import { Button, Badge, Card, DomainBadge } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
import { createStarterWorkflows } from "@/app/onboarding/actions";

export interface WorkflowSuggestion {
  name: string;
  description: string;
  domain: "catalog" | "seo" | "qa" | "inventory" | "content";
  level: "L2";
}

interface CatalogAuditStepProps {
  /** Pre-computed suggestions from the server (from catalogAudit Inngest fn) */
  suggestions: WorkflowSuggestion[];
  onNext: () => void;
}

const DOMAIN_LABELS: Record<WorkflowSuggestion["domain"], string> = {
  catalog: "Catalog",
  seo: "SEO",
  qa: "Q&A",
  inventory: "Inventory",
  content: "Content",
};

/** Audit checklist items shown during the loading state */
const AUDIT_LINES = [
  "Pulling product catalog",
  "Reading order history",
  "Scanning customer email patterns",
  "Cross-referencing with brand voice",
];

export function CatalogAuditStep({ suggestions, onNext }: CatalogAuditStepProps) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-select all by default
  useEffect(() => {
    setPicked(new Set(suggestions.map((_, i) => i)));
  }, [suggestions]);

  function toggle(i: number) {
    const next = new Set(picked);
    if (next.has(i)) {
      next.delete(i);
    } else {
      next.add(i);
    }
    setPicked(next);
  }

  async function handleBuild() {
    setSaving(true);
    setError(null);

    const selected = Array.from(picked).map((i) => suggestions[i]!);
    const result = await createStarterWorkflows(selected);

    if (result && "error" in result) {
      setError(result.error);
      setSaving(false);
      return;
    }

    onNext();
  }

  // Loading / running state
  if (suggestions.length === 0) {
    return (
      <div className="anim-pop" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div
            style={{
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Catalog audit
          </div>
          <h2
            className="display"
            style={{
              fontSize: 36,
              margin: "8px 0 6px",
              color: "var(--text)",
              letterSpacing: "-0.015em",
            }}
          >
            Reading your store…
          </h2>
        </div>
        <Card padding={20}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {AUDIT_LINES.map((line) => (
              <div
                key={line}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <Icons.Check
                  size={14}
                  style={{ color: "var(--success)" }}
                  aria-hidden={true}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {line}
                </span>
              </div>
            ))}
            {/* Composing spinner */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "1.5px solid var(--acc-workflow-ink)",
                  borderTopColor: "transparent",
                  display: "inline-block",
                  animation: "spin 0.8s linear infinite",
                }}
                aria-label="Loading"
                role="status"
              />
              <span
                style={{
                  fontSize: 14.5,
                  color: "var(--text-tertiary)",
                  fontStyle: "italic",
                  fontFamily: "var(--font-serif)",
                }}
              >
                composing suggestions…
              </span>
            </div>
          </div>
        </Card>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="anim-pop" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div
          style={{
            fontSize: 11.5,
            fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Starter workflows · {suggestions.length} suggestions
        </div>
        <h2
          className="display"
          style={{
            fontSize: 36,
            margin: "8px 0 6px",
            color: "var(--text)",
            letterSpacing: "-0.015em",
          }}
        >
          Here&apos;s where I&apos;d start.
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          Tailored to what I found in your store. Pick the ones you want — I&apos;ll build them.
          You can dial autonomy per workflow.
        </p>
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
        role="group"
        aria-label="Starter workflow suggestions"
      >
        {suggestions.map((s, i) => {
          const isSelected = picked.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? "Deselect" : "Select"} ${s.name}`}
              style={{
                padding: "14px 18px",
                background: isSelected ? "var(--acc-workflow-bg)" : "var(--bg-elevated)",
                border: "0.5px solid",
                borderColor: isSelected
                  ? "color-mix(in oklch, var(--acc-workflow-ink) 35%, transparent)"
                  : "var(--border)",
                borderRadius: "var(--r-md)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: "100%",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              {/* Checkbox visual */}
              <div
                style={{
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 3,
                  border: "0.5px solid",
                  borderColor: isSelected ? "var(--acc-workflow-ink)" : "var(--border-strong)",
                  background: isSelected ? "var(--acc-workflow-ink)" : "transparent",
                  transition: "background 0.12s, border-color 0.12s",
                }}
                aria-hidden="true"
              >
                {isSelected && (
                  <Icons.Check
                    size={10}
                    strokeWidth={2.5}
                    style={{ color: "var(--bg)" }}
                  />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>
                    {s.name}
                  </span>
                  <DomainBadge domain={DOMAIN_LABELS[s.domain]} />
                  <Badge mono accent="activity" size="sm">
                    {s.level}
                  </Badge>
                </div>
                <div
                  style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 3 }}
                >
                  {s.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {picked.size} of {suggestions.length} selected
        </span>
        <Button
          variant="primary"
          accent="workflow"
          icon="ArrowRight"
          size="lg"
          onClick={handleBuild}
          disabled={picked.size === 0 || saving}
          aria-label={saving ? "Building workflows" : undefined}
        >
          {saving ? "Building…" : `Build these${picked.size > 0 ? ` (${picked.size})` : ""}`}
        </Button>
      </div>
    </div>
  );
}
