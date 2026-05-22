/**
 * tests/unit/gmail-oauth.test.ts
 * Wave-0 scaffold — INTEG-04: Gmail OAuth + refresh-token handling
 *
 * Tests Gmail OAuth flow and the critical refresh-token lifecycle
 * (access_type=offline, token refresh on expiry).
 *
 * Requirement: INTEG-04 — Gmail OAuth (gmail.modify); skippable in onboarding with warning
 */
import { describe, it, expect } from "vitest";

describe("INTEG-04 — Gmail OAuth + refresh-token handling", () => {
  it.todo("initiates OAuth flow requesting access_type=offline + prompt=consent");

  it.todo("requests gmail.modify scope in OAuth authorization URL");

  it.todo("stores encrypted access_token and refresh_token in integrations table");

  it.todo("detects expired access token and refreshes using refresh_token");

  it.todo("updates integrations.expires_at after successful token refresh");

  it.todo("handles missing refresh_token gracefully (marks integration as expired)");

  it.todo("allows Gmail step to be skipped with explicit skipGmail flag");

  it.todo("shows reconnect warning if Gmail integration is missing during workflow");
});
