/**
 * lib/db/schema/workflows.ts
 * Drizzle schema for the workflows table.
 *
 * The core artifact — each workflow is a named, triggered sequence of agent
 * actions at an automation level (L1/L2/L3).
 * Column names match DATA-FLOW.md §3.1 verbatim.
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
 *   Every query from web tier must use withUserRls(); agent tier uses serviceDb
 *   with explicit user_id filter (RLS bypassed by service role).
 *
 * THREAT MODEL:
 *   T-2-02-01 (cross-user row access): mitigated by RLS policy auth.uid() = user_id
 *   T-2-02-04 (invalid enum states): CHECK constraint on automation_level + status in migration
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

export const workflows = pgTable(
  "workflows",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL (Drizzle cannot cross schemas).
     */
    user_id: uuid("user_id").notNull(),

    /** Workflow name shown in UI */
    name: text("name").notNull(),

    /** Optional longer description */
    description: text("description"),

    /**
     * Automation level: 'L1' | 'L2' | 'L3'
     * L1 = manual trigger; L2 = approval-gated; L3 = fully autonomous
     * CHECK constraint enforced in migration 0003.
     */
    automation_level: text("automation_level").notNull().default("L2"),

    /**
     * Lifecycle status: 'active' | 'paused' | 'draft' | 'archived'
     * CHECK constraint enforced in migration 0003.
     */
    status: text("status").notNull().default("draft"),

    /** Trigger type: 'schedule' | 'event' | 'manual' */
    trigger_type: text("trigger_type").notNull(),

    /** Trigger config JSONB: cron expression, event filter, etc. */
    trigger_config: jsonb("trigger_config").notNull().default({}),

    /**
     * FK to workflow_versions(id). Deferred to avoid circular dependency —
     * expressed as nullable here; FK in migration references workflow_versions
     * after that table is created.
     */
    current_version_id: uuid("current_version_id"),

    /**
     * How the workflow was created: 'chat' | 'promoted_from_activity' |
     * 'promoted_from_experiment' | 'duplicate'
     */
    source: text("source").notNull().default("chat"),

    /** Reference to the activity or experiment that produced this (v2; nullable) */
    source_reference_id: uuid("source_reference_id"),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Row last-update timestamp (NOT NULL; kept current by trigger in migration) */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Primary query pattern: list workflows by user + status */
    index("idx_workflows_user_status").on(table.user_id, table.status),

    /**
     * RLS policy: authenticated users can only access their own rows.
     * (SELECT auth.uid()) avoids per-row plan cache invalidation.
     */
    pgPolicy("workflows_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
