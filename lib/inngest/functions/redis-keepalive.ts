/**
 * lib/inngest/functions/redis-keepalive.ts
 * Cron: keep the free-tier Upstash Redis DB alive.
 *
 * Upstash archives free-tier databases after a period of inactivity. When ours
 * was archived, its host stopped resolving, so sandboxCreateRateLimit.limit()
 * (lib/rate-limit.ts) threw inside the enterSandbox server action and the login
 * page's "Try the live demo" button crashed. This daily job writes a key so the
 * DB always counts as active.
 *
 * It does a WRITE rather than a PING because writes are more reliably counted
 * as activity by Upstash.
 */
import { inngest } from "@/lib/inngest/client";
import { Redis } from "@upstash/redis";

// Uses the existing `oz:` prefix convention from lib/rate-limit.ts.
export const KEEPALIVE_KEY = "oz:keepalive";

// 7-day TTL: the key self-cleans if the cron is ever removed, while daily
// writes (each resets the TTL) keep it continuously present. A missing key in
// the Upstash console is therefore a quick signal the cron has stopped for a week.
export const KEEPALIVE_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function writeKeepalive(
  redis: Pick<Redis, "set">,
  now: Date = new Date(),
) {
  const at = now.toISOString();
  try {
    await redis.set(KEEPALIVE_KEY, at, { ex: KEEPALIVE_TTL_SECONDS });
    console.info(
      JSON.stringify({
        level: "info",
        event: "redis.keepalive.ok",
        key: KEEPALIVE_KEY,
        at,
      }),
    );
    return { ok: true as const, key: KEEPALIVE_KEY, at };
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "redis.keepalive.failed",
        key: KEEPALIVE_KEY,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }),
    );
    // Do not swallow: the rethrow makes Inngest retry, then mark the run failed.
    throw err;
  }
}

export const redisKeepalive = inngest.createFunction(
  {
    id: "redis-keepalive",
    triggers: [{ cron: "0 9 * * *" }], // daily 09:00 UTC
    // A missed day isn't critical (archive threshold is far longer), but
    // failures must stay visible.
    retries: 2,
  },
  async ({ step }) =>
    // Redis.fromEnv() is built inside the step so importing this module never
    // touches env or network.
    step.run("write-keepalive", () => writeKeepalive(Redis.fromEnv())),
);
