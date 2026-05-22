-- Phase 1 code-review fixes: WR-02 + WR-03
-- Schema hardening — auto-updated_at trigger + CHECK constraints
--
-- Apply via: npx supabase db push   (do NOT use drizzle-kit migrate)
-- Created: 2026-05-21
-- Status: UNAPPLIED — orchestrator owns the apply decision.
--
-- WR-02: BEFORE UPDATE trigger that keeps user_profiles.updated_at current.
--   Without this trigger, UPDATE statements that omit updated_at leave the
--   column stale at the row's creation timestamp, corrupting audit visibility.
--
-- WR-03: CHECK constraints on integrations.provider and integrations.status.
--   The valid sets are documented in the schema comments (lib/db/schema/integrations.ts):
--     provider: 'shopify' | 'gmail'
--     status:   'active' | 'expired' | 'revoked'
--   Without DB-level enforcement, any string can be persisted — bypassing the
--   Zod schema layer when serviceDb (RLS-bypass) writes directly.

-- ─── WR-02: auto-update user_profiles.updated_at ─────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── WR-03: CHECK constraints on integrations.provider and integrations.status ─

ALTER TABLE integrations
  ADD CONSTRAINT integrations_provider_check
    CHECK (provider IN ('shopify', 'gmail')),
  ADD CONSTRAINT integrations_status_check
    CHECK (status IN ('active', 'expired', 'revoked'));
