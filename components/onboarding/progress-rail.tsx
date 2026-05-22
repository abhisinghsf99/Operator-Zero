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
 *   - aria-label on each step button
 *   - Connector lines are aria-hidden
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className="flex items-center gap-0 overflow-x-auto"
    >
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isCurrent = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <div key={step.key} className="flex items-center">
            {/* Step indicator */}
            <div
              className="flex items-center gap-1.5"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div
                aria-label={`Step ${i + 1}: ${step.label}${isDone ? " (completed)" : isCurrent ? " (current)" : ""}`}
                role="img"
                className={cn(
                  "flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[10px] font-mono font-semibold transition-colors",
                  isDone && "border-[var(--acc-workflow-ink)] bg-[var(--acc-workflow-ink)] text-[var(--bg)]",
                  isCurrent && "border-[var(--acc-workflow-ink)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)]",
                  isFuture && "border-[var(--border-strong)] bg-transparent text-[var(--text-tertiary)]"
                )}
              >
                {isDone ? (
                  <Check
                    className="h-2.5 w-2.5"
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                ) : (
                  <span aria-hidden="true">{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "font-mono text-[11.5px] tracking-[0.02em]",
                  isFuture ? "text-[var(--text-tertiary)]" : "text-[var(--text)]"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not the last step) */}
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="mx-2.5 h-px w-4 flex-shrink-0 bg-[var(--border-strong)]"
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
