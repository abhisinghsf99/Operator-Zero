"use client";

/**
 * components/onboarding/progress-rail.tsx
 * Progress rail for the 6-step onboarding wizard.
 *
 * Renders a horizontal step indicator with:
 *   - Completed steps: filled circle with checkmark
 *   - Current step: outlined circle (aria-current="step")
 *   - Future steps: muted circle with step number
 *
 * WCAG 2.1 AA:
 *   - aria-current="step" on the active step
 *   - aria-label on each step indicator
 *   - Connector lines are aria-hidden
 */
import { Icons } from "@/components/design/icons";

export interface ProgressStep {
  key: string;
  label: string;
}

interface ProgressRailProps {
  steps: ProgressStep[];
  currentStep: number; // 0-indexed
}

export function ProgressRail({ steps, currentStep }: ProgressRailProps) {
  return (
    <nav
      aria-label="Onboarding progress"
      style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}
    >
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isCurrent = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
            {/* Step indicator */}
            <div
              style={{ display: "flex", alignItems: "center", gap: 6 }}
              aria-current={isCurrent ? "step" : undefined}
            >
              <div
                aria-label={`Step ${i + 1}: ${step.label}${isDone ? " (completed)" : isCurrent ? " (current)" : ""}`}
                role="img"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: isDone
                    ? "var(--acc-workflow-ink)"
                    : isCurrent
                    ? "var(--bg-elevated)"
                    : "transparent",
                  border: "0.5px solid",
                  borderColor:
                    isDone || isCurrent
                      ? "var(--acc-workflow-ink)"
                      : "var(--border-strong)",
                  color: isDone ? "var(--bg)" : "var(--text-tertiary)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {isDone ? (
                  <Icons.Check size={10} strokeWidth={2.4} aria-hidden={true} />
                ) : (
                  <span aria-hidden="true">{i + 1}</span>
                )}
              </div>
              <span
                style={{
                  fontSize: 11.5,
                  color: isFuture ? "var(--text-tertiary)" : "var(--text)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not the last step) */}
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 16,
                  height: 0.5,
                  background: "var(--border-strong)",
                  margin: "0 10px",
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
