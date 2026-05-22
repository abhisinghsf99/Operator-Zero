/**
 * lib/workflows/versions.ts
 * Workflow versioning transaction helper.
 *
 * createWorkflowVersion — atomically creates a new workflow_versions row,
 *   updates workflows.current_version_id and surface fields, and prunes
 *   older versions beyond the 10-version retention ceiling.
 *
 * Restore pattern (D-04): pass the target version's definition as the patch.
 *   This creates a NEW forward version — it never mutates existing rows.
 *   History is append-only (WF-14).
 *
 * SECURITY:
 *   - Must be called inside a withUserRls() callback — the db/tx parameter
 *     already has RLS enforced.
 *   - Performs an ownership check (SELECT by workflowId + userId) before any write.
 *   - Server-only module.
 *
 * CONCURRENCY (RESEARCH.md Pitfall 1 / Open Question 2):
 *   At READ COMMITTED isolation, two concurrent edits may both read the same
 *   MAX(version_number) and both attempt to INSERT the same version_number,
 *   violating UNIQUE(workflow_id, version_number). The 23505 retry wrapper
 *   catches this, re-reads MAX, and retries once. For v1 single-user usage
 *   this path is very rare but the retry makes it robust.
 */

import { eq, and, max, sql } from "drizzle-orm";
import { workflowVersions, workflows } from "@/lib/db/schema";

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Partial workflow definition — subset of fields that a patch may update. */
export interface WorkflowDefinition {
  steps?: unknown[];
  entry_step?: string;
  name?: string;
  description?: string;
  automation_level?: "L1" | "L2" | "L3";
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Drizzle transaction type accepted by createWorkflowVersion. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrizzleTx = any;

// ─── mergeDefinitionPatch ─────────────────────────────────────────────────────

/**
 * Shallow-merge a patch into the current definition.
 * For restore operations, the patch IS the full definition (replaces entirely).
 * For edit operations, the patch contains only the changed fields.
 */
function mergeDefinitionPatch(
  current: Record<string, unknown>,
  patch: Partial<WorkflowDefinition>
): Record<string, unknown> {
  return { ...current, ...patch };
}

// ─── createWorkflowVersion ────────────────────────────────────────────────────

/**
 * createWorkflowVersion — create a new versioned snapshot of a workflow.
 *
 * Steps:
 *   1. SELECT workflow by (id, user_id) — ownership check
 *   2. SELECT current version definition
 *   3. Compute next version_number = MAX(version_number) + 1
 *   4. INSERT new workflow_versions row with merged definition
 *   5. UPDATE workflows: current_version_id + surface fields + updated_at
 *   6. DELETE old versions beyond 10-version retention ceiling
 *
 * On UNIQUE(workflow_id, version_number) violation (23505), retries once
 * with a fresh MAX read (handles concurrent edit race condition).
 *
 * @param db         - Drizzle tx from withUserRls() callback
 * @param userId     - Authenticated user UUID (must own the workflow)
 * @param workflowId - The workflow to version
 * @param patch      - Fields to update in the new version's definition
 * @param threadId   - Optional: the chat thread that produced this version
 * @returns newVersionId + newVersionNumber of the created version
 */
export async function createWorkflowVersion(
  db: DrizzleTx,
  userId: string,
  workflowId: string,
  patch: Partial<WorkflowDefinition>,
  threadId?: string
): Promise<{ newVersionId: string; newVersionNumber: number }> {
  return db.transaction(async (tx: DrizzleTx) => {
    return _createVersionInTx(tx, userId, workflowId, patch, threadId);
  });
}

async function _createVersionInTx(
  tx: DrizzleTx,
  userId: string,
  workflowId: string,
  patch: Partial<WorkflowDefinition>,
  threadId?: string
): Promise<{ newVersionId: string; newVersionNumber: number }> {
  // 1. Ownership check: load current workflow
  const [current] = await tx
    .select({ current_version_id: workflows.current_version_id })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)))
    .limit(1);

  if (!current) {
    throw new Error("createWorkflowVersion: workflow not found or not owned by user");
  }

  // 2. Load current version definition (to merge patch into)
  const currentVersionId = current.current_version_id;
  let currentDefinition: Record<string, unknown> = {};

  if (currentVersionId) {
    const [currentVersion] = await tx
      .select({ definition: workflowVersions.definition })
      .from(workflowVersions)
      .where(eq(workflowVersions.id, currentVersionId))
      .limit(1);
    currentDefinition = (currentVersion?.definition as Record<string, unknown>) ?? {};
  }

  // 3. Compute next version_number = MAX + 1
  const [maxRow] = await tx
    .execute(
      sql`SELECT COALESCE(MAX(version_number), 0) AS max FROM workflow_versions WHERE workflow_id = ${workflowId}`
    );
  const nextVersionNumber = ((maxRow as Record<string, unknown>)?.max as number ?? 0) + 1;

  // 4. INSERT new workflow_versions row
  const [newVersion] = await tx
    .insert(workflowVersions)
    .values({
      workflow_id: workflowId,
      version_number: nextVersionNumber,
      definition: mergeDefinitionPatch(currentDefinition, patch),
      schema_version: 1,
      created_by_thread_id: threadId ?? null,
    })
    .returning();

  if (!newVersion) {
    throw new Error("createWorkflowVersion: insert returned no rows");
  }

  // 5. UPDATE workflow: current_version_id + surface fields + updated_at
  await tx
    .update(workflows)
    .set({
      current_version_id: newVersion.id,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.automation_level !== undefined && { automation_level: patch.automation_level }),
      ...(patch.trigger_type !== undefined && { trigger_type: patch.trigger_type }),
      ...(patch.trigger_config !== undefined && { trigger_config: patch.trigger_config }),
      updated_at: new Date(),
    })
    .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)));

  // 6. Prune: keep only the last 10 versions
  // DELETE rows where version_number < (MAX - 9)
  await tx.execute(sql`
    DELETE FROM workflow_versions
    WHERE workflow_id = ${workflowId}
      AND version_number < (
        SELECT MAX(version_number) - 9
        FROM workflow_versions
        WHERE workflow_id = ${workflowId}
      )
  `);

  return { newVersionId: newVersion.id, newVersionNumber: nextVersionNumber };
}

// ─── createWorkflowVersionWithRetry ──────────────────────────────────────────

/**
 * createWorkflowVersionWithRetry — wraps createWorkflowVersion with a single
 * retry on 23505 (UNIQUE violation on workflow_id + version_number).
 *
 * This handles the concurrent-edit race where two tabs both read MAX=N and
 * both try to INSERT N+1. On the collision, the loser retries and gets N+2.
 *
 * For most callers, use this instead of createWorkflowVersion directly.
 */
export async function createWorkflowVersionWithRetry(
  db: DrizzleTx,
  userId: string,
  workflowId: string,
  patch: Partial<WorkflowDefinition>,
  threadId?: string
): Promise<{ newVersionId: string; newVersionNumber: number }> {
  try {
    return await createWorkflowVersion(db, userId, workflowId, patch, threadId);
  } catch (err) {
    // 23505 = unique_violation — retry once with fresh MAX read
    const errCode = (err as { code?: string })?.code;
    const errMsg = String(err);
    if (errCode === "23505" || errMsg.includes("workflow_versions_workflow_version_unique")) {
      return createWorkflowVersion(db, userId, workflowId, patch, threadId);
    }
    throw err;
  }
}
