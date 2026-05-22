/**
 * lib/db/schema/memory-items.ts
 * Drizzle schema for the memory_items table.
 *
 * Structured persistent memory — the agent stores inferred and explicit facts
 * about the user's store, preferences, and decisions. Items are soft-deleted
 * with a 24h grace period before hard deletion.
 * Column names match DATA-FLOW.md §4.3 verbatim.
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
  real,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const memoryItems = pgTable(
  "memory_items",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * Memory category.
     * 'brand' | 'catalog' | 'policy' | 'preference' | 'decision_history'
     */
    category: text("category").notNull(),

    /** The memory content (full text; embedded separately in memory_embeddings) */
    content: text("content").notNull(),

    /**
     * How this memory was created.
     * 'agent_inferred' | 'user_explicit' | 'onboarding'
     */
    source_type: text("source_type"),

    /**
     * FK to the thread, workflow, or activity that produced this memory (nullable).
     * FK NOT expressed (polymorphic reference).
     */
    source_reference_id: uuid("source_reference_id"),

    /** Agent's confidence in this memory item: 0.0 to 1.0 (nullable) */
    confidence: real("confidence"),

    /**
     * Soft-delete timestamp. Rows with a non-null value are excluded from
     * recall queries. Hard deletion after 24h grace period.
     */
    soft_deleted_at: timestamp("soft_deleted_at", { withTimezone: true }),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Row last-update timestamp (NOT NULL; kept current by trigger) */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * Primary query pattern: load memory by user + category, excluding soft-deleted.
     */
    index("idx_memory_user_category").on(table.user_id, table.category),

    /**
     * RLS policy: authenticated users can only access their own rows.
     */
    pgPolicy("memory_items_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
