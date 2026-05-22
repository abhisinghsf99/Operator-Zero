/**
 * lib/db/schema/gmail-mirror.ts
 * Drizzle schemas for the Gmail mirror tables:
 *   gmail_threads, gmail_messages, gmail_sync_state
 *
 * Mirror tables sync from Gmail on connect (30-day initial) and via
 * 5-minute polling using the Gmail History API cursor.
 * Column names match DATA-FLOW.md §7.2 verbatim.
 *
 * MULTI-TENANT: Composite PKs (user_id, <gmail_id>) + RLS enforce isolation.
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
  primaryKey,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

// ─── gmail_threads ─────────────────────────────────────────────────────────────

export const gmailThreads = pgTable(
  "gmail_threads",
  {
    user_id: uuid("user_id").notNull(),

    /** Gmail's thread ID string (not a UUID) */
    gmail_thread_id: text("gmail_thread_id").notNull(),

    /** Thread subject (nullable — may be absent for unlabeled threads) */
    subject: text("subject"),

    /** Participant email addresses */
    participants: text("participants").array(),

    /**
     * Whether this thread is a customer support email.
     * Classified by Anthropic fast-path on sync.
     */
    is_customer_support: boolean("is_customer_support").default(false),

    /** Timestamp of the most recent message in this thread */
    last_message_at: timestamp("last_message_at", { withTimezone: true }),

    /** Number of messages in the thread */
    message_count: integer("message_count"),

    last_synced_at: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Composite PK: (user_id, gmail_thread_id) */
    primaryKey({ columns: [table.user_id, table.gmail_thread_id] }),

    index("idx_gmail_threads_user").on(table.user_id),

    pgPolicy("gmail_threads_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── gmail_messages ────────────────────────────────────────────────────────────

export const gmailMessages = pgTable(
  "gmail_messages",
  {
    user_id: uuid("user_id").notNull(),

    /** Gmail's message ID string */
    gmail_message_id: text("gmail_message_id").notNull(),

    /** Parent thread ID for joining to gmail_threads */
    gmail_thread_id: text("gmail_thread_id").notNull(),

    /** From address */
    from_address: text("from_address"),

    /** To addresses (array) */
    to_addresses: text("to_addresses").array(),

    /** Message subject */
    subject: text("subject"),

    /** Plain text body */
    body_text: text("body_text"),

    /** HTML body (nullable — may not always be present) */
    body_html: text("body_html"),

    /**
     * Email direction: 'inbound' | 'outbound' | 'draft'
     */
    direction: text("direction"),

    /** When Gmail received the message */
    gmail_received_at: timestamp("gmail_received_at", { withTimezone: true }),

    last_synced_at: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Composite PK: (user_id, gmail_message_id) */
    primaryKey({ columns: [table.user_id, table.gmail_message_id] }),

    index("idx_gmail_messages_user").on(table.user_id),

    /** Lookup messages within a specific thread */
    index("idx_gmail_messages_thread").on(table.user_id, table.gmail_thread_id),

    pgPolicy("gmail_messages_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── gmail_sync_state ──────────────────────────────────────────────────────────

export const gmailSyncState = pgTable(
  "gmail_sync_state",
  {
    /**
     * PK — user_id IS the primary key (one sync state row per user).
     * FK to auth.users(id) ON DELETE CASCADE expressed in migration SQL.
     */
    user_id: uuid("user_id").primaryKey(),

    /**
     * Gmail History API cursor — the last historyId processed.
     * Stored as text because Gmail history IDs can exceed int64.
     * Null until initial sync completes.
     */
    last_history_id: text("last_history_id"),

    /** When the last poll ran (nullable) */
    last_poll_at: timestamp("last_poll_at", { withTimezone: true }),

    /**
     * Current sync health.
     * 'healthy' | 'errored' | 'needs_resync'
     */
    sync_status: text("sync_status"),
  },
  (table) => [
    pgPolicy("gmail_sync_state_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
