/**
 * lib/db/schema/user-sessions.ts
 * Drizzle schema for the user_sessions table.
 *
 * Custom session registry required because Supabase Auth does not expose
 * per-session device/location metadata or per-session revoke via the public
 * API. D-10 (locked decision): record device/browser (UA), coarse location,
 * last-seen on login/activity; support per-session revoke and "Sign out
 * everywhere" (AUTH-04/05).
 *
 * FK to auth.users(id) ON DELETE CASCADE is declared in the migration SQL
 * (not expressible in Drizzle for cross-schema FK to auth schema).
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
 *
 * THREAT MODEL:
 *   T-4-01-01 (Information Disclosure — session registry): RLS policy
 *   using (SELECT auth.uid()) = user_id; refresh_token_hash stored,
 *   never plaintext token.
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

export const userSessions = pgTable(
  "user_sessions",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL (cross-schema — cannot express in Drizzle).
     */
    user_id: uuid("user_id").notNull(),

    /**
     * Supabase session_id JWT claim — used to correlate with Supabase Auth
     * sessions for revocation. Nullable (may not be available on all flows).
     */
    supabase_session_id: text("supabase_session_id"),

    /**
     * Hash of the refresh token for single-session revoke lookup.
     * Never store the raw refresh token.
     */
    refresh_token_hash: text("refresh_token_hash"),

    /**
     * Human-readable device label parsed from the user-agent.
     * Example: "Chrome on macOS". NOT NULL — always computed from UA.
     */
    device_label: text("device_label").notNull(),

    /** Full user-agent string for audit / re-parsing. Nullable. */
    raw_ua: text("raw_ua"),

    /**
     * Coarse geographic label derived from IP headers.
     * Example: "New York, US (approximate)". Nullable (unavailable in some envs).
     */
    ip_geo_label: text("ip_geo_label"),

    /**
     * Last time this session was seen active (updated on login / activity).
     * NOT NULL — set on insert, updated on activity.
     */
    last_seen_at: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * Set when the session is explicitly revoked (per-session revoke or
     * "Sign out everywhere"). Nullable — null means still active.
     */
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * Primary query pattern: load sessions by user + recency.
     * Covers AUTH-04 session list query.
     */
    index("idx_user_sessions_user").on(table.user_id, table.last_seen_at),

    /**
     * RLS policy: authenticated users can only access their own session rows.
     */
    pgPolicy("user_sessions_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
