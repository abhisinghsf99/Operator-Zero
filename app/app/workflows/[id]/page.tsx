/**
 * app/app/workflows/[id]/page.tsx
 * Workflow Detail RSC — single workflow inspection.
 *
 * NEXT.JS 15: params is a Promise — must be awaited (mirror chat/[threadId]/page.tsx).
 * SECURITY:
 *   - getOrCreateProfile() verifies session + onboarding gate
 *   - withUserRls enforces ownership on all DB access
 *   - 404/redirect if workflow not owned by user
 *
 * Fetches in parallel:
 *   1. Workflow row (+ 404 if not found / not owned)
 *   2. Last 10 workflow versions (desc by version_number)
 *   3. Recent 20 workflow runs (desc by started_at)
 *
 * D-03: each inline edit increments version via editWorkflow → createWorkflowVersion
 * D-04: version history panel with Restore (forward-only)
 * D-05: Run Now confirm dialog for write/L3; instant for read-only/manual
 * D-06: Open in Chat opens a scoped thread with context_workflow_id
 */

import { notFound, redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { withUserRls } from "@/lib/db/client";
import { createClient } from "@/lib/auth/server";
import { workflows, workflowVersions, workflowRuns } from "@/lib/db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { WorkflowDetailView } from "./_workflow-detail-view";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowDetailData {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  automation_level: string;
  status: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowVersionData {
  id: string;
  workflow_id: string;
  version_number: number;
  definition: Record<string, unknown>;
  schema_version: number;
  created_at: Date;
}

export interface WorkflowRunData {
  id: string;
  workflow_id: string;
  workflow_version_id: string;
  trigger_source: string;
  status: string;
  current_step_id: string | null;
  error_summary: string | null;
  started_at: Date;
  completed_at: Date | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface WorkflowDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowDetailPage({ params }: WorkflowDetailPageProps) {
  // 1. Gate on onboarding — redirect if not completed
  const profile = await getOrCreateProfile();
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const userId = profile.user_id;

  // 2. Await params (Next.js 15)
  const { id: workflowId } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) {
    redirect("/login");
  }

  // 3. Parallel fetch: workflow + versions + runs
  const [workflowRows, versionRows, runRows] = await Promise.all([
    // Fetch the workflow row — verifies ownership via RLS + explicit user_id filter
    withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .select({
          id: workflows.id,
          user_id: workflows.user_id,
          name: workflows.name,
          description: workflows.description,
          automation_level: workflows.automation_level,
          status: workflows.status,
          trigger_type: workflows.trigger_type,
          trigger_config: workflows.trigger_config,
          current_version_id: workflows.current_version_id,
          created_at: workflows.created_at,
          updated_at: workflows.updated_at,
        })
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)))
        .limit(1);
    }),

    // Last 10 versions for version history panel (D-04)
    withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .select({
          id: workflowVersions.id,
          workflow_id: workflowVersions.workflow_id,
          version_number: workflowVersions.version_number,
          definition: workflowVersions.definition,
          schema_version: workflowVersions.schema_version,
          created_at: workflowVersions.created_at,
        })
        .from(workflowVersions)
        .where(eq(workflowVersions.workflow_id, workflowId))
        .orderBy(desc(workflowVersions.version_number))
        .limit(10);
    }),

    // Recent 20 runs for historical-runs panel (WF-13/D-05)
    withUserRls(claims as Record<string, unknown>, async (tx) => {
      return tx
        .select({
          id: workflowRuns.id,
          workflow_id: workflowRuns.workflow_id,
          workflow_version_id: workflowRuns.workflow_version_id,
          trigger_source: workflowRuns.trigger_source,
          status: workflowRuns.status,
          current_step_id: workflowRuns.current_step_id,
          error_summary: workflowRuns.error_summary,
          started_at: workflowRuns.started_at,
          completed_at: workflowRuns.completed_at,
        })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.workflow_id, workflowId), eq(workflowRuns.user_id, userId)))
        .orderBy(desc(workflowRuns.started_at))
        .limit(20);
    }),
  ]);

  // 4. 404 if workflow not found or not owned by user
  const workflow = workflowRows[0];
  if (!workflow) {
    notFound();
  }

  return (
    <WorkflowDetailView
      workflow={workflow as WorkflowDetailData}
      versions={versionRows as WorkflowVersionData[]}
      runs={runRows as WorkflowRunData[]}
    />
  );
}
