// tests/unit/rate-limit.test.ts
// Tests the per-user Upstash rate limiter (AUTH-06).
//
// Offline strategy: we instantiate Ratelimit directly with a mock Redis
// that uses an in-memory Map to track counters (no real Redis needed).
//
// For fixedWindow (single region):
//   safeEval calls: redis.evalsha(hash, keys=[key, dynamicLimitKey], args=[tokens, windowDuration, incrementBy])
//   returns: [usedTokensAfterUpdate, effectiveLimit]
//   success = usedTokensAfterUpdate <= effectiveLimit
//
// For the chatRateLimit module export: we verify it can be imported and
// has the expected type — the actual limit() call requires live Upstash credentials.

import { describe, it, expect } from "vitest";
import { Ratelimit } from "@upstash/ratelimit";

// ---------------------------------------------------------------------------
// In-memory mock Redis compatible with fixedWindow single-region usage
// ---------------------------------------------------------------------------

function createMockRedis() {
  // key -> count
  const store = new Map<string, number>();

  const impl = {
    // fixedWindow calls: evalsha(hash, [key, dynamicLimitKey], [tokens, windowDuration, incrementBy])
    // We implement INCRBY(key, incrementBy) and return [newCount, effectiveLimit]
    // success = newCount <= effectiveLimit
    evalsha: async (
      _sha: string,
      keys: string[],
      args: (string | number)[]
    ): Promise<[number, number]> => {
      const key = keys[0] ?? "default";
      const effectiveLimit = Number(args[0]); // tokens param
      const incrementBy = Number(args[2] ?? 1); // incrementBy param

      const current = store.get(key) ?? 0;
      const next = current + Math.max(0, incrementBy);
      store.set(key, next);

      return [next, effectiveLimit];
    },

    // eval is the fallback if evalsha raises NOSCRIPT — same logic
    eval: async (
      _script: string,
      keys: string[],
      args: (string | number)[]
    ): Promise<[number, number]> => {
      return impl.evalsha("", keys, args);
    },

    // get/set required by the Pick<Redis, "evalsha" | "get" | "set"> type
    get: async (key: string): Promise<string | null> => {
      const val = store.get(key);
      return val !== undefined ? String(val) : null;
    },
    set: async (
      key: string,
      value: string | number
    ): Promise<"OK"> => {
      store.set(key, Number(value));
      return "OK";
    },
  };

  return impl;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("chatRateLimit module", () => {
  it("exports chatRateLimit with a limit() method", async () => {
    // Import the module — this verifies it can be imported without crashing.
    // Redis.fromEnv() logs a warning when env vars are absent but does not throw.
    const mod = await import("@/lib/rate-limit");
    expect(typeof mod.chatRateLimit).toBe("object");
    expect(typeof mod.chatRateLimit.limit).toBe("function");
  });
});

describe("rate limiting behavior (offline mock)", () => {
  it("allows requests under the limit", async () => {
    const windowLimit = 3;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limiter = new Ratelimit({
      redis: createMockRedis() as never,
      limiter: Ratelimit.fixedWindow(windowLimit, "1 m"),
      prefix: "test:ratelimit",
    });

    for (let i = 0; i < windowLimit; i++) {
      const result = await limiter.limit("test-user");
      expect(result.success).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit (N+1 is denied)", async () => {
    const windowLimit = 3;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limiter = new Ratelimit({
      redis: createMockRedis() as never,
      limiter: Ratelimit.fixedWindow(windowLimit, "1 m"),
      prefix: "test:ratelimit",
    });

    const identifier = "blocked-user";

    // Exhaust the limit
    for (let i = 0; i < windowLimit; i++) {
      const r = await limiter.limit(identifier);
      expect(r.success).toBe(true);
    }

    // The (N+1)th request must be denied
    const blocked = await limiter.limit(identifier);
    expect(blocked.success).toBe(false);
  });

  it("tracks per-user limits independently (separate key namespaces)", async () => {
    const windowLimit = 2;
    const redis = createMockRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limiter = new Ratelimit({
      redis: redis as never,
      limiter: Ratelimit.fixedWindow(windowLimit, "1 m"),
      prefix: "test:ratelimit",
    });

    // Exhaust limit for user-A
    for (let i = 0; i < windowLimit; i++) {
      await limiter.limit("user-A");
    }
    const blockedA = await limiter.limit("user-A");
    expect(blockedA.success).toBe(false);

    // user-B should still have capacity (different key namespace)
    const allowedB = await limiter.limit("user-B");
    expect(allowedB.success).toBe(true);
  });
});
