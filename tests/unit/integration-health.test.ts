/**
 * tests/unit/integration-health.test.ts
 * Wave-0 scaffold — INTEG-06: Integration health detection (stale/expired)
 *
 * Tests connection health logic — detecting stale last_synced_at, expired tokens,
 * and surfacing reconnect paths.
 *
 * Requirement: INTEG-06 — Connection health visible; broken tokens surface reconnect path
 */
import { describe, it, expect } from "vitest";

describe("INTEG-06 — Integration health detection (stale/expired)", () => {
  it.todo("marks integration as stale if last_synced_at is more than 24 hours ago");

  it.todo("marks integration as healthy if last_synced_at is within 24 hours");

  it.todo("marks integration as expired if status = 'expired'");

  it.todo("marks integration as revoked if status = 'revoked'");

  it.todo("health check returns correct badge color: green=healthy, yellow=stale, red=expired/revoked");

  it.todo("surfaces reconnect path for expired or revoked integrations");

  it.todo("health check does not expose raw token status to client (status abstracted)");
});
