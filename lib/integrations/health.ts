/**
 * lib/integrations/health.ts
 * Integration health classifier — INTEG-06.
 *
 * Provides:
 *   - classifyIntegrationHealth(): compute health status from integration row
 *   - getShopifyHealth(): load integration + classify health for a user
 *
 * Health states:
 *   'healthy'        — status='active' AND last_synced_at < 24h ago
 *   'stale'          — status='active' AND last_synced_at >= 24h ago (or never synced)
 *   'needs_reconnect' — status='expired' or status='revoked' (or not found)
 *
 * Badge colors:
 *   healthy → green
 *   stale   → yellow
 *   needs_reconnect → red
 *
 * SECURITY: health status is abstracted — raw token values NEVER exposed to client.
 * Only the classified status string + last_synced_at timestamp are surfaced.
 */
import { serviceDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/** All possible health states. */
export type HealthStatus = "healthy" | "stale" | "needs_reconnect";

/** Badge color derived from health status. */
export type BadgeColor = "green" | "yellow" | "red";

export interface IntegrationHealth {
  status: HealthStatus;
  badge_color: BadgeColor;
  last_synced_at: Date | null;
  /** Reconnect path — non-null when status === 'needs_reconnect' */
  reconnect_path: string | null;
  /** Whether the user should be shown a reconnect prompt */
  requires_action: boolean;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Classify health from integration row data.
 * Pure function — no DB access. Used by tests directly.
 */
export function classifyIntegrationHealth(
  status: string | null | undefined,
  last_synced_at: Date | null | undefined,
  provider: string,
  now: Date = new Date()
): IntegrationHealth {
  const reconnect_path = `/api/integrations/${provider}/connect`;

  // Expired or revoked tokens → needs_reconnect (red)
  if (status === "expired" || status === "revoked") {
    return {
      status: "needs_reconnect",
      badge_color: "red",
      last_synced_at: last_synced_at ?? null,
      reconnect_path,
      requires_action: true,
    };
  }

  // No active integration (null/pending/unknown) → needs_reconnect
  if (status !== "active") {
    return {
      status: "needs_reconnect",
      badge_color: "red",
      last_synced_at: null,
      reconnect_path,
      requires_action: true,
    };
  }

  // Active — check last_synced_at freshness
  if (!last_synced_at) {
    // Never synced → stale
    return {
      status: "stale",
      badge_color: "yellow",
      last_synced_at: null,
      reconnect_path: null,
      requires_action: false,
    };
  }

  const age = now.getTime() - last_synced_at.getTime();
  if (age > STALE_THRESHOLD_MS) {
    // Synced but stale (>24h)
    return {
      status: "stale",
      badge_color: "yellow",
      last_synced_at,
      reconnect_path: null,
      requires_action: false,
    };
  }

  // Active and recently synced → healthy (green)
  return {
    status: "healthy",
    badge_color: "green",
    last_synced_at,
    reconnect_path: null,
    requires_action: false,
  };
}

/**
 * Load integration row and classify health for a user+provider pair.
 * Returns needs_reconnect if no integration row exists.
 */
export async function getIntegrationHealth(
  userId: string,
  provider: "shopify" | "gmail"
): Promise<IntegrationHealth> {
  const [row] = await serviceDb
    .select({
      status: integrations.status,
      last_synced_at: integrations.last_synced_at,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.user_id, userId),
        eq(integrations.provider, provider)
      )
    )
    .limit(1);

  if (!row) {
    return classifyIntegrationHealth(null, null, provider);
  }

  return classifyIntegrationHealth(row.status, row.last_synced_at, provider);
}
