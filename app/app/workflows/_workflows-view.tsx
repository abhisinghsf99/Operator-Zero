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
      {/* Surface header — design file: SurfaceHeader with kicker, title, subtitle, right actions */}
      <header
        className="border-b-[0.5px] border-[var(--border)] bg-[var(--bg)]"
        style={{ padding: "32px 40px 22px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            {/* Kicker: accent dot + label */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--acc-workflow-ink)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11.5,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--acc-workflow-ink)",
                  fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                }}
              >
                My Workflows &middot; {totalActive} active
              </span>
            </div>
            <h1
              className="display"
              style={{
                fontSize: 38,
                margin: 0,
                color: "var(--text)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              Your workshop, today.
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 14,
                color: "var(--text-tertiary)",
                maxWidth: 640,
                lineHeight: 1.45,
              }}
            >
              A portfolio of operations your agent runs for you. Built one at a
              time, in conversation.
            </p>
          </div>

          {/* Header actions: search + new workflow */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <WorkflowSearch
              query={searchQuery}
              onQueryChange={setSearchQuery}
            />
            {/* + New Workflow: WF-10 — navigates to blank Conversation */}
            <button
              type="button"
              onClick={handleNewWorkflow}
              aria-label="Create a new workflow in Conversation"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: 34,
                padding: "0 14px",
                fontSize: 13,
                borderRadius: "var(--r-sm)",
                background: "var(--acc-workflow-ink)",
                color: "var(--bg)",
                border: "0.5px solid transparent",
                fontFamily: "inherit",
                fontWeight: 500,
                letterSpacing: "-0.005em",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
              data-testid="new-workflow-btn"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New workflow
            </button>
          </div>
        </div>
      </header>

      {/* Recent activity strip — live counts via Realtime (D-15) */}
      <div style={{ margin: "20px 40px 0" }}>
        <RecentActivityStrip stats={stripStats} userId={userId} />
      </div>

      {/* Workflow groups (D-17: searchQuery filters each group client-side) */}
      {searchQuery.trim() && !hasAnyFiltered ? (
        /* Search: no results */
        <div
          style={{
            padding: "60px 40px",
            textAlign: "center",
            color: "var(--text-tertiary)",
            fontSize: 14,
          }}
        >
          No workflows match &ldquo;{searchQuery}&rdquo;
        </div>
      ) : (
        <div
          style={{
            padding: "32px 40px 60px",
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
      <header
        className="border-b-[0.5px] border-[var(--border)] bg-[var(--bg)]"
        style={{ padding: "32px 40px 22px" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--acc-workflow-ink)",
              }}
            />
            <span
              style={{
                fontSize: 11.5,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--acc-workflow-ink)",
                fontWeight: 500,
                fontFamily: "var(--font-mono)",
              }}
            >
              My Workflows
            </span>
          </div>
          <h1
            className="display"
            style={{
              fontSize: 38,
              margin: 0,
              color: "var(--text)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            A blank workshop.
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 14,
              color: "var(--text-tertiary)",
              maxWidth: 640,
              lineHeight: 1.45,
            }}
          >
            No workflows yet. Build your first by talking to the Orchestrator —
            describe what you&apos;d like the agent to handle, and watch it take
            shape.
          </p>
        </div>
      </header>

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
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
            </svg>
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
          <button
            type="button"
            onClick={onNewWorkflow}
            aria-label="Talk to the Orchestrator to build your first workflow"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 40,
              padding: "0 18px",
              fontSize: 14,
              borderRadius: "var(--r-md)",
              background: "var(--acc-workflow-ink)",
              color: "var(--bg)",
              border: "0.5px solid transparent",
              fontFamily: "inherit",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Talk to the Orchestrator
          </button>

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
