/**
 * tests/unit/redis-keepalive.test.ts
 * Offline tests for the daily Upstash keep-alive write (quick-261028-lhr).
 * @upstash/redis is mocked so nothing touches the network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: vi.fn(() => ({ set: vi.fn() })) },
}));

import {
  writeKeepalive,
  redisKeepalive,
  KEEPALIVE_KEY,
  KEEPALIVE_TTL_SECONDS,
} from "@/lib/inngest/functions/redis-keepalive";

const NOW = new Date("2026-10-28T09:00:00.000Z");

describe("writeKeepalive", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered as an Inngest function", () => {
    expect(redisKeepalive).toBeDefined();
  });

  it("writes the key once with a TTL and logs a structured ok event", async () => {
    const redis = { set: vi.fn().mockResolvedValue("OK") };
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await writeKeepalive(redis, NOW);

    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith("oz:keepalive", NOW.toISOString(), {
      ex: 604800,
    });
    expect(KEEPALIVE_KEY).toBe("oz:keepalive");
    expect(KEEPALIVE_TTL_SECONDS).toBe(604800);
    expect(result).toEqual({ ok: true, key: "oz:keepalive", at: NOW.toISOString() });
    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(info.mock.calls[0]![0] as string)).toMatchObject({
      level: "info",
      event: "redis.keepalive.ok",
      key: "oz:keepalive",
      at: NOW.toISOString(),
    });
  });

  it("logs a structured error and rethrows the same error on failure", async () => {
    const err = new Error("getaddrinfo ENOTFOUND");
    const redis = { set: vi.fn().mockRejectedValue(err) };
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(writeKeepalive(redis, NOW)).rejects.toBe(err);
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toMatchObject({
      level: "error",
      event: "redis.keepalive.failed",
      key: "oz:keepalive",
      error: "getaddrinfo ENOTFOUND",
    });
  });

  it("stringifies non-Error rejections and still rethrows", async () => {
    const redis = { set: vi.fn().mockRejectedValue("boom") };
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(writeKeepalive(redis, NOW)).rejects.toBe("boom");
    expect(info).not.toHaveBeenCalled();
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toMatchObject({
      error: "boom",
    });
  });
});
