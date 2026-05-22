/**
 * app/app/workflows/page.tsx
 * My Workflows RSC — parallel fetch of workflows + strip stats, grouping,
 * onboarding gate. Default landing surface (D-16, WF-07).
 *
 * ARCHITECTURE:
 *   RSC mirrors settings/page.tsx: onboarding gate, Promise.all parallel fetch,
 *   passes data to client view shell (_workflows-view.tsx).
 *
 * SECURITY:
 *   - getOrCreateProfile() verifies the session (RLS enforced)
 *   - All DB access via withUserRls (multi-tenant, user_id filtered)
 *   - Strip stats read via authenticated serviceDb or RLS-scoped helpers
 *
 * D-15: Time-saved uses a per-action-type heuristic — labeled "estimated".
 * D-16: This is the default landing surface.
 * D-17: Search is client-side (small portfolio, no server search needed).
 */

import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { withUserRls } from "@/lib/db/client";
import { createClient } from "@/lib/auth/server";
import { workflows, activityEntries, approvals } from "@/lib/db/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { groupWorkflowsByStatus, type WorkflowSummary } from "@/lib/workflows/grouping";
import { WorkflowsView } from "./_workflows-view";

// ─── Time-saved constants (D-15: labeled heuristic, not hard claims) ─────────

/**
 * Minutes-per-action-type heuristic for "Time saved this week" strip stat.
 * These are intentionally conservative estimates. Always shown with "estimated" label.
 * Source: DATA-FLOW.md §4.1 action_type catalog — best-guess time-to-do-manually.
 */
const TIME_SAVED_MINUTES: Record<string, number> = {
  update_product: 4,
  update_meta_title: 3,
  update_meta_desc: 3,
  update_image_alt: 2,
  update_page_content: 5,
  update_price: 2,
  update_inventory: 2,
  update_status: 1,
  create_redirect: 3,
  send_email_draft: 6,
  send_email_reply: 5,
  // Default for unknown action types
  _default: 3,
};

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface StripStats {
  /** Pending approvals count (live, D-15) */
  pendingApprovalsCount: number;
  /** L3 actions in last 12 hours (live, D-15) */
  l3Last12hCount: number;
  /** Time saved estimate in minutes (D-15: labeled heuristic) */
  timeSavedMinutes: number;
  /** Recent activity entries for ticker (up to 5) */
  recentActivity: RecentActivityEntry[];
}

export interface RecentActivityEntry {
  id: string;
  occurred_at: Date;
  action_type: string;
  summary: string;
  result: string;
  automation_level: string | null;
  workflow_id: string | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkflowsPage() {
  // 1. Validate session + onboarding gate (mirrors settings/page.tsx)
  const profile = await getOrCreateProfile();
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const userId = profile.user_id;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) {
    redirect("/login");
  }

  // 2. Parallel fetch: workflows, pending approvals count, L3 last-12h count, time-saved, ticker
  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [allWorkflows, pendingApprovalsRows, l3ActionRows, timeSavedRows, tickerRows] =
    await Promise.all([
      // All workflows for this user
      withUserRls(claims as Record<string, unknown>, async (tx) => {
        return tx
          .select({
            id: workflows.id,
            name: workflows.name,
            status: workflows.status,
            trigger_type: workflows.trigger_type,
            automation_level: workflows.automation_level,
            user_id: workflows.user_id,
            description: workflows.description,
            created_at: workflows.created_at,
            updated_at: workflows.updated_at,
            source: workflows.source,
            current_version_id: workflows.current_version_id,
          })
          .from(workflows)
          .where(eq(workflows.user_id, userId));
      }),

      // Pending approvals count (D-15: "Decisions outstanding")
      withUserRls(claims as Record<string, unknown>, async (tx) => {
        return tx
          .select({ c: count() })
          .from(approvals)
          .where(and(eq(approvals.user_id, userId), eq(approvals.status, "pending")));
      }),

      // L3 actions last 12h (D-15: "Ran while you slept")
      withUserRls(claims as Record<string, unknown>, async (tx) => {
        return tx
          .select({ c: count() })
          .from(activityEntries)
          .where(
            and(
              eq(activityEntries.user_id, userId),
              eq(activityEntries.automation_level, "L3"),
              gte(activityEntries.occurred_at, twelveHoursAgo)
            )
          );
      }),

      // 7-day activity for time-saved heuristic (D-15: "Time saved this week" — estimated)
      withUserRls(claims as Record<string, unknown>, async (tx) => {
        return tx
          .select({
            action_type: activityEntries.action_type,
          })
          .from(activityEntries)
          .where(
            and(
              eq(activityEntries.user_id, userId),
              gte(activityEntries.occurred_at, sevenDaysAgo)
            )
          );
      }),

      // Recent activity ticker (last 5 entries for "what just happened")
      withUserRls(claims as Record<string, unknown>, async (tx) => {
        return tx
          .select({
            id: activityEntries.id,
            occurred_at: activityEntries.occurred_at,
            action_type: activityEntries.action_type,
            summary: activityEntries.action_summary,
            result: activityEntries.result,
            automation_level: activityEntries.automation_level,
            workflow_id: activityEntries.workflow_id,
          })
          .from(activityEntries)
          .where(eq(activityEntries.user_id, userId))
          .orderBy(activityEntries.occurred_at)
          .limit(5);
      }),
    ]);

  // 3. Compute time-saved heuristic (D-15: transparent estimate labeled "estimated")
  const timeSavedMinutes = timeSavedRows.reduce((total, row) => {
    const mins = TIME_SAVED_MINUTES[row.action_type] ?? TIME_SAVED_MINUTES["_default"] ?? 3;
    return total + mins;
  }, 0);

  // 4. Group workflows by status (WF-07, groupWorkflowsByStatus from plan 01)
  const workflowList = allWorkflows as WorkflowSummary[];
  const grouped = groupWorkflowsByStatus(workflowList);

  const stripStats: StripStats = {
    pendingApprovalsCount: pendingApprovalsRows[0]?.c ?? 0,
    l3Last12hCount: l3ActionRows[0]?.c ?? 0,
    timeSavedMinutes,
    recentActivity: tickerRows as RecentActivityEntry[],
  };

  const totalActive =
    grouped.scheduled.length + grouped.triggered.length + grouped.manual.length;
  const totalWorkflows = workflowList.length;

  return (
    <div
      className="h-full overflow-y-auto bg-[var(--bg)]"
      data-testid="workflows-page"
    >
      <WorkflowsView
        workflows={workflowList}
        grouped={grouped}
        stripStats={stripStats}
        totalActive={totalActive}
        totalWorkflows={totalWorkflows}
        userId={userId}
      />
    </div>
  );
}
