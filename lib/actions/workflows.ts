"use server";

/**
 * lib/actions/workflows.ts
 * Server Actions for workflow management.
 *
 * editWorkflow   — update workflow fields → createWorkflowVersion (D-03: every edit = new version)
 * togglePause    — flip status active↔paused (direct UPDATE; NOT versioned — see below)
 * restoreVersion — restore a prior version → createWorkflowVersion with old definition (forward-only, D-04)
 * runNow         — verify ownership → inngest.send('workflow.run_requested') (WF-13, D-05)
 *
 * SECURITY:
 *   - All inputs Zod-validated (T-3-01-02 / T-3-01-03)
 *   - getClaims() verifies the session (requireUserId)
 *   - withUserRls() enforces row-level security on all DB access
 *   - runNow: ownership SELECT before inngest.send (T-3-01-02)
 *   - restoreVersion: version lookup verifies workflow_id + user_id (T-3-01-03)
 *
 * THREAT MODEL:
 *   T-3-01-02 (runNow spoofing): ownership verified before Inngest send
 *   T-3-01-03 (restoreVersion spoofing): workflow_id + user_id verified on version lookup
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/auth/server";
import { withUserRls } from "@/lib/db/client";
import { inngest } from "@/lib/inngest/client";
import { workflows, workflowVersions } from "@/lib/db/schema";
import { createWorkflowVersionWithRetry } from "@/lib/workflows/versions";
import { revalidatePath } from "next/cache";

// ─── Input schemas ────────────────────────────────────────────────────────────

const EditWorkflowSchema = z.object({
  workflowId: z.string().uuid("workflowId must be a valid UUID"),
  patch: z.object({
    name: z.string().min(1).max(256).optional(),
    description: z.string().max(2000).optional().nullable(),
    automation_level: z.enum(["L1", "L2", "L3"]).optional(),
    trigger_type: z.string().optional(),
    trigger_config: z.record(z.unknown()).optional(),
  }),
});

const TogglePauseSchema = z.object({
  workflowId: z.string().uuid("workflowId must be a valid UUID"),
});

const RestoreVersionSchema = z.object({
  workflowId: z.string().uuid("workflowId must be a valid UUID"),
  versionId: z.string().uuid("versionId must be a valid UUID"),
});

const RunNowSchema = z.object({
  workflowId: z.string().uuid("workflowId must be a valid UUID"),
});

// ─── requireUserId helper ─────────────────────────────────────────────────────

async function requireUserId(): Promise<{ userId: string; claims: Record<string, unknown> }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Not authenticated");
  }
  return { userId, claims: data.claims as Record<string, unknown> };
}

// ─── editWorkflow ─────────────────────────────────────────────────────────────

export type EditWorkflowResult = { success: true } | { error: string };

/**
 * editWorkflow — update workflow fields and increment the version.
 *
 * D-03: every inline edit creates a new workflow_versions row.
 *
 * @param workflowId — UUID of the workflow to edit
 * @param patch      — partial update (name, description, level, trigger)
 */
export async function editWorkflow(
  workflowId: string,
  patch: {
    name?: string;
    description?: string | null;
    automation_level?: "L1" | "L2" | "L3";
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
  }
): Promise<EditWorkflowResult> {
  const parsed = EditWorkflowSchema.safeParse({ workflowId, patch });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await requireUserId());
  } catch {
    return { error: "Not authenticated" };
  }

  try {
    await withUserRls(claims, async (tx) => {
      await createWorkflowVersionWithRetry(tx, userId, workflowId, patch);
    });

    revalidatePath("/app/workflows");
    revalidatePath(`/app/workflows/${workflowId}`);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
}

// ─── togglePause ─────────────────────────────────────────────────────────────

export type TogglePauseResult = { success: true } | { error: string };

/**
 * togglePause — flip a workflow between active and paused status.
 *
 * WR-05 / D-03: status is intentionally NOT versioned. D-03 scopes "every edit
 * creates a new version" to the WorkflowDefinition fields (name, description,
 * schedule, level) — `status` is a runtime/operational flag, not part of
 * WorkflowDefinition, and createWorkflowVersion does not persist it. Pause/resume
 * is therefore a direct UPDATE with no version bump. Do not "fix" this by calling
 * createWorkflowVersion — versioning status would snapshot duplicate definitions.
 *
 * @param workflowId — UUID of the workflow
 */
