"use client";

/**
 * app/app/workflows/[id]/_workflow-detail-view.tsx
 * Workflow Detail client view shell.
 *
 * Layout mirrors surface-workflow-detail.jsx:
 *   - Breadcrumb → My Workflows (ChevronLeft icon)
 *   - Header: WorkflowDetailHeader (inline-editable name/description + LevelToggle + actions)
 *   - 5-stat bar (Automation stat shows LevelToggle read-only display)
 *   - Left: WorkflowDiagram in Card with SectionHeader
 *   - Right: HistoricalRunsPanel + VersionHistoryPanel (bg-subtle panel)
 *
 * D-01: Inline editable name/description via WorkflowDetailHeader
 * D-02: Schedule picker in header for trigger editing
 * D-03: Every edit → new version via editWorkflow
 * D-04: Version history panel with Restore
 * D-05: Run Now confirm dialog (write/L3) or instant (read-only/manual)
 * D-06: Open in Chat sets context_workflow_id
 */

import Link from "next/link";
import { useState, useCallback } from "react";
import { WorkflowDetailHeader } from "@/components/workflows/workflow-detail-header";
import { WorkflowDiagram } from "@/components/workflows/workflow-diagram";
import { HistoricalRunsPanel } from "@/components/workflows/historical-runs-panel";
import { VersionHistoryPanel } from "@/components/workflows/version-history-panel";
import {
  SectionHeader,
  Card,
  LevelToggle,
  type Level,
} from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
import type {
  WorkflowDetailData,
  WorkflowVersionData,
  WorkflowRunData,
} from "./page";

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorkflowDetailViewProps {
  workflow: WorkflowDetailData;
  versions: WorkflowVersionData[];
  runs: WorkflowRunData[];
}

// ─── StatBlock ───────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          fontFamily: "var(--font-mono)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13.5,
          color: "var(--text)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── formatRelativeTime helper ────────────────────────────────────────────────

function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) return "never";
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

// ─── WorkflowDetailView ───────────────────────────────────────────────────────

export function WorkflowDetailView({
  workflow: initialWorkflow,
  versions,
  runs: initialRuns,
}: WorkflowDetailViewProps) {
  // Local state tracks optimistic field updates from inline edits
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [runs, setRuns] = useState(initialRuns);

  // Callback passed down to header for optimistic name/description/level updates
  const handleWorkflowUpdate = useCallback(
    (patch: Partial<Pick<WorkflowDetailData, "name" | "description" | "automation_level" | "trigger_type" | "trigger_config">>) => {
      setWorkflow((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  // Compute stats from runs
  const successfulRuns = runs.filter((r) => r.status === "succeeded").length;
  const totalRuns = runs.length;
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : null;
  const lastRun = runs[0]?.started_at ?? null;

  // Derive steps from current version definition
  const currentVersion = versions[0];
  const definition = currentVersion?.definition as {
    steps?: Array<{ id: string; name: string; tool: string; description?: string }>;
  } | undefined;
  const steps = definition?.steps ?? [];

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}
      data-testid="workflow-detail-view"
    >
      {/* Breadcrumb — ChevronLeft icon matching design */}
      <div style={{ padding: "20px 40px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <Link
          href="/app/workflows"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--text-tertiary)",
            fontSize: 12.5,
            textDecoration: "none",
          }}
          aria-label="Back to My Workflows"
        >
          <Icons.ChevronLeft size={13} aria-hidden />
          My Workflows
        </Link>
      </div>

      {/* Header: inline-editable name/description, LevelToggle, actions */}
      <WorkflowDetailHeader
        workflow={workflow}
        onWorkflowUpdate={handleWorkflowUpdate}
        onRunsUpdated={(newRun) => setRuns((prev) => [newRun, ...prev])}
      />

      {/* 5-stat bar */}
      <div
        style={{
          padding: "16px 40px",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 24,
          borderBottom: "0.5px solid var(--border)",
        }}
        role="region"
        aria-label="Workflow statistics"
      >
        <StatBlock
          label="Automation"
          value={
            <LevelToggle
              value={workflow.automation_level as Level}
              size="sm"
            />
          }
        />
        <StatBlock label="Trigger" value={workflow.trigger_type} mono />
        <StatBlock label="Last run" value={formatRelativeTime(lastRun)} mono />
        <StatBlock label="Total runs" value={totalRuns.toString()} mono />
        <StatBlock
          label="Success rate"
          value={
            successRate !== null
              ? `${successRate}% · ${totalRuns} runs`
              : "no runs yet"
          }
          mono
        />
      </div>

      {/* Main body: diagram + side panels */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 0,
          overflow: "hidden",
        }}
      >
        {/* Left: workflow definition diagram */}
        <div style={{ padding: "32px 40px 60px", overflow: "auto" }}>
          <SectionHeader
            right={
              <Link
                href={`/app/chat?workflow=${workflow.id}`}
                style={{ textDecoration: "none" }}
                tabIndex={0}
              >
                {/* Render as a ghost-style button using design token inline styles */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 28,
                    padding: "0 10px",
                    fontSize: 12.5,
                    borderRadius: "var(--r-sm)",
                    color: "var(--text-secondary)",
                    background: "transparent",
                    border: "0.5px solid transparent",
                    fontFamily: "inherit",
                    fontWeight: 500,
                    letterSpacing: "-0.005em",
                    cursor: "pointer",
                    transition: "background 0.12s, color 0.12s",
                  }}
                >
                  <Icons.Chat size={13} aria-hidden />
                  Edit in chat
                </span>
              </Link>
            }
          >
            Definition
          </SectionHeader>
          <Card padding={24}>
            <WorkflowDiagram steps={steps} workflowName={workflow.name} />
          </Card>
        </div>

        {/* Right: historical runs + version history */}
        <div
          style={{
            borderLeft: "0.5px solid var(--border)",
            background: "var(--bg-subtle)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Historical runs panel (Realtime) */}
          <div style={{ flex: 1, padding: "32px 28px 0", overflow: "auto" }}>
            <HistoricalRunsPanel
              workflowId={workflow.id}
              initialRuns={runs}
              onRunsUpdated={setRuns}
            />
          </div>

          {/* Version history panel */}
          <div style={{ padding: "0 28px 32px" }}>
            <VersionHistoryPanel
              workflowId={workflow.id}
              versions={versions}
              currentVersionId={workflow.current_version_id}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
