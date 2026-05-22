/**
 * lib/db/schema/activity-entries.ts
 * Drizzle schema for the activity_entries table.
 *
 * Observability log — every agent action that touches the world emits one of these
 * BEFORE the external effect (WF-06 invariant).
 * Column names match DATA-FLOW.md §4.1 verbatim.
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
 *   Agent tier writes via serviceDb with explicit user_id filter.
 *
 * THREAT MODEL:
 *   T-2-02-01 (cross-user access): RLS policy using auth.uid() = user_id
 *   T-2-02-02 (duplicate writes on retry): unique(workflow_run_id, step_id) enforces idempotency (WF-06)
 *
 * NOTE: v1 retains 6 months of entries; older rows pruned nightly.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgPolicy,
  index,
  jsonb,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const activityEntries = pgTable(
  "activity_entries",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * FK to workflow_runs(id) ON DELETE SET NULL.
     * Nullable — direct chat actions have no workflow run.
     * FK expressed in migration SQL.
     */
    workflow_run_id: uuid("workflow_run_id"),

    /**
     * FK to workflows(id) ON DELETE SET NULL.
     * Nullable — denormalized from run for convenience.
     * FK expressed in migration SQL.
     */
    workflow_id: uuid("workflow_id"),

    /**
     * FK to threads(id) ON DELETE SET NULL.
     * Nullable — present when action originated from a chat thread.
     * FK expressed in migration SQL.
     */
    thread_id: uuid("thread_id"),

    /**
     * Which agent context produced this entry.
     * 'orchestrator' | 'catalog' | 'seo' | 'qa' | 'inventory'
     */
    agent_context: text("agent_context"),

    /**
     * The type of action performed.
     * e.g., 'update_product' | 'send_email_draft' | 'create_redirect'
     */
    action_type: text("action_type").notNull(),

    /** One-line human-readable summary: "Updated 14 product descriptions" */
    action_summary: text("action_summary").notNull(),

    /**
     * Outcome: 'success' | 'partial' | 'failed'
     */
    result: text("result").notNull(),

    /** Failure reason or partial counts (nullable) */
    result_details: text("result_details"),

    /**
     * Automation level when action was taken.
     * 'L1' | 'L2' | 'L3' (nullable if originated from direct chat)
     */
    automation_level: text("automation_level"),

    /** Pre-action state snapshot for potential revert (nullable) */
    before_state: jsonb("before_state"),

    /** Post-action state snapshot (nullable) */
    after_state: jsonb("after_state"),

    /** Pointer to Storage blob for large reasoning chains (nullable) */
    reasoning_chain_url: text("reasoning_chain_url"),

    /** Inline reasoning chain JSONB for small chains (nullable) */
    reasoning_chain: jsonb("reasoning_chain"),

    /**
     * Type of target entity.
     * 'product' | 'order' | 'email' | 'page' | etc. (nullable)
     */
    target_type: text("target_type"),

    /**
     * Identifier of the target entity (Shopify GID, Gmail message ID, etc.).
     * Nullable.
     */
    target_id: text("target_id"),

    /**
     * Idempotency step identifier within a workflow run.
     * Used with workflow_run_id for the unique constraint (WF-06).
     * Nullable for direct chat actions.
     */
    step_id: text("step_id"),

    /** Whether this action can be reverted (default true) */
    is_revertable: boolean("is_revertable").notNull().default(true),

    /** Timestamp of revert (nullable) */
    reverted_at: timestamp("reverted_at", { withTimezone: true }),

    /**
     * FK to activity_entries(id) — the reverting entry (nullable).
     * FK expressed in migration SQL (self-reference).
     */
    reverted_by_entry_id: uuid("reverted_by_entry_id"),

    /** When the action occurred (NOT NULL, auto-set) */
    occurred_at: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Primary query pattern: activity feed sorted by time for a user */
    index("idx_activity_user_time").on(table.user_id, table.occurred_at),

    /** Lookup all activity for a specific workflow */
    index("idx_activity_workflow").on(table.workflow_id, table.occurred_at),

    /** Lookup all activity targeting a specific entity type + ID */
    index("idx_activity_target").on(table.target_type, table.target_id),

    /**
     * Idempotency constraint (WF-06): only one activity entry per
     * workflow_run_id + step_id pair. Prevents duplicate writes on Inngest retry.
     * Applied only when both columns are non-null (partial unique in migration).
     */
    unique("activity_entries_run_step_unique").on(
      table.workflow_run_id,
      table.step_id
    ),

    /**
     * RLS policy: authenticated users can only access their own rows.
     */
    pgPolicy("activity_entries_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
