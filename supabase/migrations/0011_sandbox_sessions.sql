-- 0011_sandbox_sessions.sql
-- Demo sandbox: per-visitor ephemeral session registry.
--
-- Each anonymous demo visitor gets one row here on entry (enterSandbox). The
-- TTL-sweep cron (lib/inngest/functions/sandbox-sweep.ts) uses it to find and
-- tear down abandoned sandboxes whose tab-close beacon never fired.
--
-- Applied via: supabase db push over the session pooler (port 5432).
-- Never use MCP apply_migration — it lacks project-write permission for this project.
-- Forward-only. Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE POLICY).

CREATE TABLE IF NOT EXISTS "sandbox_sessions" (
  "user_id"      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "sandbox_sessions" ENABLE ROW LEVEL SECURITY;

-- TTL-sweep query: find sandboxes idle past the cutoff.
CREATE INDEX IF NOT EXISTS "idx_sandbox_sessions_last_seen"
  ON "sandbox_sessions" USING btree ("last_seen_at");

-- RLS self-policy (defensive — only serviceDb, which bypasses RLS, touches this
-- table; visitors never query it directly).
DROP POLICY IF EXISTS "sandbox_sessions_user_policy" ON "sandbox_sessions";
CREATE POLICY "sandbox_sessions_user_policy"
  ON "sandbox_sessions"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = "user_id")
  WITH CHECK ((SELECT auth.uid()) = "user_id");
