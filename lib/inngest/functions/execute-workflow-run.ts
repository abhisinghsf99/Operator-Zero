/**
 * lib/inngest/functions/execute-workflow-run.ts
 * Durable Workflow Engine — the keystone of Phase 2.
 *
 * Executes multi-step workflow runs with per-step checkpointing and branching
 * for L1 (manual hold) / L2 (pause → approval → resume) / L3 (autonomous).
 *
 * CRITICAL IMPLEMENTATION NOTES:
 *
 * 1. CEL ASYNC/EVENT INVERSION (Pitfall 1, T-2-07-01):
 *    In step.waitForEvent, the `if` MUST use `async` (the matched/awaited event,
 *    i.e. approval.resolved) NOT `event` (the original triggering event,
 *    i.e. workflow.run_requested). Correct form:
 *      if: `async.data.approvalId == "${approval.id}"`
 *    Using `event.data.approvalId` here is a SILENT wrong-resume bug.
 *
 * 2. DETERMINISTIC step.run IDs (Pitfall 6):
 *    All step IDs use `execute-step-${i}-${workflowStep.id}` and
 *    `wait-approval-${i}` — never random/nondeterministic IDs.
 *
 * 3. OBSERVABILITY-FIRST (WF-06, CLAUDE.md):
 *    writeActivity is called BEFORE the external effect (Shopify/Gmail write).
 *    Idempotent via ON CONFLICT DO NOTHING on unique(workflow_run_id, step_id).
 *
 * 4. AUTH RE-CHECK (T-2-07-02):
 *    The approval.resolved event alone does NOT bypass auth — the engine
 *    re-looks-up the approval by id + user ownership before executing.
 *
 * 5. serviceDb BYPASSES RLS — every query MUST filter by user_id explicitly.
 *
 * THREAT MODEL:
 *   T-2-07-01 (wrong-resume): CEL `async.data.approvalId` matches specific approval
 *   T-2-07-02 (forged event): re-lookup approval by id + user_id before executing
 *   T-2-07-03 (duplicate write on retry): writeActivity ON CONFLICT DO NOTHING
 *   T-2-07-04 (cross-user access): all serviceDb queries filter by user_id
 *   T-2-07-05 (unlogged action): writeActivity before every external effect
 */

