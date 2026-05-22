/**
 * lib/db/schema/users.ts
 * Drizzle schema for the user_profiles table.
 *
 * Extends auth.users (Supabase-managed) with app-level profile data.
 * Column names match DATA-FLOW.md §2.1 verbatim.
 *
 * MULTI-TENANT: user_id is both PK and the RLS tenant discriminator.
 * RLS policy: (SELECT auth.uid()) = user_id — prevents cross-user access.
 *
 * THREAT MODEL: T-1-02-01 (cross-user row access) — mitigated by RLS policy here.
 */
import { pgTable, uuid, text, timestamp, pgPolicy, integer } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const userProfiles = pgTable(
  "user_profiles",
  {
    /** PK — references auth.users(id) ON DELETE CASCADE */
    user_id: uuid("user_id").primaryKey(),

    /** Display name shown in the UI (nullable) */
    display_name: text("display_name"),

    /** Avatar URL (nullable) */
    avatar_url: text("avatar_url"),

    /** Shopify shop domain, e.g. "acme-store.myshopify.com" (nullable) */
    shopify_shop: text("shopify_shop"),

    /**
     * Current onboarding step (0 = not started; 1-5 = in progress; null or check onboarding_completed_at for done).
     * Added in migration 0003 (Phase 2). Used by ONBOARD-06 to resume interrupted onboarding.
     */
    onboarding_step: integer("onboarding_step").default(0),

    /** Timestamp when onboarding was completed (nullable) */
    onboarding_completed_at: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),

    /** Soft-delete: 7-day grace period before account deletion (nullable) */
    deletion_requested_at: timestamp("deletion_requested_at", {
      withTimezone: true,
    }),

    /** Row creation timestamp (NOT NULL, auto-set) */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Row last-update timestamp (NOT NULL, auto-set; updated by app code) */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * RLS policy: authenticated users can only see/modify their own row.
     * Using (SELECT auth.uid()) instead of bare auth.uid() prevents plan cache
     * invalidation per row — recommended by Supabase RLS docs.
     */
    pgPolicy("user_profiles_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
