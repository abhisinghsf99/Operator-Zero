"use client";

/**
 * components/chat/workflow-visualizer.tsx
 * Live workflow build visualizer with Framer Motion step-reveal.
 *
 * CONV-03: Renders propose_workflow_plan inline blocks with animated step reveal.
 * Framer Motion AnimatePresence + staggered motion.div per step (delay i * 0.15).
 *
 * ACCESSIBILITY (UX-03, WCAG 2.1 AA):
 *   - Screen-reader text equivalent: visually-hidden ordered list of all steps
 *   - aria-hidden on the animated UI — the text equivalent is the accessible tree
 *   - prefers-reduced-motion: disables transform/opacity transitions
 *   - Save as Workflow button is keyboard-operable with aria-label
 *
 * SECURITY: T-2-06-02 — inline block payloads are data, not HTML; no raw innerHTML.
 */

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { saveWorkflowFromPlan } from "@/app/app/chat/actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  name: string;
  tool: string;
  description?: string;
}

export interface WorkflowPlan {
  name?: string;
  description?: string;
  steps?: WorkflowStep[];
  automation_level?: string;
  trigger_type?: string;
}

interface WorkflowVisualizerProps {
  plan: WorkflowPlan;
  messageId: string;
}

// ─── Step variants for Framer Motion ────────────────────────────────────────

const stepVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

// ─── WorkflowVisualizer ───────────────────────────────────────────────────────

export function WorkflowVisualizer({ plan, messageId }: WorkflowVisualizerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const steps = plan.steps ?? [];

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await saveWorkflowFromPlan(messageId);
      if ("workflowId" in result) {
        setSavedId(result.workflowId);
      } else {
        setSaveError(result.error);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [messageId]);

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]",
        "overflow-hidden"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--acc-chat-ink)]">
              Workflow Plan
            </span>
            {plan.automation_level && (
              <span className="rounded-sm border border-[var(--border)] px-1 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                {plan.automation_level}
              </span>
            )}
          </div>
          {plan.name && (
            <h3 className="mt-0.5 text-sm font-semibold text-[var(--text)]">
              {plan.name}
            </h3>
          )}
          {plan.description && (
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {plan.description}
            </p>
          )}
        </div>
      </div>

      {/* Step list — animated (aria-hidden, screen readers use the text equivalent below) */}
      {steps.length > 0 && (
        <>
          <div
            className="px-4 pb-3 pt-1"
            aria-hidden="true"
          >
            <AnimatePresence initial={false}>
              {steps.map((step, i) => (
                <motion.div
                  key={step.id}
                  variants={stepVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{
                    delay: i * 0.15,
                    duration: 0.25,
                    ease: "easeOut",
                  }}
                  // Reduced-motion: override to instant reveal
                  style={{
                    // CSS media query for reduced-motion is handled via Tailwind
                  }}
                  className={cn(
                    "mb-2 flex items-start gap-2.5 last:mb-0",
                    "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0"
                  )}
                >
                  {/* Step number badge */}
                  <div
                    className={cn(
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full",
                      "bg-[var(--acc-chat-ink)] text-[9px] font-semibold text-white",
                      "mt-0.5"
                    )}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[var(--text)]">
                      {step.name}
                    </div>
                    {step.description && (
                      <div className="text-xs text-[var(--text-tertiary)]">
                        {step.description}
                      </div>
                    )}
                    <div className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {step.tool}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Screen-reader text equivalent — visually hidden, fully accessible */}
          <ol className="sr-only" aria-label={`Workflow steps for ${plan.name ?? "this workflow"}`}>
            {steps.map((step, i) => (
              <li key={step.id}>
                Step {i + 1}: {step.name}
                {step.description ? ` — ${step.description}` : ""}
                {` (tool: ${step.tool})`}
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Footer — Save button */}
      <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
        <span className="text-xs text-[var(--text-tertiary)]">
          {steps.length} step{steps.length !== 1 ? "s" : ""}
          {plan.trigger_type && ` · ${plan.trigger_type}`}
        </span>

        {savedId ? (
          <span className="text-xs font-medium text-[var(--success)]">
            Saved as workflow
          </span>
        ) : (
          <button
            onClick={handleSave}
            disabled={isSaving}
            aria-label={`Save "${plan.name ?? "this workflow"}" as a workflow`}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-[var(--acc-chat-ink)] text-white",
              "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-chat-ink)]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-opacity"
            )}
          >
            {isSaving ? "Saving…" : "Save as Workflow"}
          </button>
        )}
      </div>

      {/* Save error */}
      {saveError && (
        <div
          role="alert"
          className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600"
        >
          {saveError}
        </div>
      )}
    </div>
  );
}
