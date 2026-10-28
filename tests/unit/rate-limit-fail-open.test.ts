import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chatRateLimit,
  failOpen,
  sandboxCreateRateLimit,
  type LimiterLike,
} from "@/lib/rate-limit";

function fake(impl: ReturnType<typeof vi.fn>): LimiterLike {
  return { limit: impl } as unknown as LimiterLike;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("failOpen", () => {
  it("resolves success:true when the limiter throws (does not throw)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const l = failOpen(
      fake(vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND x.upstash.io"))),
      "sandbox_create",
    );
    const res = await l.limit("1.2.3.4");
    expect(res.success).toBe(true);
  });

  it("logs one structured line without the identifier", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const l = failOpen(
      fake(vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND x.upstash.io"))),
      "sandbox_create",
    );
    await l.limit("1.2.3.4");
    expect(spy).toHaveBeenCalledTimes(1);
    const raw = spy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("ratelimit.redis_unavailable");
    expect(parsed.limiter).toBe("sandbox_create");
    expect(parsed.error).toContain("ENOTFOUND");
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    expect(raw).not.toContain("1.2.3.4");
  });

  it("reflects chat limiter name and handles non-Error rejections", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const l = failOpen(fake(vi.fn().mockRejectedValue("WRONGPASS")), "chat");
    const res = await l.limit("user-1");
    expect(res.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.limiter).toBe("chat");
    expect(parsed.error).toBe("WRONGPASS");
  });

  it("passes through a successful result by reference", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = {
      success: true,
      limit: 30,
      remaining: 29,
      reset: 123,
      pending: Promise.resolve(),
    };
    const l = failOpen(fake(vi.fn().mockResolvedValue(result)), "chat");
    expect(await l.limit("u")).toBe(result);
    expect(spy).not.toHaveBeenCalled();
  });

  it("passes through success:false unchanged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = {
      success: false,
      limit: 30,
      remaining: 0,
      reset: 123,
      pending: Promise.resolve(),
    };
    const l = failOpen(fake(vi.fn().mockResolvedValue(result)), "chat");
    const res = await l.limit("u");
    expect(res).toBe(result);
    expect(res.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("forwards the identifier unchanged", async () => {
    const fn = vi.fn().mockResolvedValue({
      success: true,
      limit: 1,
      remaining: 1,
      reset: 0,
      pending: Promise.resolve(),
    });
    await failOpen(fake(fn), "chat").limit("user-123");
    expect(fn).toHaveBeenCalledWith("user-123");
  });
});

describe("module exports", () => {
  it("exports both limiters with a limit function", () => {
    expect(typeof chatRateLimit.limit).toBe("function");
    expect(typeof sandboxCreateRateLimit.limit).toBe("function");
  });
});