export async function togglePause(workflowId: string): Promise<TogglePauseResult> {
  const parsed = TogglePauseSchema.safeParse({ workflowId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await requireUserId());
  } catch {
    return { error: "Not authenticated" };
  }

  try {
    await withUserRls(claims, async (tx) => {
      // Load current status (ownership verified via the user_id filter + RLS)
      const [current] = await tx
        .select({ status: workflows.status })
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)))
        .limit(1);

      if (!current) {
        throw new Error("Workflow not found or not owned by user");
      }

      const newStatus = current.status === "paused" ? "active" : "paused";

      // WR-05: status is NOT part of WorkflowDefinition, so pause/resume is a
      // direct UPDATE and does NOT create a new version (see doc block above).
      await tx
        .update(workflows)
        .set({ status: newStatus, updated_at: new Date() })
        .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)));
    });

    revalidatePath("/app/workflows");
    revalidatePath(`/app/workflows/${workflowId}`);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
}

// ─── restoreVersion ───────────────────────────────────────────────────────────

export type RestoreVersionResult = { success: true } | { error: string };

/**
 * restoreVersion — restore a prior workflow version by creating a new forward version.
 *
 * D-04: Restore creates a NEW version (does not overwrite history).
 * The target version's definition is used as the patch — the new version
 * copies it forward, making it the current version.
 *
 * Security: verifies both workflow_id AND user_id on the version lookup (T-3-01-03).
 *
 * @param workflowId — UUID of the workflow
 * @param versionId  — UUID of the workflow_versions row to restore
 */
export async function restoreVersion(
  workflowId: string,
  versionId: string
): Promise<RestoreVersionResult> {
  const parsed = RestoreVersionSchema.safeParse({ workflowId, versionId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await requireUserId());
  } catch {
    return { error: "Not authenticated" };
  }

  try {
    await withUserRls(claims, async (tx) => {
      // Verify the version belongs to a workflow owned by the user (T-3-01-03)
      const [version] = await tx
        .select({ definition: workflowVersions.definition })
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.id, versionId),
            eq(workflowVersions.workflow_id, workflowId)
          )
        )
        .limit(1);

      if (!version) {
        throw new Error("Version not found or does not belong to this workflow");
      }

      // Verify workflow ownership separately (RLS will enforce, but explicit check is defense-in-depth)
      const [wf] = await tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)))
        .limit(1);

      if (!wf) {
        throw new Error("Workflow not found or not owned by user");
      }

      // Restore = createWorkflowVersion with the old definition (forward-only, D-04).
      // WR-06: replaceDefinition makes the new version an EXACT snapshot of the
      // target version's definition rather than a shallow merge into the current
      // one (which would union stale current-only keys into the restored version).
      await createWorkflowVersionWithRetry(
        tx,
        userId,
        workflowId,
        version.definition as Record<string, unknown>,
        undefined,
        { replaceDefinition: true }
      );
    });

    revalidatePath("/app/workflows");
    revalidatePath(`/app/workflows/${workflowId}`);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
}

// ─── runNow ───────────────────────────────────────────────────────────────────

export type RunNowResult =
  | { success: true; runTriggered: true }
  | { error: string };

/**
 * runNow — trigger an immediate workflow execution via Inngest.
 *
 * WF-13 / D-05: The confirm dialog for write/L3 workflows is a client-side UX
 * gate — this Server Action does NOT check automation_level (the client already
 * confirmed before calling). The ownership check is the security enforcement.
 *
 * Security (T-3-01-02): ownership SELECT before inngest.send — rejects if
 * the caller does not own the workflow.
 *
 * @param workflowId — UUID of the workflow to trigger
 */
export async function runNow(workflowId: string): Promise<RunNowResult> {
  const parsed = RunNowSchema.safeParse({ workflowId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await requireUserId());
  } catch {
    return { error: "Not authenticated" };
  }

  try {
    // Ownership check: verify caller owns the workflow before sending any event
    const ownershipResult = await withUserRls(claims, async (tx) => {
      const [wf] = await tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)))
        .limit(1);
      return wf ?? null;
    });

    if (!ownershipResult) {
      return { error: "Workflow not found or not owned by user" };
    }

    // Send the Inngest event — same event the scheduler sends (WF-13)
    await inngest.send({
      name: "workflow.run_requested",
      data: {
        userId,
        workflowId,
        triggerSource: "manual",
      },
    });

    revalidatePath(`/app/workflows/${workflowId}`);
    return { success: true, runTriggered: true };
  } catch (err) {
    return { error: String(err) };
  }
}
