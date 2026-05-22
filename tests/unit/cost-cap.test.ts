/**
 * tests/unit/cost-cap.test.ts
 * Wave-0 scaffold — AUTH-07: Cost-cap soft/hard threshold logic
 *
 * Tests per-user daily cost cap enforcement — soft warns at 80%, hard disables
 * write tools at 100%. Pure logic tests with mocked Redis.
 *
 * Requirement: AUTH-07 — Per-user daily cost cap; soft warns in chat, hard disables write tools
 *
 * LLM TESTING RULE: mock Upstash Redis. No live Redis calls.
 * NOTE: vi.mock factory is hoisted — cannot reference top-level variables.
 *   Use vi.hoisted() to define mock functions that can be referenced in both
 *   the factory and the test body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mock functions ─────────────────────────────────────────────────────
// vi.hoisted() runs before vi.mock() — safe to use in the factory below.

const { mockGet, mockIncrbyfloat, mockExpire } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockIncrbyfloat: vi.fn(),
  mockExpire: vi.fn(),
}));

// ─── Mock Upstash Redis ────────────────────────────────────────────────────────

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: vi.fn(() => ({
      get: mockGet,
      incrbyfloat: mockIncrbyfloat,
      expire: mockExpire,
    })),
  },
}));

// ─── Import under test ─────────────────────────────────────────────────────────

import {
  checkCostCap,
  recordCost,
  SOFT_CAP_USD,
  HARD_CAP_USD,
} from "@/lib/cost-cap";

// ─── Tests ─────────────────────────────────────────────────────────────────────

const USER_ID = "user-test-cap";

function getTodayKey(): string {
  const today = new Date().toISOString().split("T")[0];
  return `oz:cost:${USER_ID}:${today}`;
}

describe("AUTH-07 — Cost-cap soft/hard threshold logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'ok' when daily spend is below soft threshold (80%)", async () => {
    mockGet.mockResolvedValue(0); // $0 spent
    const result = await checkCostCap(USER_ID);
    expect(result).toBe("ok");
  });

  it("returns 'soft' when daily spend is at or above 80% of hard cap", async () => {
    // 80% of SOFT_CAP_USD
    const softThreshold = SOFT_CAP_USD * 0.8;
    mockGet.mockResolvedValue(softThreshold);
    const result = await checkCostCap(USER_ID);
    expect(result).toBe("soft");
  });

  it("returns 'hard' when daily spend equals or exceeds hard cap", async () => {
    mockGet.mockResolvedValue(HARD_CAP_USD); // exactly at hard cap
    const result = await checkCostCap(USER_ID);
    expect(result).toBe("hard");
  });

  it("returns 'hard' when daily spend exceeds hard cap", async () => {
    mockGet.mockResolvedValue(HARD_CAP_USD + 1.0);
    const result = await checkCostCap(USER_ID);
    expect(result).toBe("hard");
  });

  it("cost key is scoped per user per day: oz:cost:{userId}:{YYYY-MM-DD}", async () => {
    mockGet.mockResolvedValue(0);
    await checkCostCap(USER_ID);
    const expectedKey = getTodayKey();
    expect(mockGet).toHaveBeenCalledWith(expectedKey);
  });

  it("recordCost increments the daily key by the given USD amount", async () => {
    const costUsd = 0.005;
    mockIncrbyfloat.mockResolvedValue(costUsd); // first increment = same as input
    await recordCost(USER_ID, costUsd);
    expect(mockIncrbyfloat).toHaveBeenCalledWith(getTodayKey(), costUsd);
  });

  it("recordCost sets 25h TTL on first increment of the day", async () => {
    const costUsd = 0.002;
    // When newVal <= costUsd, it's the first write of the day
    mockIncrbyfloat.mockResolvedValue(costUsd);
    await recordCost(USER_ID, costUsd);
    expect(mockExpire).toHaveBeenCalledWith(getTodayKey(), 25 * 60 * 60);
  });

  it("recordCost does NOT set TTL on subsequent increments of the same day", async () => {
    const costUsd = 0.002;
    // newVal > costUsd means the key already existed
    mockIncrbyfloat.mockResolvedValue(costUsd * 5);
    await recordCost(USER_ID, costUsd);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("checkCostCap reads from Redis and does not modify state", async () => {
    mockGet.mockResolvedValue(1.0);
    await checkCostCap(USER_ID);
    expect(mockIncrbyfloat).not.toHaveBeenCalled();
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("SOFT_CAP_USD and HARD_CAP_USD are exported constants", () => {
    expect(typeof SOFT_CAP_USD).toBe("number");
    expect(typeof HARD_CAP_USD).toBe("number");
    expect(SOFT_CAP_USD).toBeGreaterThan(0);
    expect(HARD_CAP_USD).toBeGreaterThanOrEqual(SOFT_CAP_USD);
  });

  it("returns 'ok' when Redis returns null (no spend today)", async () => {
    mockGet.mockResolvedValue(null);
    const result = await checkCostCap(USER_ID);
    expect(result).toBe("ok");
  });
});
