"use client";

/**
 * app/app/workflows/_workflows-view.tsx
 * My Workflows client shell — receives RSC-fetched data and renders the full
 * landing surface: SurfaceHeader, RecentActivityStrip, WorkflowSearch,
 * WorkflowGroup sections (Scheduled / Triggered / Manual / Paused / Drafts),
 * and the empty state.
 *
 * ARCHITECTURE:
 *   - "use client" island — receives server data via props
 *   - Search state (query) lifted here; filters down to WorkflowGroup
 *   - "+ New Workflow" navigates to /app/chat (new blank Conversation, WF-10)
 *
 * D-17: Client-side fuzzy filter over name/description/trigger_type.
 * WF-07: Grouped by status; strip shows 3 real stats + ticker.
 * WF-10: "+ New Workflow" → Conversation thread with no context_workflow_id.
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { type GroupedWorkflows, type WorkflowSummary } from "@/lib/workflows/grouping";
import { type StripStats } from "./page";
import { RecentActivityStrip } from "@/components/workflows/recent-activity-strip";
import { WorkflowGroup } from "@/components/workflows/workflow-group";
import { WorkflowSearch } from "@/components/workflows/workflow-search";
import { SurfaceHeader, Button } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface WorkflowsViewProps {
  workflows: WorkflowSummary[];
  grouped: GroupedWorkflows;
  stripStats: StripStats;
  totalActive: number;
  totalWorkflows: number;
  userId: string;
}

// ─── WorkflowsView ────────────────────────────────────────────────────────────

export function WorkflowsView({
  workflows,
  grouped,
  stripStats,
  totalActive,
  totalWorkflows,
  userId,
}: WorkflowsViewProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  // D-17: Client-side fuzzy filter over name/description/trigger_type
  const filterWorkflows = (list: WorkflowSummary[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (typeof w.description === "string" &&
          w.description.toLowerCase().includes(q)) ||
        w.trigger_type.toLowerCase().includes(q)
    );
  };

  // Apply search filter to each group
  const filteredGrouped = useMemo(
    () => ({
      scheduled: filterWorkflows(grouped.scheduled),
      triggered: filterWorkflows(grouped.triggered),
      manual: filterWorkflows(grouped.manual),
      paused: filterWorkflows(grouped.paused),
      drafts: filterWorkflows(grouped.drafts),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grouped, searchQuery]
  );

  const hasAnyFiltered =
    filteredGrouped.scheduled.length > 0 ||
    filteredGrouped.triggered.length > 0 ||
    filteredGrouped.manual.length > 0 ||
    filteredGrouped.paused.length > 0 ||
    filteredGrouped.drafts.length > 0;

  // WF-10: "+ New Workflow" → blank Conversation thread (no context_workflow_id)
  const handleNewWorkflow = () => {
    router.push("/app/chat");
  };

  // Empty portfolio state (no workflows at all)
  if (totalWorkflows === 0) {
    return <WorkflowsEmptyState onNewWorkflow={handleNewWorkflow} />;
  }

  return (
    <div className="flex flex-col">
      {/* Surface header — SurfaceHeader primitive, design: surface-workflows.jsx */}
      <SurfaceHeader
        kicker={`My Workflows · ${totalActive} active`}
        title="Your workshop, today."
        subtitle="A portfolio of operations your agent runs for you. Built one at a time, in conversation."
        accent="workflow"
        right={
          <>
            {/* Find a workflow: ghost button wrapping the search input (D-17) */}
            <WorkflowSearch
              query={searchQuery}
              onQueryChange={setSearchQuery}
            />
            {/* + New Workflow: WF-10 — navigates to blank Conversation */}
            <Button
              variant="primary"
              accent="workflow"
              icon="Plus"
              onClick={handleNewWorkflow}
              aria-label="Create a new workflow in Conversation"
            >
              New workflow
            </Button>
          </>
        }
      />

      {/* Recent activity strip — live counts via Realtime (D-15) */}
      <div className="mx-4 md:mx-10 mt-5">
        <RecentActivityStrip stats={stripStats} userId={userId} />
      </div>

      {/* Workflow groups (D-17: searchQuery filters each group client-side) */}
      {searchQuery.trim() && !hasAnyFiltered ? (
        /* Search: no results */
        <div
          className="px-4 md:px-10"
          style={{
            paddingTop: 60,
            paddingBottom: 60,
            textAlign: "center",
            color: "var(--text-tertiary)",
            fontSize: 14,
          }}
        >
          No workflows match &ldquo;{searchQuery}&rdquo;
        </div>
      ) : (
        <div
          className="px-4 md:px-10"
          style={{
            paddingTop: 32,
            paddingBottom: 60,
            display: "flex",
            flexDirection: "column",
            gap: 36,
          }}
        >
          {filteredGrouped.scheduled.length > 0 && (
            <WorkflowGroup
              title="Active — scheduled"
              workflows={filteredGrouped.scheduled}
            />
          )}
          {filteredGrouped.triggered.length > 0 && (
            <WorkflowGroup
              title="Active — triggered"
              workflows={filteredGrouped.triggered}
            />
          )}
          {filteredGrouped.manual.length > 0 && (
            <WorkflowGroup
              title="Active — manual"
              workflows={filteredGrouped.manual}
            />
          )}
          {filteredGrouped.paused.length > 0 && (
            <WorkflowGroup
              title="Paused"
              workflows={filteredGrouped.paused}
              muted
            />
          )}
          {filteredGrouped.drafts.length > 0 && (
            <WorkflowGroup
              title="Drafts"
              workflows={filteredGrouped.drafts}
              muted
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── WorkflowsEmptyState ──────────────────────────────────────────────────────

function WorkflowsEmptyState({ onNewWorkflow }: { onNewWorkflow: () => void }) {
  return (
    <div className="flex flex-col">
      {/* Empty-state header — SurfaceHeader primitive */}
      <SurfaceHeader
        kicker="My Workflows"
        title="A blank workshop."
        subtitle="No workflows yet. Build your first by talking to the Orchestrator — describe what you'd like the agent to handle, and watch it take shape."
        accent="workflow"
      />

      <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            maxWidth: 520,
            background: "var(--bg-elevated)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: 32,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            textAlign: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--acc-workflow-bg)",
              color: "var(--acc-workflow-ink)",
              display: "grid",
              placeItems: "center",
            }}
            aria-hidden="true"
          >
            <Icons.Workflows size={28} />
          </div>
          <div
            className="display"
            style={{ fontSize: 26, color: "var(--text)" }}
          >
            You haven&apos;t built any workflows yet.
          </div>
          <p
            style={{
              color: "var(--text-tertiary)",
              lineHeight: 1.55,
              margin: 0,
              fontSize: 14,
            }}
          >
            Talk to the Orchestrator. Tell it what part of running the store
            you&apos;d like off your plate. It will sketch a workflow with you
            in real time.
          </p>
          <Button
            variant="primary"
            accent="workflow"
            size="lg"
            icon="Chat"
            onClick={onNewWorkflow}
            aria-label="Talk to the Orchestrator to build your first workflow"
          >
            Talk to the Orchestrator
          </Button>

          <div
            style={{
              marginTop: 12,
              padding: "16px 20px",
              background: "var(--bg-subtle)",
              borderRadius: "var(--r-md)",
              width: "100%",
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Try one of these
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "Audit my catalog for missing meta titles",
                "Handle customer order-status emails",
                "Watch inventory for low-stock bestsellers",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={onNewWorkflow}
                  style={{
                    all: "unset" as "unset",
                    cursor: "pointer",
                    padding: "8px 12px",
                    color: "var(--text-secondary)",
                    background: "var(--bg-elevated)",
                    border: "0.5px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    fontStyle: "italic",
                    fontFamily: "var(--font-serif)",
                    fontSize: 15,
                  }}
                >
                  &ldquo;{suggestion}&rdquo;
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
