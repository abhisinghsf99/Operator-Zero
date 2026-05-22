-- 0006_phase4_sessions_exports.sql
-- Phase 4: Session registry + export job status + performance indexes
--
-- Closes:
--   D-10    — Custom session registry (AUTH-04/05): user_sessions table
--   SET-06  — Export job status table (user_exports)
--   UX-04   — Performance indexes for approvals pending-list and My Workflows
--
-- Applied via: supabase db push over the session pooler (port 5432).
-- Never use MCP apply_migration — it lacks project-write permission for this project.
-- Forward-only. Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE POLICY throughout).

-- ── user_sessions — Custom session registry (AUTH-04/05 / D-10) ─────────────

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "supabase_session_id" text,
  "refresh_token_hash"  text,
  "device_label"        text NOT NULL,
  "raw_ua"              text,
  "ip_geo_label"        text,
  "last_seen_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at"          timestamp with time zone
);

ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;

-- Composite index: session list by user + recency (AUTH-04 primary query)
CREATE INDEX IF NOT EXISTS "idx_user_sessions_user"
  ON "user_sessions" USING btree ("user_id", "last_seen_at" DESC);

-- RLS policy: authenticated users can only access their own session rows
DROP POLICY IF EXISTS "user_sessions_user_policy" ON "user_sessions";
CREATE POLICY "user_sessions_user_policy"
  ON "user_sessions"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = "user_id")
  WITH CHECK ((SELECT auth.uid()) = "user_id");

-- ── user_exports — Export job status (SET-06 / D-08) ────────────────────────

CREATE TABLE IF NOT EXISTS "user_exports" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "status"       text NOT NULL DEFAULT 'pending',
  "signed_url"   text,
  "object_path"  text,
  "error"        text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);

ALTER TABLE "user_exports" ENABLE ROW LEVEL SECURITY;

-- Composite index: export list by user + recency (Settings UI — most recent first)
CREATE INDEX IF NOT EXISTS "idx_user_exports_user"
  ON "user_exports" USING btree ("user_id", "created_at" DESC);

-- RLS policy: authenticated users can only access their own export rows
DROP POLICY IF EXISTS "user_exports_user_policy" ON "user_exports";
CREATE POLICY "user_exports_user_policy"
  ON "user_exports"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = "user_id")
  WITH CHECK ((SELECT auth.uid()) = "user_id");

-- ── Performance indexes (UX-04) ──────────────────────────────────────────────

-- Approvals: pending-list query (stakes-desc sort, snoozed_until filter)
-- Partial index: only pending rows — keeps index tight and fast for the common case.
CREATE INDEX IF NOT EXISTS "idx_approvals_user_pending_stakes"
  ON "approvals" USING btree ("user_id", "stakes", "created_at" DESC)
  WHERE status = 'pending';

-- Workflows: My Workflows surface (user_id + status + recency)
CREATE INDEX IF NOT EXISTS "idx_workflows_user_status"
  ON "workflows" USING btree ("user_id", "status", "updated_at" DESC);
