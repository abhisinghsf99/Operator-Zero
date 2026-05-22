/**
 * lib/db/schema/approvals.ts
 * Drizzle schema for the approvals table.
 *
 * Single source of truth for L2 pending approval items.
 * Both the Inbox surface and inline chat cards read from this table.
 * Column names match DATA-FLOW.md §4.2 verbatim.
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
 *
 * THREAT MODEL:
 *   T-2-02-01 (cross-user access): RLS policy using auth.uid() = user_id
 *   T-2-02-04 (invalid status): CHECK constraint on status in migration 0003
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgPolicy,
  index,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const approvals = pgTable(
  "approvals",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * FK to workflow_runs(id).
     * Nullable — approval may be created outside a workflow context in v2.
     * FK expressed in migration SQL.
     */
    workflow_run_id: uuid("workflow_run_id"),

    /**
     * FK to threads(id).
     * Present if the approval was surfaced inline in a chat thread.
     * FK expressed in migration SQL.
     */
    thread_id: uuid("thread_id"),

    /**
     * FK to messages(id).
     * The message that holds the inline approval card.
     * FK expressed in migration SQL.
     */
    message_id: uuid("message_id"),

    /**
     * Approval lifecycle status.
     * CHECK constraint: 'pending' | 'approved' | 'rejected' | 'snoozed' | 'expired'
     */
    status: text("status").notNull().default("pending"),

    /**
     * The type of action being proposed (matches tool name).
     * e.g., 'shopify_update_meta_title' | 'send_email_reply'
     */
    action_type: text("action_type").notNull(),

    /** One-line summary of the proposed action */
    action_summary: text("action_summary").notNull(),

    /** Risk assessment: 'low' | 'med' | 'high' */
    stakes: text("stakes").notNull(),

    /** Structured preview of the proposed action (e.g., 5 of N items) */
    preview: jsonb("preview").notNull(),

    /** Agent's reasoning summary (shown to user) */
    reasoning_summary: text("reasoning_summary").notNull(),

    /** Full reasoning chain JSONB (nullable — may be null for fast approvals) */
    reasoning_chain: jsonb("reasoning_chain"),

    /** Downstream impact description (shown for high-stakes; nullable) */
    downstream_impact: text("downstream_impact"),

    /** Estimated review time in seconds (nullable) */
    estimated_review_seconds: integer("estimated_review_seconds"),

    /**
     * The full proposed action JSONB that would execute on approve.
     * Includes all parameters needed to execute the action.
     */
    proposed_action: jsonb("proposed_action").notNull(),

    /**
     * The Inngest event key this approval maps to.
     * Used to fire 'approval.resolved' event and resume the workflow.
     */
    inngest_event_key: text("inngest_event_key"),

    /** Snoozed until timestamp (nullable) */
    snoozed_until: timestamp("snoozed_until", { withTimezone: true }),

    /** When this approval expires (default: +14 days) */
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),

    /** When this approval was resolved (nullable) */
    resolved_at: timestamp("resolved_at", { withTimezone: true }),

    /**
     * Which surface resolved the approval.
     * 'inline' (chat card) | 'inbox' (Approvals inbox)
     */
    resolved_by_path: text("resolved_by_path"),

    /** Rejection reason (nullable) */
    reject_reason: text("reject_reason"),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * Primary query pattern: pending approvals for a user, newest first.
     * Partial index on status='pending' to keep it lean.
     */
    index("idx_approvals_user_pending").on(
      table.user_id,
      table.status,
      table.created_at
    ),

    /** Lookup approvals associated with a specific thread */
    index("idx_approvals_thread").on(table.thread_id),

    /**
     * RLS policy: authenticated users can only access their own rows.
     */
    pgPolicy("approvals_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
