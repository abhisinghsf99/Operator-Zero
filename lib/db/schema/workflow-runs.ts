/**
 * lib/db/schema/workflow-runs.ts
 * Drizzle schema for the workflow_runs table.
 *
 * One row per execution of a workflow. Joined to a workflow + a version snapshot.
 * Column names match DATA-FLOW.md §3.3 verbatim.
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
 *   Every query from web tier must use withUserRls(); agent tier uses serviceDb
 *   with explicit user_id filter.
 *
 * THREAT MODEL:
 *   T-2-02-01 (cross-user access): RLS policy using auth.uid() = user_id
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgPolicy,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * FK to workflows(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    workflow_id: uuid("workflow_id").notNull(),

    /**
     * FK to workflow_versions(id).
     * FK expressed in migration SQL.
     */
    workflow_version_id: uuid("workflow_version_id").notNull(),

    /**
     * Denormalized snapshot of the version definition at run time.
     * Preserved even if the version is later pruned.
     */
    workflow_version_snapshot: jsonb("workflow_version_snapshot").notNull(),

    /**
     * How this run was triggered: 'schedule' | 'event' | 'manual' | 'chat'
     */
    trigger_source: text("trigger_source").notNull(),

    /**
     * Execution status.
     * CHECK constraint in migration: queued | running | paused_for_approval |
     * paused_manual | succeeded | failed | expired
     */
    status: text("status").notNull(),

    /** Which step in the definition is currently executing (nullable) */
    current_step_id: text("current_step_id"),

    /** Inngest function run ID for debugging (nullable) */
    inngest_function_id: text("inngest_function_id"),

    /** Short error summary if status = 'failed' (nullable) */
    error_summary: text("error_summary"),

    /** Arbitrary metadata JSONB for debugging */
    metadata: jsonb("metadata").default({}),

    /** When execution started (NOT NULL, auto-set) */
    started_at: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** When execution completed (nullable — null while in-flight) */
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * Primary query pattern: workflow run history for a user + workflow,
     * ordered by most recent first.
     */
    index("idx_workflow_runs_user_workflow").on(
      table.user_id,
      table.workflow_id,
      table.started_at
    ),

    /**
     * Partial index for active/in-flight runs — used by approval badge count
     * and Inngest resumption queries.
     */
    index("idx_workflow_runs_status").on(table.status),

    /**
     * RLS policy: authenticated users can only access their own rows.
     */
    pgPolicy("workflow_runs_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
