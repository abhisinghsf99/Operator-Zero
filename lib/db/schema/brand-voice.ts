/**
 * lib/db/schema/brand-voice.ts
 * Drizzle schema for brand_voice_profiles + brand_voice_samples tables.
 *
 * brand_voice_profiles: one row per user (user_id IS PK).
 *   The markdown profile + tone metadata the agent uses for all content generation.
 *
 * brand_voice_samples: sample texts with embeddings for semantic voice matching.
 *   Uses vector(1024) + HNSW index (voyage-4 dimension — same as memory_embeddings).
 *
 * Column names match DATA-FLOW.md §4.5 verbatim.
 *
 * MULTI-TENANT: user_id (PK on profiles; FK on samples) + RLS enforce isolation.
 *
 * DIMENSION NOTE: vector(1024) — voyage-4 output, NOT 1536.
 *
 * THREAT MODEL:
 *   T-2-02-01 (cross-user access): RLS policy using auth.uid() = user_id
 *   T-2-02-03 (semantic recall cross-user): HNSW filtered by user_id downstream
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

// ─── brand_voice_profiles ──────────────────────────────────────────────────────

export const brandVoiceProfiles = pgTable(
  "brand_voice_profiles",
  {
    /**
     * PK — user_id IS the primary key (one profile per user).
     * FK to auth.users(id) ON DELETE CASCADE expressed in migration SQL.
     */
    user_id: uuid("user_id").primaryKey(),

    /**
     * Markdown-formatted brand voice profile.
     * Edited by user or updated by agent after onboarding conversation.
     */
    profile_markdown: text("profile_markdown").notNull(),

    /**
     * Tone descriptor tags from the profile conversation.
     * e.g., ['warm', 'concise', 'playful']
     */
    tone_tags: text("tone_tags").array().default([]),

    /** Phrases the brand never uses (e.g., 'synergy', 'leverage') */
    forbidden_phrases: text("forbidden_phrases").array().default([]),

    /** URL of a representative content sample (nullable) */
    example_url: text("example_url"),

    /** Row last-update timestamp (NOT NULL; kept current by trigger) */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * RLS policy: user_id IS the PK so this is trivially enforced,
     * but the policy is still needed for Supabase RLS completeness.
     */
    pgPolicy("brand_voice_profiles_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── brand_voice_samples ───────────────────────────────────────────────────────

export const brandVoiceSamples = pgTable(
  "brand_voice_samples",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /** The sample text (product description, past email, etc.) */
    sample_text: text("sample_text").notNull(),

    /**
     * Voyage AI voyage-4 embedding (1024 dims) for voice-matching similarity search.
     * HNSW index for cosine similarity; params in migration SQL.
     */
    embedding: vector("embedding", { dimensions: 1024 }),

    /**
     * How this sample was added.
     * 'onboarding' | 'past_product_description' | 'user_provided'
     */
    source: text("source"),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * HNSW index for cosine similarity search on brand voice samples.
     * Parameters m=16, ef_construction=64 set in migration SQL.
     */
    index("idx_brand_voice_samples_hnsw").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),

    /** btree index on user_id for pre-filtering before vector search */
    index("idx_brand_voice_samples_user_id").on(table.user_id),

    /**
     * RLS policy: authenticated users can only access their own samples.
     */
    pgPolicy("brand_voice_samples_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
