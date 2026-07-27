"use client";

/**
 * components/chat/workflow-visualizer.tsx
 * Live workflow build visualizer with step-reveal animation.
 *
 * CONV-03: Renders propose_workflow_plan inline blocks with animated step reveal.
 * Uses CSS transitions (opacity + translateY) for step appearance — matching
 * the design's draw/anim-pop keyframes behavior. Framer Motion AnimatePresence
 * wraps each step for reduced-motion compliance.
 *
 * DESIGN: surface-conversation.jsx WorkflowBuildVisualizer section.
 *   - Elevated card with workflow-accent header
 *   - Display-font title
 *   - Step rows with circle icon, connector line, step label + detail
 *   - Settings grid once all steps are visible
 *   - Footer: "Save as workflow" is the only action (WS7.12 — the ghost
 *     button that used to sit next to it had no handler and was removed)
 *
 * ACCESSIBILITY (UX-03, WCAG 2.1 AA):
 *   - Screen-reader text equivalent: visually-hidden ordered list of all steps
 *   - aria-hidden on the animated UI — the text equivalent is the accessible tree
 *   - prefers-reduced-motion: disables transform/opacity transitions
 *   - Save as Workflow button is keyboard-operable with aria-label
 *
 * SECURITY: T-2-06-02 — inline block payloads are data, not HTML; no raw innerHTML.
 */

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { saveWorkflowFromPlan } from "@/app/app/chat/actions";
import { Button, LevelToggle } from "@/components/design/primitives";
import { Icons, type IconName } from "@/components/design/icons";
import type { Level } from "@/components/design/primitives";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  name: string;
  tool: string;
  description?: string;
  /** Optional icon name from Icons — defaults to Bolt */
  icon?: IconName;
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

// ─── WorkflowVisualizer ───────────────────────────────────────────────────────