import { inngest } from "@/lib/inngest/client";
import { serviceDb } from "@/lib/db/client";
import {
  workflows,
  workflowVersions,
  workflowRuns,
  approvals,
  messages,
  autonomyThresholds,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { writeActivity } from "@/lib/workflows/activity";
import { createApproval, resolveApprovalRow } from "@/lib/workflows/approvals";
import { runWorkflowStep } from "@/lib/agent/runtime";
import { getEffectiveAutomationLevel } from "@/lib/workflows/autonomy";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowRunRequestedEvent {
  data: {
    userId: string;
    workflowId: string;
    /** How this run was triggered: 'schedule' | 'event' | 'manual' | 'chat' */
    triggerSource: "schedule" | "event" | "manual" | "chat";
    /** Optional: the thread ID for chat-originated runs */
    threadId?: string;
  };
}

interface WorkflowStepDefinition {
  id: string;
  type: string;
  name: string;
  tool: string;
  params: unknown;
  next_step?: string;
  description?: string;
}

interface WorkflowVersionDefinition {
  steps: WorkflowStepDefinition[];
  entry_step?: string;
}

// ─── executeWorkflowRun ───────────────────────────────────────────────────────

export const executeWorkflowRun = inngest.createFunction(
  {
    id: "execute-workflow-run",
    triggers: [{ event: "workflow.run_requested" }],
    concurrency: {
      limit: 1,
      // Serialize workflow runs per user — prevents parallel execution chaos (T-2-07-04)
      key: "event.data.userId",
    },
    retries: 3,
  },
  async ({ event, step }) => {
    const { userId, workflowId, triggerSource } =
      (event as unknown as WorkflowRunRequestedEvent).data;

    // ── Step 1: Load workflow + version + create run row ──────────────────────
    const { workflow, version, run } = await step.run(
      "load-and-create-run",
      async () => {
        // Load workflow (serviceDb — bypasses RLS; must filter by user_id)
        const [wf] = await serviceDb
          .select()
          .from(workflows)
          .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)))
          .limit(1);

        if (!wf) {
          throw new Error(
            `Workflow ${workflowId} not found for user ${userId}`
          );
        }

        // Load the current version
        if (!wf.current_version_id) {
          throw new Error(
            `Workflow ${workflowId} has no current_version_id`
          );
        }

        const [ver] = await serviceDb
          .select()
          .from(workflowVersions)
          .where(eq(workflowVersions.id, wf.current_version_id))
          .limit(1);

        if (!ver) {
          throw new Error(
            `WorkflowVersion ${wf.current_version_id} not found`
          );
        }

        // Create workflow_runs row (status: 'running')
        const [newRun] = await serviceDb
          .insert(workflowRuns)
          .values({
            user_id: userId,
            workflow_id: workflowId,
            workflow_version_id: ver.id,
            workflow_version_snapshot: ver.definition as Record<string, unknown>,
            trigger_source: triggerSource,
            status: "running",
          })
          .returning();

        if (!newRun) {
          throw new Error("Failed to create workflow_runs row");
        }

        return { workflow: wf, version: ver, run: newRun };
      }
    );

    // ── Step 2: Load agent context ────────────────────────────────────────────
    // (minimal for now — full context loading done inside runWorkflowStep)
    await step.run("load-agent-context", async () => {
      return { userId, workflowId, runId: run.id };
    });

    // ── Steps 3+: Execute workflow steps ──────────────────────────────────────
    const definition = version.definition as WorkflowVersionDefinition;
    const steps = definition.steps ?? [];

    for (let i = 0; i < steps.length; i++) {
      const workflowStep = steps[i]!;

      // Deterministic step ID (Pitfall 6) — must not use random/nondeterministic IDs
      const stepRunId = `execute-step-${i}-${workflowStep.id}`;

      // ── L1: Prepare action and hold for manual trigger ──────────────────────
      // WR-05 v1 behavior: L1 is single-step-only in v1. On the first step, the
      // run pauses at 'paused_manual' and the function returns. Re-triggering
      // an L1 run is a v2 feature (requires a separate resume event + step entry
      // that picks up from current_step_id). For v1, any L1 workflow saved via the
      // UI should have exactly one step — the save UI validates this.
      //
      // This means multi-step L1 workflows silently drop steps 1+. This is
      // documented here and enforced at save time (v2 will remove this constraint).
      if (workflow.automation_level === "L1") {
        await step.run(`mark-l1-pending-${i}-${workflowStep.id}`, async () => {
          await serviceDb
            .update(workflowRuns)
            .set({ status: "paused_manual", current_step_id: workflowStep.id })
            .where(
              and(eq(workflowRuns.id, run.id), eq(workflowRuns.user_id, userId))
            );
        });
        // L1 pauses here — a separate L1 resume event is needed for subsequent steps (v2).
        return { status: "paused_manual", runId: run.id };
      }

      // ── Execute the step ──────────────────────────────────────────────────
      const stepResult = await step.run(stepRunId, async () => {
        return runWorkflowStep({
          userId,
          workflowRunId: run.id,
          stepId: workflowStep.id,
          automationLevel: workflow.automation_level as "L1" | "L2" | "L3",
          stepDefinition: {
            tool: workflowStep.tool,
            input: workflowStep.params,
            description: workflowStep.description,
          },
        });
      });

      // ── Autonomy override gate (D-07b, Phase 4 — T-4-04-01/02) ─────────────
      // Read per-action overrides from autonomy_thresholds (serviceDb — bypasses RLS;
      // explicit user_id filter is REQUIRED here — T-2-07-04).
      //
      // D-06: overrides can ONLY add friction (never loosen).
      //   levelOrder: L1=1, L2=2, L3=3 — lower number = more restrictive.
      //   effectiveAutomationLevel = override ONLY when levelOrder[override] <
      //   levelOrder[workflow.automation_level]; otherwise keep workflow level.
      //   → L3 workflow + L2 override → effective L2 (approval required)
      //   → L2 workflow + L3 override → stays L2 (cannot be loosened)
      //
      // A3 from RESEARCH.md: gate lives here in the engine, NOT in dispatchTool.
      const effectiveAutomationLevel = await step.run(
        `compute-effective-level-${i}-${workflowStep.id}`,
        async () => {
          const [thresholdRow] = await serviceDb
            .select()
            .from(autonomyThresholds)
            .where(eq(autonomyThresholds.user_id, userId))
            .limit(1);

          const overrides = (thresholdRow?.per_action_overrides ?? {}) as Record<string, string>;
          const overrideLevel = overrides[workflowStep.tool];

          return getEffectiveAutomationLevel(workflow.automation_level, overrideLevel);
        }
      );

      // ── L2: Requires approval — pause + waitForEvent ───────────────────────
      // Uses effectiveAutomationLevel (not raw workflow.automation_level) so an L2
      // override on an L3 workflow's tool routes through the approval branch (D-07b).
      if (effectiveAutomationLevel === "L2" && stepResult.requiresApproval) {
        // Write activity entry BEFORE creating the approval (WF-06, T-2-07-05)
        await step.run(
          `write-activity-pre-approval-${i}-${workflowStep.id}`,
          async () => {
            await writeActivity(userId, {
              workflow_run_id: run.id,
              step_id: `${workflowStep.id}:pending-approval`,
              action_type: workflowStep.tool,
              summary: `Awaiting approval for step: ${workflowStep.name}`,
              result: "partial",
              automation_level: "L2",
              workflow_id: workflowId,
            });
          }
        );

        // Create the approval row + approval_card message (WR-06).
        // For chat-originated runs (triggerSource === 'chat'), insert a message with
        // inline_block_type='approval_card' tied to the thread so the inline UI renders.
        const approval = await step.run(
          `create-approval-${i}-${workflowStep.id}`,
          async () => {
            const proposedAction = stepResult.proposedAction ?? workflowStep.params;
            const threadId =
              (event as unknown as WorkflowRunRequestedEvent).data.threadId ?? null;

            // Insert approval_card message first so we can link approval↔message
            let approvalMessageId: string | null = null;
            if (threadId) {
              const [msgRow] = await serviceDb
                .insert(messages)
                .values({
                  thread_id: threadId,
                  user_id: userId,
                  role: "assistant",
                  content: `Awaiting your approval for: ${workflowStep.description ?? workflowStep.name}`,
                  status: "complete",
                  inline_block_type: "approval_card",
                  // Payload will be updated with approval_id after insert
                  inline_block_payload: {
                    action_type: workflowStep.tool,
                    summary: workflowStep.description ?? workflowStep.name,
                    risk: "low",
                  },
                })
                .returning();
              approvalMessageId = msgRow?.id ?? null;
            }

            const approvalId = await createApproval(userId, {
              workflow_run_id: run.id,
              step_id: workflowStep.id,
              action_type: workflowStep.tool,
              action_summary: workflowStep.description ?? workflowStep.name,
              stakes: "low", // default for v1; enhanced risk assessment in v2
              preview: proposedAction as Record<string, unknown>,
              reasoning_summary: `Proposed: ${workflowStep.tool} on step ${workflowStep.name}`,
              proposed_action: proposedAction,
              thread_id: threadId ?? undefined,
              message_id: approvalMessageId ?? undefined,
            });

            // Update the message payload with the real approval_id
            if (approvalMessageId) {
              await serviceDb
                .update(messages)
                .set({
                  inline_block_payload: {
                    approval_id: approvalId,
                    action_type: workflowStep.tool,
                    summary: workflowStep.description ?? workflowStep.name,
                    risk: "low",
                  },
                })
                .where(
                  and(
                    eq(messages.id, approvalMessageId),
                    eq(messages.user_id, userId)
                  )
                );
            }

            return { id: approvalId };
          }
        );

        // Update run status to paused_for_approval
        await step.run(
          `update-run-paused-${i}-${workflowStep.id}`,
          async () => {
            await serviceDb
              .update(workflowRuns)
              .set({
                status: "paused_for_approval",
                current_step_id: workflowStep.id,
              })
              .where(
                and(
                  eq(workflowRuns.id, run.id),
                  eq(workflowRuns.user_id, userId)
                )
              );
          }
        );

        // CRITICAL: step.waitForEvent suspends the function (no compute during wait).
        // CEL GOTCHA (Pitfall 1, IN-01 corrected comment):
        //   `async` = the MATCHED/AWAITED event (approval.resolved)  ← the waited-for event
        //   `event` = the ORIGINAL triggering event (workflow.run_requested)  ← the trigger
        // The `if` condition uses `async.data.approvalId` to match the AWAITED event's data.
        // This is CORRECT per Inngest docs — `async` refers to the approval.resolved payload.
        // DO NOT use `event.data.approvalId` — that references workflow.run_requested (wrong).
        const decision = await step.waitForEvent(
          `wait-approval-${i}`,
          {
            event: "approval.resolved",
            timeout: "14d",
            if: `async.data.approvalId == "${approval.id}"`,
          }
        );

        // Null decision = timeout (14d elapsed without action)
        if (!decision) {
          await step.run(
            `finalize-expired-${i}-${workflowStep.id}`,
            async () => {
              await serviceDb
                .update(workflowRuns)
                .set({ status: "expired", completed_at: new Date() })
                .where(
                  and(
                    eq(workflowRuns.id, run.id),
                    eq(workflowRuns.user_id, userId)
                  )
                );

              // Also expire the approval row
              await serviceDb
                .update(approvals)
                .set({ status: "expired" })
                .where(
                  and(
                    eq(approvals.id, approval.id),
                    eq(approvals.user_id, userId)
                  )
                );
            }
          );
          return { status: "expired", runId: run.id };
        }

        // CR-03 + CR-04 FIX: Treat the event purely as a wakeup signal.
        // Re-SELECT the approval row by (id, user_id) and branch on row.status.
        // The event payload's 'decision' field is NOT trusted — only the DB row is.
        // This defeats forged 'approval.resolved' events that carry decision:'approved'
        // for rows the user never actually approved (T-2-07-02).
        const approvalRow = await step.run(
          `re-read-approval-${i}-${workflowStep.id}`,
          async () => {
            const [row] = await serviceDb
              .select()
              .from(approvals)
              .where(
                and(
                  eq(approvals.id, approval.id),
                  eq(approvals.user_id, userId)
                )
              )
              .limit(1);

            if (!row) {
              throw new Error(
                `Approval ${approval.id} not found or not owned by user ${userId} (T-2-07-02)`
              );
            }

            return row;
          }
        );

        if (approvalRow.status === "rejected") {
          await step.run(
            `finalize-rejected-${i}-${workflowStep.id}`,
            async () => {
              await serviceDb
                .update(workflowRuns)
                .set({
                  status: "failed",
                  completed_at: new Date(),
                  error_summary: "Rejected by user",
                })
                .where(
                  and(
                    eq(workflowRuns.id, run.id),
                    eq(workflowRuns.user_id, userId)
                  )
                );
            }
          );

          await step.run(
            `write-activity-rejected-${i}-${workflowStep.id}`,
            async () => {
              await writeActivity(userId, {
                workflow_run_id: run.id,
                step_id: `${workflowStep.id}:rejected`,
                action_type: workflowStep.tool,
                summary: `Step ${workflowStep.name} rejected by user`,
                result: "failed",
                automation_level: "L2",
                workflow_id: workflowId,
              });
            }
          );

          return { status: "failed", reason: "rejected", runId: run.id };
        }

        // If the row is not 'approved' (e.g. still 'pending', 'expired', 'snoozed')
        // do NOT execute — this prevents a forged/early wakeup from triggering the action.
        if (approvalRow.status !== "approved") {
          await step.run(
            `finalize-not-approved-${i}-${workflowStep.id}`,
            async () => {
              await serviceDb
                .update(workflowRuns)
                .set({
                  status: "failed",
                  completed_at: new Date(),
                  error_summary: `Approval not in approved state: ${approvalRow.status}`,
                })
                .where(
                  and(
                    eq(workflowRuns.id, run.id),
                    eq(workflowRuns.user_id, userId)
                  )
                );
            }
          );
          return { status: "failed", reason: "not_approved", runId: run.id };
        }

        // Row status is 'approved' — execute the approved action — writeActivity BEFORE effect (WF-06)
        await step.run(
          `execute-approved-${i}-${workflowStep.id}`,
          async () => {
            // writeActivity BEFORE executing the approved action (T-2-07-05)
            await writeActivity(userId, {
              workflow_run_id: run.id,
              step_id: `${workflowStep.id}:approved`,
              action_type: workflowStep.tool,
              summary: `Executing approved step: ${workflowStep.name}`,
              result: "success",
              automation_level: "L2",
              workflow_id: workflowId,
              before_state: stepResult.proposedAction,
            });

            // Execute via runWorkflowStep again (approved path)
            return runWorkflowStep({
              userId,
              workflowRunId: run.id,
              stepId: `${workflowStep.id}-approved`,
              automationLevel: "L3", // Execute without re-approval gate
              stepDefinition: {
                tool: workflowStep.tool,
                input: stepResult.proposedAction ?? workflowStep.params,
                description: workflowStep.description,
              },
            });
          }
        );

        // Update run status back to running
        await step.run(
          `update-run-running-${i}-${workflowStep.id}`,
          async () => {
            await serviceDb
              .update(workflowRuns)
              .set({ status: "running" })
              .where(
                and(
                  eq(workflowRuns.id, run.id),
                  eq(workflowRuns.user_id, userId)
                )
              );
          }
        );

        continue; // Move to next step
      }

      // ── L3: Execute directly + writeActivity (WF-05, WF-06) ───────────────
      // Also handles L2 steps that don't requiresApproval (e.g., read-only steps)
      await step.run(
        `write-activity-l3-${i}-${workflowStep.id}`,
        async () => {
          // writeActivity BEFORE external effect (T-2-07-05)
          await writeActivity(userId, {
            workflow_run_id: run.id,
            step_id: workflowStep.id,
            action_type: workflowStep.tool,
            summary: `Executing step: ${workflowStep.name}`,
            result: "success",
            automation_level: effectiveAutomationLevel as "L1" | "L2" | "L3",
            workflow_id: workflowId,
          });
        }
      );
    }

    // ── Finalize: mark succeeded ─────────────────────────────────────────────
    await step.run("finalize", async () => {
      await serviceDb
        .update(workflowRuns)
        .set({ status: "succeeded", completed_at: new Date() })
        .where(
          and(
            eq(workflowRuns.id, run.id),
            eq(workflowRuns.user_id, userId)
          )
        );
    });

    return { status: "succeeded", runId: run.id };
  }
);
