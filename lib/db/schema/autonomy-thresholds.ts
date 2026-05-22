/**
 * lib/db/schema/autonomy-thresholds.ts
 * Drizzle schema for the autonomy_thresholds table.
 *
 * Per-user automation level defaults + per-action overrides.
 * One row per user (user_id IS PK).
 * Column names match DATA-FLOW.md §6.1 verbatim.
 *
 * MULTI-TENANT: user_id (PK) + RLS policy enforce isolation.
 *   Workflow-level automation level overrides the global default.
 *   Per-action overrides in per_action_overrides JSONB win over all.
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
  jsonb,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const autonomyThresholds = pgTable(
  "autonomy_thresholds",
  {
    /**
     * PK — user_id IS the primary key (one row per user).
     * FK to auth.users(id) ON DELETE CASCADE expressed in migration SQL.
     */
    user_id: uuid("user_id").primaryKey(),

    /**
     * User's global default automation level.
     * 'L1' | 'L2' | 'L3' — default is L2 for new users.
     */
    default_level: text("default_level").notNull().default("L2"),

    /**
     * Per-action level overrides.
     * Shape: { "price_change": "L2", "send_email": "L2", "update_product": "L3", ... }
     * Empty object = no overrides; use default_level for all actions.
     */
    per_action_overrides: jsonb("per_action_overrides").notNull().default({}),

    /** Row last-update timestamp (NOT NULL; kept current by trigger) */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * RLS policy: user_id IS the PK so inherently isolated.
     * Policy still required for Supabase RLS completeness.
     */
    pgPolicy("autonomy_thresholds_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
