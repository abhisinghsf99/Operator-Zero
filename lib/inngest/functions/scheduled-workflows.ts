/**
 * lib/inngest/functions/scheduled-workflows.ts
 * Cron: fire due scheduled workflows (WS9).
 *
 * Workflows created with trigger_type='schedule' carry a trigger_config.cron
 * expression (and optional .tz) — the schedule-picker UI writes this column,
 * but nothing consumed it before this function existed. "Run now" was the
 * only way a schedule-triggered workflow ever actually ran. This tick scans
 * active schedule-triggered workflows every 15 minutes and sends
 * workflow.run_requested for any that are due per lib/workflows/cron.ts.
 *
 * SANDBOX / DEMO EXCLUSION: auto-firing on the shared demo account or on a
 * per-visitor sandbox would pile up runs across every 15-minute tick and
 * corrupt the carefully-constructed demo dataset — the shared demo account is
 * watched by real visitors, and sandboxes are ephemeral (torn down
 * independently by sandbox-sweep.ts). Both are excluded from the schedule
 * tick; "Run now" still works for them from the UI.
 *
 * SECURITY: serviceDb bypasses RLS — every query filters by user_id/workflow
 * ownership explicitly (T-2-07-04 pattern, same as execute-workflow-run.ts).
 */
import { inngest } from "@/lib/inngest/client";
import { serviceDb } from "@/lib/db/client";
import { workflows, workflowRuns, integrations } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { isCronDue } from "@/lib/workflows/cron";
import { SANDBOX_SENTINEL_TOKEN } from "@/lib/demo/constants";
import { isDemoUser } from "@/lib/auth/demo";

interface DueWorkflow {
  userId: string;
  workflowId: string;
}

export const scheduledWorkflowsTick = inngest.createFunction(
  {
    id: "scheduled-workflows-tick",
    triggers: [{ cron: "*/15 * * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    // Single checkpointed step: load candidates, exclude sandbox/demo owners,
    // and evaluate isCronDue per workflow against its own most recent
    // schedule-triggered run.
    const dueWorkflows: DueWorkflow[] = await step.run("load-due-workflows", async () => {
      const rows = await serviceDb
        .select({
          id: workflows.id,
          user_id: workflows.user_id,
          trigger_config: workflows.trigger_config,
        })
        .from(workflows)
        .where(and(eq(workflows.status, "active"), eq(workflows.trigger_type, "schedule")));

      if (rows.length === 0) return [];

      // Exclude sandbox (sentinel Shopify token) and demo (isDemoUser) owners
      // — see module docblock for rationale.
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const shopifyIntegrations = userIds.length
        ? await serviceDb
            .select({ user_id: integrations.user_id, tok: integrations.access_token_encrypted })
            .from(integrations)
            .where(
              and(inArray(integrations.user_id, userIds), eq(integrations.provider, "shopify"))
            )
        : [];

      const sandboxUserIds = new Set(
        shopifyIntegrations
          .filter((i) => i.tok === SANDBOX_SENTINEL_TOKEN)
          .map((i) => i.user_id)
      );

      const survivingRows = rows.filter(
        (r) => !sandboxUserIds.has(r.user_id) && !isDemoUser(r.user_id)
      );

      const now = new Date();
      const due: DueWorkflow[] = [];

      for (const row of survivingRows) {
        const config = (row.trigger_config ?? {}) as { cron?: string; tz?: string };
        if (!config.cron) continue;

        const [lastRun] = await serviceDb
          .select({ started_at: workflowRuns.started_at })
          .from(workflowRuns)
          .where(
            and(
              eq(workflowRuns.workflow_id, row.id),
              eq(workflowRuns.user_id, row.user_id),
              eq(workflowRuns.trigger_source, "schedule")
            )
          )
          .orderBy(desc(workflowRuns.started_at))
          .limit(1);

        if (isCronDue(config.cron, config.tz ?? null, now, lastRun?.started_at ?? null)) {
          due.push({ userId: row.user_id, workflowId: row.id });
        }
      }

      return due;
    });

    const sentCount: number = await step.run("send-run-requests", async () => {
      for (const { userId, workflowId } of dueWorkflows) {
        await inngest.send({
          name: "workflow.run_requested",
          data: { userId, workflowId, triggerSource: "schedule" },
        });
      }
      return dueWorkflows.length;
    });

    return { due: dueWorkflows.length, sent: sentCount };
  }
);
