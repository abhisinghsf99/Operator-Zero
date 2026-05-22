/**
 * tests/unit/integration-health.test.ts
 * INTEG-06: Integration health detection (stale/expired)
 *
 * Tests connection health logic — detecting stale last_synced_at, expired tokens,
 * and surfacing reconnect paths.
 *
 * All tests use classifyIntegrationHealth() which is a pure function (no DB access).
 *
 * Requirement: INTEG-06 — Connection health visible; broken tokens surface reconnect path
 */
import { describe, it, expect, beforeEach } from "vitest";

describe("INTEG-06 — Integration health detection (stale/expired)", () => {
  let classifyIntegrationHealth: (
    status: string | null | undefined,
    last_synced_at: Date | null | undefined,
    provider: string,
    now?: Date
  ) => {
    status: string;
    badge_color: string;
    last_synced_at: Date | null;
    reconnect_path: string | null;
    requires_action: boolean;
  };

  beforeEach(async () => {
    const mod = await import("@/lib/integrations/health");
    classifyIntegrationHealth = mod.classifyIntegrationHealth;
  });

  // ── Stale detection ────────────────────────────────────────────────────────

  it("marks integration as stale if last_synced_at is more than 24 hours ago", () => {
    const now = new Date("2024-01-15T12:00:00Z");
    const last_synced_at = new Date("2024-01-14T11:00:00Z"); // 25h ago
    const health = classifyIntegrationHealth("active", last_synced_at, "shopify", now);

    expect(health.status).toBe("stale");
    expect(health.badge_color).toBe("yellow");
  });

  it("marks integration as healthy if last_synced_at is within 24 hours", () => {
    const now = new Date("2024-01-15T12:00:00Z");
    const last_synced_at = new Date("2024-01-15T10:00:00Z"); // 2h ago
    const health = classifyIntegrationHealth("active", last_synced_at, "shopify", now);

    expect(health.status).toBe("healthy");
    expect(health.badge_color).toBe("green");
  });

  it("marks integration as stale if last_synced_at is exactly 24h+1s ago", () => {
    const now = new Date("2024-01-15T12:00:01Z");
    const last_synced_at = new Date("2024-01-14T12:00:00Z"); // 24h+1s ago
    const health = classifyIntegrationHealth("active", last_synced_at, "shopify", now);

    expect(health.status).toBe("stale");
  });

  it("marks integration as stale if last_synced_at is null (never synced)", () => {
    const health = classifyIntegrationHealth("active", null, "shopify");
    expect(health.status).toBe("stale");
    expect(health.badge_color).toBe("yellow");
    expect(health.last_synced_at).toBeNull();
  });

  // ── Expired / revoked ──────────────────────────────────────────────────────

  it("marks integration as expired if status = 'expired'", () => {
    const health = classifyIntegrationHealth("expired", new Date(), "shopify");
    expect(health.status).toBe("needs_reconnect");
    expect(health.badge_color).toBe("red");
  });

  it("marks integration as revoked if status = 'revoked'", () => {
    const health = classifyIntegrationHealth("revoked", new Date(), "shopify");
    expect(health.status).toBe("needs_reconnect");
    expect(health.badge_color).toBe("red");
  });

  // ── Badge colors ───────────────────────────────────────────────────────────

  it("health check returns correct badge color: green=healthy, yellow=stale, red=expired/revoked", () => {
    const now = new Date("2024-01-15T12:00:00Z");
    const recentSync = new Date("2024-01-15T11:00:00Z"); // 1h ago
    const oldSync = new Date("2024-01-13T12:00:00Z"); // 48h ago

    const healthy = classifyIntegrationHealth("active", recentSync, "shopify", now);
    const stale = classifyIntegrationHealth("active", oldSync, "shopify", now);
    const expired = classifyIntegrationHealth("expired", null, "shopify", now);
    const revoked = classifyIntegrationHealth("revoked", null, "shopify", now);

    expect(healthy.badge_color).toBe("green");
    expect(stale.badge_color).toBe("yellow");
    expect(expired.badge_color).toBe("red");
    expect(revoked.badge_color).toBe("red");
  });

  // ── Reconnect path ─────────────────────────────────────────────────────────

  it("surfaces reconnect path for expired or revoked integrations", () => {
    const expiredHealth = classifyIntegrationHealth("expired", null, "shopify");
    const revokedHealth = classifyIntegrationHealth("revoked", null, "shopify");

    expect(expiredHealth.reconnect_path).toBe("/api/integrations/shopify/connect");
    expect(expiredHealth.requires_action).toBe(true);
    expect(revokedHealth.reconnect_path).toBe("/api/integrations/shopify/connect");
    expect(revokedHealth.requires_action).toBe(true);
  });

  it("does not expose reconnect_path for healthy or stale integrations", () => {
    const now = new Date("2024-01-15T12:00:00Z");
    const recentSync = new Date("2024-01-15T11:00:00Z");
    const oldSync = new Date("2024-01-13T12:00:00Z");

    const healthy = classifyIntegrationHealth("active", recentSync, "shopify", now);
    const stale = classifyIntegrationHealth("active", oldSync, "shopify", now);

    expect(healthy.reconnect_path).toBeNull();
    expect(stale.reconnect_path).toBeNull();
  });

  // ── Raw token abstraction ──────────────────────────────────────────────────

  it("health check does not expose raw token status to client (status abstracted)", () => {
    // classifyIntegrationHealth returns a typed status ('healthy'|'stale'|'needs_reconnect')
    // NOT the raw integrations.status field ('active'|'expired'|'revoked')
    const health = classifyIntegrationHealth("active", new Date(), "shopify");

    // The raw 'active' status is abstracted to 'healthy' or 'stale'
    expect(health.status).not.toBe("active");
    expect(["healthy", "stale", "needs_reconnect"]).toContain(health.status);
  });

  it("marks no-integration as needs_reconnect", () => {
    const health = classifyIntegrationHealth(null, null, "shopify");
    expect(health.status).toBe("needs_reconnect");
    expect(health.badge_color).toBe("red");
    expect(health.requires_action).toBe(true);
  });

  // ── getIntegrationHealth export ────────────────────────────────────────────

  it("getIntegrationHealth is exported from health.ts", async () => {
    const mod = await import("@/lib/integrations/health");
    expect(typeof mod.getIntegrationHealth).toBe("function");
    expect(typeof mod.classifyIntegrationHealth).toBe("function");
  });
});
