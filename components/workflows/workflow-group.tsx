"use client";

/**
 * components/workflows/workflow-group.tsx
 * WorkflowGroup — section header + list of WorkflowRow for one status bucket.
 *
 * Receives a title (e.g., "Active — scheduled") and a list of workflows in
 * that bucket. Renders a SectionHeader with a count and the rows inside a
 * card-style container matching the surface-workflows.jsx WorkflowGroup design.
 *
 * DESIGN CONTRACT: surface-workflows.jsx WorkflowGroup
 * ACCESSIBILITY: section element with implicit landmark; count shown in aria-label
 */

import { type WorkflowSummary } from "@/lib/workflows/grouping";
import { WorkflowRow } from "@/components/workflows/workflow-row";
import { SectionHeader } from "@/components/design/primitives";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface WorkflowGroupProps {
  title: string;
  workflows: WorkflowSummary[];
  /** Muted appearance for Paused / Drafts groups */
  muted?: boolean;
}

// ─── WorkflowGroup ─────────────────────────────────────────────────────────────

export function WorkflowGroup({ title, workflows, muted }: WorkflowGroupProps) {
  const count = workflows.length;

  return (
    <section
      aria-label={`${title} — ${count} workflow${count !== 1 ? "s" : ""}`}
    >
      {/* Section header: title + count — SectionHeader primitive */}
      <SectionHeader
        right={
          <span
            style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}
            aria-hidden="true"
          >
            {String(count).padStart(2, "0")}
          </span>
        }
      >
        {title}
      </SectionHeader>

      {/* Workflow rows container */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
          opacity: muted ? 0.75 : 1,
        }}
        role="list"
      >
        {workflows.map((workflow, index) => (
          <WorkflowRow
            key={workflow.id}
            workflow={workflow}
            isLast={index === workflows.length - 1}
          />
        ))}
      </div>
    </section>
  );
}
