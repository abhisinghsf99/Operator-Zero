/**
 * lib/db/schema/integrations.ts
 * Drizzle schema for the integrations table.
 *
 * One row per connected external service per user (Shopify, Gmail in v1).
 * Column names match DATA-FLOW.md §2.2 verbatim.
 *
 * SECURITY CRITICAL:
 *   - access_token_encrypted is ALWAYS ciphertext (lib/integrations/crypto.ts).
 *     Plaintext tokens NEVER enter this column.
 *   - user_id FK references auth.users ON DELETE CASCADE (not managed in Drizzle
 *     but expressed in the migration SQL generated from this schema).
 *
 * MULTI-TENANT: user_id + RLS policy + UNIQUE(user_id, provider) enforce isolation.
 *
 * THREAT MODEL:
 *   T-1-02-01 (cross-user access): RLS policy using auth.uid() = user_id
 *   T-1-02-02 (token at rest): access_token_encrypted is notNull ciphertext
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgPolicy,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const integrations = pgTable(
  "integrations",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK is expressed in the migration SQL (Drizzle .references() with sql
     * cannot cross schemas, so the FK is written directly in the migration).
     */
    user_id: uuid("user_id").notNull(),

    /** Integration provider: 'shopify' | 'gmail' (v1) */
    provider: text("provider").notNull(),

    /** Token status: 'active' | 'expired' | 'revoked' */
    status: text("status").notNull(),

    /**
     * Libsodium secretbox ciphertext (base64). NEVER plaintext.
     * Encrypted/decrypted by lib/integrations/crypto.ts.
     */
    access_token_encrypted: text("access_token_encrypted").notNull(),

    /** Encrypted refresh token (nullable — not all providers use refresh tokens) */
    refresh_token_encrypted: text("refresh_token_encrypted"),

    /** OAuth scopes granted by the user */
    scopes: text("scopes").array().notNull(),

    /** Provider's account identifier: shop domain, Gmail user ID, etc. (nullable) */
    provider_account_id: text("provider_account_id"),

    /** Last successful sync timestamp (nullable) */
    last_synced_at: timestamp("last_synced_at", { withTimezone: true }),

    /** Last error message, if any (nullable) */
    last_error: text("last_error"),

    /** When the integration was first connected (NOT NULL, auto-set) */
    connected_at: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Token expiry timestamp (nullable — some tokens are long-lived) */
    expires_at: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * One connection per provider per user in v1.
     * UNIQUE (user_id, provider) — enforced in DB and expressed here.
     */
    unique("integrations_user_provider_unique").on(
      table.user_id,
      table.provider
    ),

    /**
     * Index for fast lookup by user + provider (primary query pattern).
     */
    index("idx_integrations_user_provider").on(table.user_id, table.provider),

    /**
     * RLS policy: authenticated users can only see/modify their own rows.
     * (SELECT auth.uid()) avoids per-row plan cache invalidation.
     */
    pgPolicy("integrations_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
