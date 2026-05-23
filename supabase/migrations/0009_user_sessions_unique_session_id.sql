-- 0009_user_sessions_unique_session_id.sql
-- Fix: recordSession() upserts with .onConflictDoUpdate({ target: supabase_session_id })
-- but user_sessions.supabase_session_id had no unique constraint. Postgres validates
-- the ON CONFLICT target at plan time regardless of whether a row conflicts, so EVERY
-- recordSession insert threw "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification". The error was swallowed by the login callback's catch
-- block, so login still worked — but NO session row was ever written, leaving the
-- Sessions list (AUTH-04) permanently empty and per-session revoke with nothing to act on.
--
-- Closes:
--   AUTH-04 (functional) — session registry rows are actually persisted on login
--   Verifier WARNING — user_sessions upsert target had no matching unique constraint
--
-- supabase_session_id is nullable; a UNIQUE constraint permits multiple NULLs in
-- Postgres, and recordSession already skips the insert entirely when it is null
-- (so only non-null session ids ever reach the upsert).
--
-- Applied via: supabase db push over the session pooler (port 5432).
-- Never use MCP apply_migration — it lacks project-write permission for this project.
-- Forward-only. Idempotent (DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT).
--
-- HUMAN ACTION REQUIRED: apply before relying on the Sessions settings list. If the
-- table already has duplicate non-null supabase_session_id values (unlikely, since the
-- bug meant nothing was ever inserted), deduplicate first:
--
--   DELETE FROM user_sessions a USING user_sessions b
--   WHERE a.supabase_session_id = b.supabase_session_id
--     AND a.supabase_session_id IS NOT NULL AND a.ctid < b.ctid;

-- ── UNIQUE(supabase_session_id) on user_sessions ─────────────────────────────

ALTER TABLE "user_sessions"
  DROP CONSTRAINT IF EXISTS "user_sessions_supabase_session_id_unique";

ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_supabase_session_id_unique" UNIQUE ("supabase_session_id");
