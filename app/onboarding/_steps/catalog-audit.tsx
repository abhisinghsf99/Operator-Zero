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
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

    const selected = Array.from(picked).map(i => suggestions[i]!);
    const result = await createStarterWorkflows(selected);

    if (result && "error" in result) {
      setError(result.error);
      setSaving(false);
      return;
    }

    onNext();
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <div className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            Catalog audit
          </div>
          <h2 className="display mt-2 text-[36px] leading-tight tracking-[-0.015em] text-[var(--text)]">
            Reading your store…
          </h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--acc-workflow-ink)] border-t-transparent"
            aria-label="Loading catalog audit"
            role="status"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          Starter workflows · {suggestions.length} suggestions
        </div>
        <h2 className="display mt-2 text-[36px] leading-tight tracking-[-0.015em] text-[var(--text)]">
          Here's where I'd start.
        </h2>
        <p className="mt-1 text-[14px] leading-[1.55] text-[var(--text-tertiary)]">
          Tailored to what I found in your store. Pick the ones you want — I'll build them. You can dial autonomy per workflow.
        </p>
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label="Starter workflow suggestions">
        {suggestions.map((s, i) => {
          const isSelected = picked.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? "Deselect" : "Select"} ${s.name}`}
              className={`flex w-full cursor-pointer items-center gap-3.5 rounded-[var(--r-md)] border-[0.5px] px-4 py-3.5 text-left transition-colors ${
                isSelected
                  ? "border-[color-mix(in_oklch,var(--acc-workflow-ink)_35%,transparent)] bg-[var(--acc-workflow-bg)]"
                  : "border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              {/* Checkbox visual */}
              <div
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[3px] border-[0.5px] transition-colors ${
                  isSelected
                    ? "border-[var(--acc-workflow-ink)] bg-[var(--acc-workflow-ink)]"
                    : "border-[var(--border-strong)] bg-transparent"
                }`}
                aria-hidden="true"
              >
                {isSelected && <Check className="h-2.5 w-2.5 text-[var(--bg)]" strokeWidth={2.5} />}
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--text)]">{s.name}</span>
                  <Badge variant="activity" size="sm">
                    {DOMAIN_LABELS[s.domain]}
                  </Badge>
                  <Badge variant="subtle" size="sm">
                    {s.level}
                  </Badge>
                </div>
                <div className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
                  {s.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-[13px] text-[var(--danger)]" role="alert">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[var(--text-tertiary)]">
          {picked.size} of {suggestions.length} selected
        </span>
        <Button
          variant="workflow"
          size="lg"
          onClick={handleBuild}
          disabled={picked.size === 0 || saving}
          aria-busy={saving}
        >
          {saving ? "Building…" : `Build these${picked.size > 0 ? ` (${picked.size})` : ""}`}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
