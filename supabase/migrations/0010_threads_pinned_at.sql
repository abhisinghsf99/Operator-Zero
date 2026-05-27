-- 0010_threads_pinned_at.sql
-- Add pinned_at column to threads table to support the chat ⋯ menu Pin/Unpin action.
-- The chat header More (⋯) popover (ChatHeaderMenu) lets users pin a thread to the
-- top of the sidebar. Pinned threads sort above the rest (NULLS LAST ordering on
-- pinned_at DESC). Unpinning clears the column back to NULL.
--
-- No new RLS policy is needed — threads_user_policy (for: all) already covers UPDATE
-- of this column via the existing withCheck: auth.uid() = user_id constraint.
-- No new index — idx_threads_user_last is sufficient for v1 sidebar loads; a dedicated
-- pin index can be added in v2 if ordering latency becomes measurable.
--
-- Applied via: supabase db push over the session pooler (port 5432).
-- Never use MCP apply_migration — it lacks project-write permission for this project.
-- Forward-only. Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- HUMAN ACTION REQUIRED: apply before pin/unpin works in prod. Run:
--
--   supabase db push --db-url "$DATABASE_URL"
--
-- (where DATABASE_URL points to the session pooler on port 5432, not the transaction
-- pooler on 6543). Pin actions will silently no-op until this migration is applied.

-- ── pinned_at on threads ──────────────────────────────────────────────────────

ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "pinned_at" timestamptz;
