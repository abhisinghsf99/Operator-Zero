/**
 * lib/db/schema/telemetry.ts
 * Drizzle schemas for telemetry + cost tables:
 *   agent_telemetry, cost_aggregates
 *
 * agent_telemetry: every LLM call logged here for internal observability.
 *   Separate from activity_entries (user-facing) — this is developer/ops visibility.
 *   90-day retention; pruned nightly.
 *
 * cost_aggregates: pre-computed daily rollups for per-user cost visibility
 *   and the AUTH-07 hard/soft cap enforcement. Updated by nightly Inngest cron.
 *
 * Column names match DATA-FLOW.md §8.1 and §8.2 verbatim.
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
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
  integer,
  boolean,
  bigint,
  primaryKey,
  numeric,
  date,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

// ─── agent_telemetry ───────────────────────────────────────────────────────────

export const agentTelemetry = pgTable(
  "agent_telemetry",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * Type of LLM call.
     * 'chat' | 'workflow_step' | 'classification' | 'tool_call'
     */
    call_type: text("call_type").notNull(),

    /**
     * FK to workflow_runs(id) — nullable; present for workflow step calls.
     * FK expressed in migration SQL.
     */
    workflow_run_id: uuid("workflow_run_id"),

    /**
     * FK to threads(id) — nullable; present for chat calls.
     * FK expressed in migration SQL.
     */
    thread_id: uuid("thread_id"),

    /**
     * FK to messages(id) — nullable; present for chat messages.
     * FK expressed in migration SQL.
     */
    message_id: uuid("message_id"),

    /** Model ID used for this call (e.g., 'claude-opus-4-7') */
    model_id: text("model_id").notNull(),

    /** Number of input tokens */
    prompt_tokens: integer("prompt_tokens").notNull(),

    /** Number of output tokens */
    completion_tokens: integer("completion_tokens").notNull(),

    /** Total tokens (prompt + completion) */
    total_tokens: integer("total_tokens").notNull(),

    /** Cost in USD for this call (nullable — computed from model pricing) */
    cost_usd: numeric("cost_usd", { precision: 10, scale: 6 }),

    /** Round-trip latency in milliseconds */
    latency_ms: integer("latency_ms").notNull(),

    /** Whether the call succeeded */
    success: boolean("success").notNull(),

    /**
     * Error classification if failed.
     * 'transient' | 'auth_error' | 'budget_exhausted' | 'unknown'
     */
    error_class: text("error_class"),

    /** Tools invoked during this call (array of tool names; nullable) */
    tools_invoked: text("tools_invoked").array(),

    /** When this call occurred (NOT NULL, auto-set) */
    occurred_at: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Primary query pattern: telemetry feed by user + time */
    index("idx_telemetry_user_time").on(table.user_id, table.occurred_at),

    /**
     * RLS policy: authenticated users can only access their own telemetry.
     */
    pgPolicy("agent_telemetry_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── cost_aggregates ───────────────────────────────────────────────────────────

export const costAggregates = pgTable(
  "cost_aggregates",
  {
    /**
     * Tenant discriminator.
     * Part of composite PK (user_id, day).
     * FK to auth.users(id) ON DELETE CASCADE expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /** The date this aggregate covers (UTC date) */
    day: date("day").notNull(),

    /** Total tokens consumed on this day */
    total_tokens: bigint("total_tokens", { mode: "number" })
      .notNull()
      .default(0),

    /** Total cost in USD on this day (4 decimal precision) */
    total_cost_usd: numeric("total_cost_usd", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),

    /** Number of LLM calls on this day */
    llm_calls: integer("llm_calls").notNull().default(0),

    /** Number of workflow runs on this day */
    workflow_runs: integer("workflow_runs").notNull().default(0),
  },
  (table) => [
    /** Composite PK: (user_id, day) — one row per user per day */
    primaryKey({ columns: [table.user_id, table.day] }),

    pgPolicy("cost_aggregates_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
