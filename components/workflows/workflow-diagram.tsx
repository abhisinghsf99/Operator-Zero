"use client";

/**
 * components/workflows/workflow-diagram.tsx
 * Read-only workflow definition diagram.
 *
 * Renders the workflow's step graph as a vertical numbered list — matching the
 * WorkflowDiagram design in surface-workflow-detail.jsx.
 *
 * ANALOG: components/chat/workflow-visualizer.tsx (step rendering + accessibility)
 *
 * ACCESSIBILITY: WCAG 2.1 AA
 *   - Animated UI has aria-hidden; screen-reader text equivalent is a visually-hidden list
 *   - prefers-reduced-motion: disables enter animation
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  name: string;
  tool?: string;
  description?: string;
  type?: string;
}

interface WorkflowDiagramProps {
  steps: WorkflowStep[];
  workflowName?: string;
}

// ─── WorkflowDiagram ─────────────────────────────────────────────────────────

export function WorkflowDiagram({ steps, workflowName }: WorkflowDiagramProps) {
  if (steps.length === 0) {
    return (
      <div
        style={{
          padding: "24px 0",
          color: "var(--text-tertiary)",
          fontSize: 13,
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        No steps defined yet. Use "Edit in chat" to build this workflow.
      </div>
    );
  }

  return (
    <>
      {/* Visual diagram — aria-hidden; screen readers use the text equivalent below */}
      <div
        style={{ display: "flex", flexDirection: "column", gap: 0 }}
        aria-hidden="true"
        data-testid="workflow-diagram"
      >
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <div key={step.id} style={{ display: "flex", gap: 16 }}>
              {/* Step number + connector line */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--bg)",
                    border: "0.5px solid var(--border-strong)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11.5,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text)",
                    fontWeight: 500,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                {!isLast && (
                  <div
                    style={{
                      width: 0.5,
                      flex: 1,
                      background: "var(--border-strong)",
                      minHeight: 26,
                    }}
                  />
                )}
              </div>

              {/* Step content */}
              <div
                style={{
                  flex: 1,
                  paddingBottom: isLast ? 0 : 22,
                  paddingTop: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text)",
                    fontWeight: 500,
                  }}
                >
                  {step.name}
                </div>
                {step.description && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-tertiary)",
                      marginTop: 3,
                    }}
                  >
                    {step.description}
                  </div>
                )}
                {step.tool && (
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-faint)",
                    }}
                  >
                    {step.tool}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Screen-reader text equivalent — visually hidden, fully accessible */}
      <ol
        className="sr-only"
        aria-label={`Workflow steps for ${workflowName ?? "this workflow"}`}
      >
        {steps.map((step, i) => (
          <li key={step.id}>
            Step {i + 1}: {step.name}
            {step.description ? ` — ${step.description}` : ""}
            {step.tool ? ` (tool: ${step.tool})` : ""}
          </li>
        ))}
      </ol>
    </>
  );
}
