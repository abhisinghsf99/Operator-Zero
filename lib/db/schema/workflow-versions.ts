/**
 * lib/db/schema/workflow-versions.ts
 * Drizzle schema for the workflow_versions table.
 *
 * Immutable snapshots of a workflow's step definition.
 * A new row is created on every workflow edit.
 * Column names match DATA-FLOW.md §3.2 verbatim.
 *
 * MULTI-TENANT: This table has no user_id column of its own; ownership is
 *   inherited from the parent workflow (FK workflow_id → workflows.id). RLS is
 *   ENABLED with workflow_versions_user_policy, whose USING/WITH CHECK match only
 *   rows whose parent workflow belongs to auth.uid() (migration 0007). The agent
 *   tier (serviceDb) bypasses RLS and must still filter via the parent workflow.
 *
 * NOTE: v1 retains the last 10 versions; a nightly job prunes older ones.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  integer,
  jsonb,
  unique,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * FK to workflows(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    workflow_id: uuid("workflow_id").notNull(),

    /** Monotonically increasing version number per workflow */
    version_number: integer("version_number").notNull(),

    /**
     * The step graph definition JSONB.
     * Shape: { steps: [{id, type, name, tool, params, next_step}], entry_step }
     * See DATA-FLOW.md §3.2.1 for full shape.
     */
    definition: jsonb("definition").notNull(),

    /**
     * Schema version for the definition shape (forward-compatibility).
     * Increment when the definition shape changes.
     */
    schema_version: integer("schema_version").notNull().default(1),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** The chat thread that produced this version (nullable) */
    created_by_thread_id: uuid("created_by_thread_id"),
  },
  (table) => [
    /** Lookup by workflow (e.g., list versions for a workflow) */
    index("idx_workflow_versions_workflow").on(table.workflow_id),

    /**
     * Uniqueness: one version_number per workflow.
     * Prevents duplicate version numbers on concurrent edits.
     */
    unique("workflow_versions_workflow_version_unique").on(
      table.workflow_id,
      table.version_number
    ),

    /**
     * RLS policy: a row is visible/writable only when its parent workflow
     * belongs to the current user. workflow_versions has no user_id column, so
     * ownership is checked via the parent workflow (migration 0007). The EXISTS
     * subquery is itself subject to workflows_user_policy.
     */
    pgPolicy("workflow_versions_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`EXISTS (SELECT 1 FROM "workflows" w WHERE w."id" = ${table.workflow_id} AND w."user_id" = (SELECT auth.uid()))`,
      withCheck: sql`EXISTS (SELECT 1 FROM "workflows" w WHERE w."id" = ${table.workflow_id} AND w."user_id" = (SELECT auth.uid()))`,
    }),
  ]
).enableRLS();