export function WorkflowVisualizer({ plan, messageId }: WorkflowVisualizerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Snapshot of the level actually persisted — captured at save time so the
  // confirmation label can't drift if the toggle is touched again afterward.
  const [savedLevel, setSavedLevel] = useState<Level | null>(null);
  const [automationLevel, setAutomationLevel] = useState<Level>(
    (plan.automation_level as Level) ?? "L2"
  );

  // Step-reveal state: how many steps are currently visible
  const steps = plan.steps ?? [];
  const [visibleSteps, setVisibleSteps] = useState(0);

  // Stagger the step reveal — one every ~420ms with growing delay
  useEffect(() => {
    if (visibleSteps >= steps.length) return;
    const t = setTimeout(
      () => setVisibleSteps((s) => s + 1),
      420 + visibleSteps * 60
    );
    return () => clearTimeout(t);
  }, [visibleSteps, steps.length]);

  const allVisible = visibleSteps >= steps.length && steps.length > 0;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      // WS7.12 BUG: this used to call saveWorkflowFromPlan(messageId) with no
      // second argument, so the LevelToggle above only ever mutated local
      // state that nothing read — a user who picked L3 silently got a workflow
      // saved at L2 (or whatever plan.automation_level happened to be).
      // Passing automationLevel through is what makes the visible choice the
      // one that actually gets persisted.
      const result = await saveWorkflowFromPlan(messageId, automationLevel);
      if ("workflowId" in result) {
        setSavedId(result.workflowId);
        setSavedLevel(automationLevel);
      } else {
        setSaveError(result.error);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [messageId, automationLevel]);

  return (
    <MotionConfig reducedMotion="user">
      <div
        style={{
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-lg)",
          background: "var(--bg-elevated)",
          overflow: "hidden",
        }}
      >
        {/* Header — workflow accent */}
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "0.5px solid var(--border-hairline)",
            background: "var(--acc-workflow-bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.Workflows size={14} style={{ color: "var(--acc-workflow-ink)" }} />
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--acc-workflow-ink)",
                fontWeight: 500,
              }}
            >
              Workflow plan
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              color: "var(--acc-workflow-ink)",
              opacity: 0.7,
              fontFamily: "var(--font-mono)",
            }}
          >
            {!allVisible && steps.length > 0
              ? `building · step ${visibleSteps}/${steps.length}`
              : steps.length === 0
              ? "—"
              : "ready"}
          </span>
        </div>

        {/* Diagram body */}
        <div style={{ padding: "20px 22px" }}>
          {/* Display-font title */}
          {plan.name && (
            <div
              className="display"
              style={{ fontSize: 22, color: "var(--text)", marginBottom: 16 }}
            >
              {plan.name}
            </div>
          )}
          {plan.description && !plan.name && (
            <div
              className="display"
              style={{ fontSize: 22, color: "var(--text)", marginBottom: 16 }}
            >
              {plan.description}
            </div>
          )}

          {/* Step rows */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}
            aria-hidden="true"
          >
            <AnimatePresence initial={false}>
              {steps.map((step, i) => {
                const visible = i < visibleSteps;
                const isLast = i === steps.length - 1;
                const iconKey: IconName = (step.icon as IconName) ?? "Bolt";
                const Ico = Icons[iconKey] ?? Icons.Bolt;

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                    transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
                    style={{
                      display: "flex",
                      gap: 14,
                      paddingBottom: isLast ? 0 : 16,
                    }}
                  >
                    {/* Left: icon circle + connector line */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "var(--bg)",
                          border: "0.5px solid var(--border-strong)",
                          display: "grid",
                          placeItems: "center",
                          color: "var(--acc-workflow-ink)",
                          flexShrink: 0,
                        }}
                      >
                        <Ico size={14} />
                      </div>
                      {!isLast && (
                        <div
                          style={{
                            width: 0.5,
                            flex: 1,
                            background: visible ? "var(--border-strong)" : "transparent",
                            minHeight: 18,
                            transition: "background 0.4s",
                          }}
                        />
                      )}
                    </div>

                    {/* Right: step label + detail */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--font-mono)",
                            color: "var(--text-faint)",
                            letterSpacing: "0.06em",
                          }}
                        >
                          STEP {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>
                        {step.name}
                      </div>
                      {step.description && (
                        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                          {step.description}
                        </div>
                      )}
                      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>
                        {step.tool}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Screen-reader text equivalent — visually hidden, fully accessible */}
          {steps.length > 0 && (
            <ol className="sr-only" aria-label={`Workflow steps for ${plan.name ?? "this workflow"}`}>
              {steps.map((step, i) => (
                <li key={step.id}>
                  Step {i + 1}: {step.name}
                  {step.description ? ` — ${step.description}` : ""}
                  {` (tool: ${step.tool})`}
                </li>
              ))}
            </ol>
          )}

          {/* Settings grid — shown once all steps are visible */}
          {allVisible && (
            <div
              className="anim-pop"
              style={{
                marginTop: 22,
                padding: "12px 14px",
                background: "var(--bg-subtle)",
                border: "0.5px dashed var(--border-strong)",
                borderRadius: "var(--r-sm)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <VisualizerField label="Trigger" value={plan.trigger_type ?? "On new product"} />
              <VisualizerField
                label="Automation level"
                value={
                  <LevelToggle
                    value={automationLevel}
                    onChange={setAutomationLevel}
                    size="sm"
                  />
                }
              />
              <VisualizerField label="Steps" value={String(steps.length)} />
            </div>
          )}
        </div>

        {/* Footer — actions */}
        {allVisible && (
          <div
            className="anim-pop"
            style={{
              padding: "12px 16px",
              borderTop: "0.5px solid var(--border-hairline)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              alignItems: "center",
            }}
          >
            {saveError && (
              <span
                role="alert"
                style={{ fontSize: 12, color: "var(--danger)", flex: 1 }}
              >
                {saveError}
              </span>
            )}
            {savedId ? (
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--success)" }}>
                Saved as workflow{savedLevel ? ` (${savedLevel})` : ""}
              </span>
            ) : (
              // WS7.12: a ghost button used to live here with no onClick and
              // no handler — dead UI. Removed; Save as workflow is now the
              // only footer action.
              <Button
                variant="primary"
                accent="workflow"
                size="sm"
                icon="Check"
                onClick={() => void handleSave()}
                disabled={isSaving}
                aria-label={`Save "${plan.name ?? "this workflow"}" as a workflow`}
              >
                {isSaving ? "Saving…" : "Save as workflow"}
              </Button>
            )}
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

// ─── VisualizerField ──────────────────────────────────────────────────────────

function VisualizerField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--text-faint)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, color: "var(--text)" }}>{value}</span>
    </div>
  );
}
