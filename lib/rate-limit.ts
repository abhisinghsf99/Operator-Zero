// lib/rate-limit.ts
// Pattern 9 (RESEARCH.md): Per-user rate limiting via Upstash Redis.
// AUTH-06: max 30 chat sends per minute per user.
// Mitigation T-1-03-03: combined with Inngest concurrency key for runaway-cost protection.
//
// Applied at the Route Handler level before any Anthropic API calls.
// Usage:
//   const { success } = await chatRateLimit.limit(userId)
//   if (!success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const chatRateLimit = new Ratelimit({
  // Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from env.
  // These are server-only env vars — never NEXT_PUBLIC_.
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, "1 m"), // 30 requests per minute
  prefix: "oz:chat:ratelimit",
  analytics: true,
});

// Public demo sandbox creation, keyed by client IP. Each enter creates an
// anonymous auth user + seeds a full dataset, so this guards against floods that
// would bloat auth.users and the DB. Sliding window: 10 new sandboxes per hour
// per IP — generous for legit retries, tight enough to blunt abuse.
export const sandboxCreateRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "oz:sandbox:create",
  analytics: true,
});
