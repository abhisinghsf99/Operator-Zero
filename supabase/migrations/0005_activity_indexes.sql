-- 0005_activity_indexes.sql
-- Phase 3: composite indexes for Activity log filter performance (ACT-07)
--          + Realtime RLS policies for activity:<userId> and runs:<workflowId> channels.
-- Applied via: npx supabase db push (never drizzle-kit migrate)
-- Forward-only. Idempotent (CREATE INDEX IF NOT EXISTS, drop-if-exists then create).

-- ── Composite indexes on activity_entries ─────────────────────────────────────

-- Compound index for workflow filter + time sort (most common filter combo)
-- Partial index: only rows where workflow_id IS NOT NULL (sparse — excludes
-- direct chat actions with no workflow, keeping index smaller and faster).
CREATE INDEX IF NOT EXISTS "idx_activity_user_workflow_time"
  ON "activity_entries" USING btree ("user_id", "workflow_id", "occurred_at" DESC)
  WHERE "workflow_id" IS NOT NULL;

-- Compound index for result filter + time sort
CREATE INDEX IF NOT EXISTS "idx_activity_user_result_time"
  ON "activity_entries" USING btree ("user_id", "result", "occurred_at" DESC);

-- Compound index for automation level filter + time sort
-- Partial index: only rows where automation_level IS NOT NULL (excludes
-- direct chat actions, keeping index tight).
CREATE INDEX IF NOT EXISTS "idx_activity_user_level_time"
  ON "activity_entries" USING btree ("user_id", "automation_level", "occurred_at" DESC)
  WHERE "automation_level" IS NOT NULL;

-- ── Realtime RLS policies ──────────────────────────────────────────────────────

-- realtime.messages has RLS enabled by default on Supabase; ensure it.
ALTER TABLE IF EXISTS "realtime"."messages" ENABLE ROW LEVEL SECURITY;

-- ── activity:<userId> — user can receive their own activity channel ────────────
-- Simpler than thread/approval channels: direct UUID equality check (no subquery).
-- The userId encoded in the channel name must equal the JWT subject.
DROP POLICY IF EXISTS "authn can receive own activity channel" ON "realtime"."messages";
CREATE POLICY "authn can receive own activity channel"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^activity:[0-9a-fA-F-]{36}$'
    AND (split_part(realtime.topic(), ':', 2))::uuid = (SELECT auth.uid())
  );

-- ── runs:<workflowId> — user can receive run updates for workflows they own ────
-- Uses an EXISTS subquery on workflow_runs to verify the requesting user owns
-- at least one run for the workflow_id encoded in the channel name.
-- Alternative: verify against workflows table directly — both are equivalent
-- for ownership; workflow_runs is used here since it is the table being
-- streamed (defense-in-depth: same FK chain as the data being received).
DROP POLICY IF EXISTS "authn can receive own runs channel" ON "realtime"."messages";
CREATE POLICY "authn can receive own runs channel"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^runs:[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.workflow_runs wr
      WHERE wr.workflow_id = (split_part(realtime.topic(), ':', 2))::uuid
        AND wr.user_id = (SELECT auth.uid())
    )
  );

-- Any topic matching neither pattern, or not owned by the requester, is denied
-- by default (no permissive policy grants it). Public channels (private:false)
-- bypass realtime.messages RLS and are unaffected.
