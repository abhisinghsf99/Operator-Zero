/**
 * tests/unit/shopify-oauth.test.ts
 * Wave-0 scaffold — INTEG-01: Shopify OAuth HMAC + state-nonce verification
 *
 * Tests Shopify OAuth HMAC verification and state-nonce CSRF protection.
 * These tests are RED until Plan 03 (Integrations) implements the OAuth handlers.
 *
 * Requirement: INTEG-01 — Shopify OAuth with minimum scopes; handshake <60s p50
 */
import { describe, it, expect } from "vitest";

describe("INTEG-01 — Shopify OAuth HMAC + state-nonce verification", () => {
  it.todo("verifies HMAC signature using HMAC-SHA256 of params excluding hmac field");

  it.todo("rejects request with invalid HMAC (returns 400, does not write to DB)");

  it.todo("validates state nonce matches the stored nonce (CSRF protection)");

  it.todo("rejects request with unknown or expired state nonce");

  it.todo("validates shop param is a .myshopify.com domain (no open-redirect)");

  it.todo("rejects shop params that are absolute external URLs");

  it.todo("exchanges code for access token and stores encrypted in DB");

  it.todo("fires inngest shopify.connected event after successful OAuth");

  it.todo("stores minimum required scopes in integrations table");
});
