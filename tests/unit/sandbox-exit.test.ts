/**
 * tests/unit/sandbox-exit.test.ts
 * Grace-period teardown decision for sandbox exit (WS-followup: refresh must
 * not destroy a live sandbox — pagehide fires on F5/full navigations too).
 */
import { describe, it, expect } from "vitest";
import { shouldTeardown } from "@/lib/inngest/functions/sandbox-exit";

describe("shouldTeardown (sandbox exit grace period)", () => {
  const requestedAt = new Date("2026-07-27T12:00:00Z");

  it("tears down when the visitor was never seen after the exit request", () => {
    expect(shouldTeardown(new Date("2026-07-27T11:59:00Z"), requestedAt)).toBe(true);
  });

  it("tears down when last_seen_at equals the request time (no newer heartbeat)", () => {
    expect(shouldTeardown(new Date("2026-07-27T12:00:00Z"), requestedAt)).toBe(true);
  });

  it("keeps the sandbox when a heartbeat arrived after the exit request (refresh)", () => {
    expect(shouldTeardown(new Date("2026-07-27T12:00:05Z"), requestedAt)).toBe(false);
  });

  it("tears down when the registry row is already gone", () => {
    expect(shouldTeardown(null, requestedAt)).toBe(true);
  });
});
