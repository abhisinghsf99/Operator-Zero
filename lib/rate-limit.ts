// lib/rate-limit.ts
// Pattern 9 (RESEARCH.md): Per-user rate limiting via Upstash Redis.
// AUTH-06: max 30 chat sends per minute per user.
// Mitigation T-1-03-03: combined with Inngest concurrency key for runaway-cost protection.
//
// Applied at the Route Handler level before any Anthropic API calls.
// Usage:
//   const { success } = await chatRateLimit.limit(userId)
//   if (!success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
//
// Fail-open policy: rate limiting is a guardrail, not a correctness gate, so
// availability beats strictness. On any Redis error (DNS/network/auth/WRONGPASS)
// we log a structured `ratelimit.redis_unavailable` event and allow the request.
// Motivated by the 2026-10 incident where the archived Upstash DB's host stopped
// resolving and the thrown error crashed the enterSandbox server action
// ("Try the live demo"). Hangs are already covered by Ratelimit's built-in
// `timeout` (default 5 s, resolves success:true with reason "timeout"). Cost caps
// and Inngest concurrency keys remain the backstop against abuse while Redis is down.
// Do NOT add `import "server-only"` here: this module is imported by Vitest.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// RatelimitResponse is not exported by the package; derive it.
export type RatelimitResult = Awaited<ReturnType<Ratelimit["limit"]>>;

export type LimiterLike = {
  limit: (identifier: string) => Promise<RatelimitResult>;
};

export function failOpen(
  limiter: LimiterLike,
  name: "chat" | "sandbox_create",
): LimiterLike {
  return {
    async limit(identifier: string): Promise<RatelimitResult> {
      try {
        return await limiter.limit(identifier);
      } catch (err) {
        // Identifier deliberately omitted (may be a client IP).
        console.error(
          JSON.stringify({
            level: "error",
            event: "ratelimit.redis_unavailable",
            limiter: name,
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          }),
        );
        return {
          success: true,
          limit: 0,
          remaining: 0,
          reset: 0,
          pending: Promise.resolve(),
        };
      }
    },
  };
}

export const chatRateLimit = failOpen(
  new Ratelimit({
    // Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from env.
    // These are server-only env vars — never NEXT_PUBLIC_.
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(30, "1 m"), // 30 requests per minute
    prefix: "oz:chat:ratelimit",
    analytics: true,
  }),
  "chat",
);

// Public demo sandbox creation, keyed by client IP. Each enter creates an
// anonymous auth user + seeds a full dataset, so this guards against floods that
// would bloat auth.users and the DB. Sliding window: 10 new sandboxes per hour
// per IP — generous for legit retries, tight enough to blunt abuse.
export const sandboxCreateRateLimit = failOpen(
  new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    prefix: "oz:sandbox:create",
    analytics: true,
  }),
  "sandbox_create",
);
