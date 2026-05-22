-- 0004_realtime_authz.sql
-- Phase 2 security remediation: Supabase Realtime channel authorization.
--
-- Closes T-2-06-05 (Realtime cross-user thread leakage) and T-2-07-04 (Realtime
-- cross-user approval/run leakage). The client sets { private: true } on the
-- `thread:<id>` and `approval:<id>` channels, but private channels are only
-- enforced server-side when matching RLS policies exist on `realtime.messages`.
-- Without these policies a private join was either unauthorized-by-default
-- (deny) or unverified — either way the ownership guarantee was not server-side.
--
-- Authorization model: for a private channel, Realtime checks the subscriber's
-- JWT (via supabase.realtime.setAuth() on the client) against SELECT policies on
-- realtime.messages, keyed on realtime.topic(). We parse the owning row id out of
-- the topic and confirm the authenticated user owns it. postgres_changes payloads
-- are additionally scoped by each source table's own RLS (defense in depth).
--
-- Forward-only. Idempotent (drop-if-exists then create).

-- realtime.messages has RLS enabled by default on Supabase; ensure it.
ALTER TABLE IF EXISTS "realtime"."messages" ENABLE ROW LEVEL SECURITY;

-- ── thread:<uuid> — owner of the thread may receive on the channel ────────────
DROP POLICY IF EXISTS "authn can receive own thread channel" ON "realtime"."messages";
CREATE POLICY "authn can receive own thread channel"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^thread:[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = (split_part(realtime.topic(), ':', 2))::uuid
        AND t.user_id = (SELECT auth.uid())
    )
  );

-- ── approval:<uuid> — owner of the approval may receive on the channel ────────
DROP POLICY IF EXISTS "authn can receive own approval channel" ON "realtime"."messages";
CREATE POLICY "authn can receive own approval channel"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^approval:[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.approvals a
      WHERE a.id = (split_part(realtime.topic(), ':', 2))::uuid
        AND a.user_id = (SELECT auth.uid())
    )
  );

-- Any topic matching neither pattern, or not owned by the requester, is denied
-- by default (no permissive policy grants it). Public channels (private:false)
-- bypass realtime.messages RLS and are unaffected.
