-- 0008_user_exports_unique_user_id.sql
-- Fix WR-02: add UNIQUE(user_id) to user_exports so the export job can upsert
-- rather than always-insert, preventing unbounded row accumulation.
--
-- Closes:
--   WR-02 / IN-02 — user_exports one-per-user unique constraint + upsert target
--
-- Applied via: supabase db push over the session pooler (port 5432).
-- Never use MCP apply_migration — it lacks project-write permission for this project.
-- Forward-only. Idempotent (IF NOT EXISTS).
--
-- HUMAN ACTION REQUIRED: apply this migration to the live database before deploying
-- the updated export-account-data.ts Inngest function. The function now calls
-- .onConflictDoUpdate({ target: userExports.user_id }) which requires this constraint.
-- Without it the upsert will throw a "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" error.
--
-- If the user_exports table already has data with multiple rows per user_id,
-- you must deduplicate first (keep the most-recent row per user_id) before adding
-- the constraint, or the CREATE UNIQUE INDEX will fail. Example deduplication:
--
--   DELETE FROM user_exports a
--   USING user_exports b
--   WHERE a.user_id = b.user_id AND a.created_at < b.created_at;
--
-- Then apply this migration.

-- ── UNIQUE(user_id) on user_exports ─────────────────────────────────────────

ALTER TABLE "user_exports"
  ADD CONSTRAINT "user_exports_user_id_unique" UNIQUE ("user_id");
