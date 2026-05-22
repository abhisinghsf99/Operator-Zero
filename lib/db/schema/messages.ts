/**
 * lib/db/schema/messages.ts
 * Drizzle schema for the messages table.
 *
 * Chat messages within a thread. Inline blocks (workflow plans, approval cards,
 * previews, reasoning) are co-located on the message row via inline_block_type
 * + inline_block_payload for single-query rendering.
 * Column names match DATA-FLOW.md §5.2 verbatim.
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
 *   Thread ownership check must also be enforced in application code.
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
  integer,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const messages = pgTable(
  "messages",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * FK to threads(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    thread_id: uuid("thread_id").notNull(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * Message role: 'user' | 'assistant' | 'tool'
     */
    role: text("role").notNull(),

    /** Markdown body of the message (nullable for tool messages) */
    content: text("content"),

    /** Tool call requests from assistant messages (JSONB, nullable) */
    tool_calls: jsonb("tool_calls"),

    /** Tool call ID for tool result messages (nullable) */
    tool_call_id: text("tool_call_id"),

    /**
     * Type of inline block attached to this message (nullable for plain text).
     * 'workflow_plan' | 'approval_card' | 'preview' | 'reasoning'
     */
    inline_block_type: text("inline_block_type"),

    /**
     * Payload for the inline block (nullable).
     * workflow_plan: step graph + save action
     * approval_card: { approval_id } — card fetches live state from approvals table
     * preview: markdown content
     * reasoning: chain of thought
     */
    inline_block_payload: jsonb("inline_block_payload"),

    /**
     * Message delivery/streaming status.
     * 'streaming' = placeholder while response is in-flight
     * 'complete' = fully received
     * 'errored' = stream failed
     */
    status: text("status").notNull().default("complete"),

    /** Model that generated this message (nullable for user messages) */
    model_id: text("model_id"),

    /** Input token count for this LLM call (nullable) */
    token_input: integer("token_input"),

    /** Output token count for this LLM call (nullable) */
    token_output: integer("token_output"),

    /** Latency in milliseconds (nullable) */
    latency_ms: integer("latency_ms"),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * Primary query pattern: load messages for a thread in chronological order.
     */
    index("idx_messages_thread_time").on(table.thread_id, table.created_at),

    /**
     * RLS policy: authenticated users can only access their own rows.
     */
    pgPolicy("messages_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
