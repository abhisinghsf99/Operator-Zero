/**
 * lib/db/schema/sandbox-sessions.ts
 * Drizzle schema for the sandbox_sessions table.
 *
 * Registry of per-visitor demo sandboxes. Each anonymous demo visitor gets one
 * row here when they enter (enterSandbox). It lets the TTL-sweep cron find and
 * tear down abandoned sandboxes whose tab-close beacon never fired.
 *
 * FK to auth.users(id) ON DELETE CASCADE is declared in the migration SQL
 * (cross-schema FK to the auth schema — not expressible in Drizzle). Because of
 * that cascade, deleting the anonymous auth identity also removes this row.
 *
 * RLS is enabled with a self-policy for consistency, but in practice only
 * serviceDb (RLS-bypass) reads/writes this table — visitors never query it.
 */
import { pgTable, uuid, timestamp, pgPolicy, index } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const sandboxSessions = pgTable(
  "sandbox_sessions",
  {
    /**
     * The anonymous visitor's user_id. PK + NOT NULL FK to auth.users(id)
     * ON DELETE CASCADE (FK expressed in migration SQL). One sandbox per user.
     */
    user_id: uuid("user_id").primaryKey(),

    /** When the sandbox was created (seeded). NOT NULL, auto-set. */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * Last time the visitor was seen active. Updated on a best-effort heartbeat;
     * the TTL sweep tears down sandboxes idle past the cutoff.
     */
    last_seen_at: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** TTL-sweep query: find sandboxes idle past the cutoff. */
    index("idx_sandbox_sessions_last_seen").on(table.last_seen_at),

    /** RLS self-policy (defensive — only serviceDb touches this table). */
    pgPolicy("sandbox_sessions_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
