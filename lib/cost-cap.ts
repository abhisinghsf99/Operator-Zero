/**
 * lib/cost-cap.ts
 * Per-user daily cost cap enforcement using Upstash Redis.
 *
 * AUTH-07: Hard/soft cap logic prevents runaway LLM spend.
 *   - Soft cap (80% of SOFT_CAP_USD): injects warning into system prompt
 *   - Hard cap (100% of HARD_CAP_USD): disables write tools; chat continues degraded
 *
 * Pattern: analog of lib/rate-limit.ts (Upstash Redis utility, Redis.fromEnv()).
 *
 * Redis key format: `oz:cost:{userId}:{YYYY-MM-DD}`
 *   - incrbyfloat for atomic increment
 *   - 25h TTL ensures the key expires after midnight UTC + 1h buffer
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars.
 * SECURITY (T-2-05-02): consulted BEFORE every LLM call in runtime.ts.
 * NOTE: SOFT_CAP_USD / HARD_CAP_USD are [ASSUMED] placeholder thresholds
 *   (RESEARCH.md Assumption A4). Tune from beta usage data before GA.
 *
 * Exports:
 *   checkCostCap(userId)          → 'ok' | 'soft' | 'hard'
 *   recordCost(userId, costUsd)   → void (atomic increment + TTL)
 *   SOFT_CAP_USD                  → configurable via env (default $5)
 *   HARD_CAP_USD                  → configurable via env (default $5)
 */

import { Redis } from "@upstash/redis";

// ─── Redis singleton ──────────────────────────────────────────────────────────

// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// These are server-only env vars — never NEXT_PUBLIC_
const redis = Redis.fromEnv();

// ─── Cap thresholds ───────────────────────────────────────────────────────────

/**
 * Soft cap in USD per user per day.
 * When spend reaches 80% of this value → 'soft' (warning injected into prompt).
 * [ASSUMED] placeholder — tune from beta data (RESEARCH.md A4).
 */
export const SOFT_CAP_USD: number = parseFloat(
  process.env["COST_SOFT_CAP_USD"] ?? "5.00"
);

/**
 * Hard cap in USD per user per day.
 * When spend reaches this value → 'hard' (write tools disabled; chat continues).
 * [ASSUMED] placeholder — tune from beta data (RESEARCH.md A4).
 */
export const HARD_CAP_USD: number = parseFloat(
  process.env["COST_HARD_CAP_USD"] ?? "5.00"
);

// ─── Key builder ─────────────────────────────────────────────────────────────

function costKey(userId: string): string {
  const today = new Date().toISOString().split("T")[0]!;
  return `oz:cost:${userId}:${today}`;
}

// ─── checkCostCap ─────────────────────────────────────────────────────────────

/**
 * checkCostCap — check the user's daily spend against soft/hard caps.
 *
 * READ-ONLY: does not modify Redis state.
 *
 * Returns:
 *   'hard' — spend >= HARD_CAP_USD  → caller must disable write tools
 *   'soft' — spend >= 80% of SOFT_CAP_USD → caller must inject warning
 *   'ok'   — spend is below soft threshold → proceed normally
 *
 * @param userId — the authenticated user's UUID
 */
export async function checkCostCap(
  userId: string
): Promise<"ok" | "soft" | "hard"> {
  const key = costKey(userId);
  const spent = (await redis.get<number>(key)) ?? 0;

  if (spent >= HARD_CAP_USD) return "hard";
  if (spent >= SOFT_CAP_USD * 0.8) return "soft";
  return "ok";
}

// ─── recordCost ───────────────────────────────────────────────────────────────

/**
 * recordCost — atomically increment the user's daily spend counter.
 *
 * Uses incrbyfloat for atomic decimal increment. Sets a 25-hour TTL on the
 * first write of the day (ensuring the key expires after midnight UTC + buffer).
 *
 * Called AFTER a successful LLM call with the usage-derived cost in USD.
 *
 * @param userId  — the authenticated user's UUID
 * @param costUsd — the cost of this LLM call in USD
 */
export async function recordCost(userId: string, costUsd: number): Promise<void> {
  const key = costKey(userId);
  const newVal = await redis.incrbyfloat(key, costUsd);

  // Set 25h TTL on first write of the day (newVal ≈ costUsd means no prior value)
  if (newVal <= costUsd) {
    await redis.expire(key, 25 * 60 * 60); // 25 hours
  }
}
