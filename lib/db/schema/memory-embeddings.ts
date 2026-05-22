/**
 * lib/db/schema/memory-embeddings.ts
 * Drizzle schema for the memory_embeddings table.
 *
 * pgvector index for semantic recall — stores Voyage AI voyage-4 embeddings
 * (1024 dimensions) for memory items and other content.
 * Column names match DATA-FLOW.md §4.4 verbatim.
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
 *   HNSW queries must always include a user_id filter to avoid cross-user recall.
 *
 * SECURITY CRITICAL:
 *   - Semantic recall without user_id filter would leak information across users.
 *   - Every query against this table MUST include user_id = current user.
 *
 * THREAT MODEL:
 *   T-2-02-01 (cross-user access): RLS policy using auth.uid() = user_id
 *   T-2-02-03 (semantic recall cross-user): HNSW queries filtered by user_id downstream
 *
 * DIMENSION NOTE (RESEARCH.md finding #2 / Pitfall 3):
 *   voyage-4 outputs 1024 dimensions. Schema uses vector(1024) — NOT 1536.
 *   The DATA-FLOW.md draft says vector(1536) — that's an error; 1024 is correct.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgPolicy,
  index,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const memoryEmbeddings = pgTable(
  "memory_embeddings",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * What type of content this embedding represents.
     * 'memory_item' | 'workflow_run' | 'message' | 'activity_entry'
     */
    source_type: text("source_type").notNull(),

    /** The source record's UUID */
    source_id: uuid("source_id").notNull(),

    /** The text that was embedded (stored for debugging/re-embedding) */
    content: text("content").notNull(),

    /**
     * Voyage AI voyage-4 embedding vector.
     * Dimensions: 1024 (confirmed — voyage-4 default output).
     * HNSW index for approximate nearest-neighbor search with cosine similarity.
     */
    embedding: vector("embedding", { dimensions: 1024 }),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * HNSW index for fast approximate nearest-neighbor cosine similarity search.
     * Parameters m=16, ef_construction=64 are set in the migration SQL.
     * Drizzle generates the index directive; params come from the migration.
     */
    index("idx_memory_embeddings_hnsw").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),

    /** Additional btree index on user_id for pre-filtering before vector search */
    index("idx_memory_embeddings_user_id").on(table.user_id),

    /**
     * RLS policy: authenticated users can only access their own embeddings.
     */
    pgPolicy("memory_embeddings_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
