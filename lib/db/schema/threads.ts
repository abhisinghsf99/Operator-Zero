/**
 * lib/db/schema/threads.ts
 * Drizzle schema for the threads table.
 *
 * Conversation threads — each thread is a named sequence of messages with a
 * single agent context. New threads inherit brand voice + memory but no
 * message history.
 * Column names match DATA-FLOW.md §5.1 verbatim.
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
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const threads = pgTable(
  "threads",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * Auto-named from first message truncation or Anthropic fast-path.
     * Nullable until first message is processed.
     */
    title: text("title"),

    /**
     * The agent context for this thread.
     * v1: always 'orchestrator'; v2 may scope to 'catalog' | 'seo' | etc.
     */
    agent_context: text("agent_context").notNull().default("orchestrator"),

    /**
     * FK to workflows(id) — scopes thread to a specific workflow context.
     * Nullable — most threads are general-purpose.
     * FK expressed in migration SQL.
     */
    context_workflow_id: uuid("context_workflow_id"),

    /** Timestamp of last message in thread (updated on each new message; nullable) */
    last_message_at: timestamp("last_message_at", { withTimezone: true }),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Soft-archive timestamp (nullable — archived threads hidden from sidebar) */
    archived_at: timestamp("archived_at", { withTimezone: true }),

    /**
     * Pin-to-top timestamp (nullable — pinned threads sort above the rest).
     * Set via togglePinThread server action from the chat ⋯ menu.
     * No new RLS policy needed — threads_user_policy (for: all) already covers UPDATE.
     */
    pinned_at: timestamp("pinned_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * Primary query pattern: thread sidebar — user's threads sorted by
     * last_message_at DESC, excluding archived.
     */
    index("idx_threads_user_last").on(table.user_id, table.last_message_at),

    /**
     * RLS policy: authenticated users can only access their own rows.
     */
    pgPolicy("threads_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
