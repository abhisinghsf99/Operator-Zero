-- 0007_workflow_versions_rls.sql
-- Fix: workflow_versions has RLS enabled on the live database but NO policy,
-- so default-deny rejected every write (PostgresError: new row violates
-- row-level security policy for table "workflow_versions"). Hit during the
-- Phase 4 final gate: onboarding's createStarterWorkflows inserts a workflow
-- (passes workflows_user_policy) then its initial version row (denied).
--
-- Every other public user-data table carries ENABLE ROW LEVEL SECURITY + a
-- _user_policy (constraint: "Multi-tenant from day one ... RLS enforces it").
-- workflow_versions was the lone omission: migration 0003 created the table +
-- index but never added a policy. It has no user_id column of its own, so
-- ownership is enforced via its parent workflow row.
--
-- Applied via: supabase db push over the session pooler (port 5432).
-- Never use MCP apply_migration — it lacks project-write permission for this project.
-- Forward-only. Idempotent (ENABLE RLS is a no-op if already on; DROP POLICY IF EXISTS + CREATE POLICY).

ALTER TABLE "workflow_versions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_versions_user_policy" ON "workflow_versions";

-- Ownership is inherited from the parent workflow (FK workflow_id → workflows.id).
-- The EXISTS subquery runs under the authenticated role and is itself subject to
-- workflows_user_policy, so it only matches workflows owned by the current user.
-- Within an INSERT transaction the just-inserted parent workflow row is visible to
-- this WITH CHECK, so onboarding's two-step insert (workflow → version) passes.
CREATE POLICY "workflow_versions_user_policy" ON "workflow_versions"
    AS PERMISSIVE FOR ALL TO "authenticated"
    USING (
        EXISTS (
            SELECT 1 FROM "workflows" w
            WHERE w."id" = "workflow_versions"."workflow_id"
              AND w."user_id" = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "workflows" w
            WHERE w."id" = "workflow_versions"."workflow_id"
              AND w."user_id" = (SELECT auth.uid())
        )
    );
