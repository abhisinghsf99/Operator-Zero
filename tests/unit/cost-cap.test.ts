/**
 * tests/unit/cost-cap.test.ts
 * Wave-0 scaffold — AUTH-07: Cost-cap soft/hard threshold logic
 *
 * Tests per-user daily cost cap enforcement — soft warns at 80%, hard disables
 * write tools at 100%. Pure function tests, no Redis required.
 *
 * Requirement: AUTH-07 — Per-user daily cost cap; soft warns in chat, hard disables write tools
 */
import { describe, it, expect } from "vitest";

describe("AUTH-07 — Cost-cap soft/hard threshold logic", () => {
  it.todo("returns 'ok' when daily spend is below soft threshold (80%)");

  it.todo("returns 'soft' when daily spend is at or above 80% of hard cap");

  it.todo("returns 'hard' when daily spend equals or exceeds hard cap");

  it.todo("cost key is scoped per user per day: oz:cost:{userId}:{YYYY-MM-DD}");

  it.todo("recordCost increments the daily key by the given USD amount");

  it.todo("recordCost sets 25h TTL on first increment of the day");

  it.todo("checkCostCap reads from Redis and does not modify state");

  it.todo("hard cap check disables write tools before LLM call");

  it.todo("soft cap check injects warning into system prompt and continues");

  it.todo("cost_aggregates table is updated by nightly Inngest cron (not on every call)");
});
