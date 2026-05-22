/**
 * lib/db/schema/user-exports.ts
 * Drizzle schema for the user_exports table.
 *
 * Tracks Inngest export-account-data background job status (SET-06 / D-08).
 * The export job assembles a JSON bundle, uploads it to the private
 * "user-exports" Supabase Storage bucket, and surfaces the signed URL here.
 * The Settings UI polls this table (or subscribes via Realtime) to show
 * "Preparing export..." → download link.
 *
 * Downloads are via time-limited signed URL only (24h). The bucket is PRIVATE
 * (service-role access only) — never a public object.
 *
 * FK to auth.users(id) ON DELETE CASCADE is declared in the migration SQL.
 *
 * MULTI-TENANT: user_id + RLS policy enforce per-user isolation.
 *
 * THREAT MODEL:
 *   T-4-01-02 (Information Disclosure — export table + bucket): RLS on table;
 *   bucket is PRIVATE (service-role only); downloads via 24h signed URL only.
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

export const userExports = pgTable(
  "user_exports",
  {
    /** PK — auto-generated UUID */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /**
     * Export job status.
     * 'pending' — job initiated, assembling bundle
     * 'ready'   — signed URL available in signed_url column
     * 'failed'  — job failed; error details in error column
     */
    status: text("status").notNull().default("pending"),

    /**
     * Time-limited signed URL (24h) for downloading the export bundle.
     * Null until status = 'ready'.
     */
    signed_url: text("signed_url"),

    /**
     * Storage object path in the "user-exports" bucket.
     * Example: "exports/<userId>/<timestamp>-export.json"
     * Null until upload completes.
     */
    object_path: text("object_path"),

    /**
     * Human-readable error message when status = 'failed'.
     * Null on success.
     */
    error: text("error"),

    /** Row creation timestamp — when the export was initiated. NOT NULL. */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * Timestamp when the export job completed (success or failure).
     * Null while still pending.
     */
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * Primary query pattern: load exports by user + recency.
     * Settings UI shows most recent export first.
     */
    index("idx_user_exports_user").on(table.user_id, table.created_at),

    /**
     * RLS policy: authenticated users can only access their own export rows.
     */
    pgPolicy("user_exports_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
