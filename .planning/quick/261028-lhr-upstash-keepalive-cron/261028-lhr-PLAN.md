---
phase: quick-261028-lhr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/inngest/functions/redis-keepalive.ts
  - app/api/inngest/route.ts
  - tests/unit/redis-keepalive.test.ts
autonomous: true
requirements: [QUICK-261028-lhr]

must_haves:
  truths:
    - "A daily Inngest cron (0 9 * * *) writes SET oz:keepalive <ISO timestamp> to the production Upstash Redis so the free-tier DB is never archived for inactivity"
    - "Success emits a structured JSON info log {level:'info', event:'redis.keepalive.ok'}; failure emits a structured JSON console.error {level:'error', event:'redis.keepalive.failed'} and rethrows so Inngest marks the run failed (retries: 2)"
    - "redisKeepalive is registered in the app/api/inngest/route.ts functions array so Inngest discovers and schedules it"
    - "Unit test (mocked @upstash/redis) proves the write, the success log, and the log-then-rethrow failure path; npx tsc --noEmit and npx vitest run tests/unit/redis-keepalive.test.ts pass"
  artifacts:
    - path: "lib/inngest/functions/redis-keepalive.ts"
      provides: "redisKeepalive Inngest cron + exported writeKeepalive helper"
      exports: ["redisKeepalive", "writeKeepalive", "KEEPALIVE_KEY", "KEEPALIVE_TTL_SECONDS"]
    - path: "tests/unit/redis-keepalive.test.ts"
      provides: "Offline unit tests for writeKeepalive"
  key_links:
    - from: "app/api/inngest/route.ts"
      to: "lib/inngest/functions/redis-keepalive.ts"
      via: "import { redisKeepalive } + functions array entry"
      pattern: "redisKeepalive"
    - from: "lib/inngest/functions/redis-keepalive.ts"
      to: "@upstash/redis"
      via: "Redis.fromEnv().set(KEEPALIVE_KEY, iso, { ex })"
      pattern: "Redis\\.fromEnv"
---

<objective>
Add a daily Upstash Redis keep-alive Inngest cron so the free-tier Upstash DB (used by lib/rate-limit.ts for chatRateLimit + sandboxCreateRateLimit) is never archived for inactivity again. Last time it was archived, DNS for its host stopped resolving, `sandboxCreateRateLimit.limit()` threw inside the `enterSandbox` server action, and the login page's "Try the live demo" button crashed.

Purpose: keep the rate-limit backing store alive on the free tier with no manual intervention.
Output: lib/inngest/functions/redis-keepalive.ts, a registration in the Inngest serve route, and a unit test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@lib/inngest/functions/sandbox-sweep.ts
@app/api/inngest/route.ts
@lib/rate-limit.ts

<interfaces>
From lib/inngest/client.ts: `export const inngest = new Inngest({ id: "operator-zero", maxRuntime: "4m" })`

Function shape used by sandbox-sweep.ts (copy it exactly): `inngest.createFunction({ id, triggers: [{ cron: "..." }], retries }, async ({ step }) => { ... })` — two-arg form, triggers inside the config object.

Structured log style (lib/integrations/shopify/sync.ts): `console.log(JSON.stringify({ level, event, error, timestamp: new Date().toISOString() }))`. For this task use console.info for ok and console.error for failed.

@upstash/redis 1.38.0: `Redis.fromEnv()` reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. `redis.set(key, value, { ex: seconds })` resolves to "OK".

Existing unit test pattern (tests/unit/sandbox-exit.test.ts): import a pure exported helper from the Inngest function module and assert it directly. tests/unit/hello-world.test.ts dynamically imports "@/app/api/inngest/route" — so the new module MUST be import-safe in Vitest (no network at import time, no `import "server-only"`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create redis-keepalive Inngest function with testable helper + unit test</name>
  <files>lib/inngest/functions/redis-keepalive.ts, tests/unit/redis-keepalive.test.ts</files>
  <behavior>
    - writeKeepalive(redis, now) calls redis.set("oz:keepalive", now.toISOString(), { ex: 604800 }) exactly once
    - On success it console.info's one JSON line parsing to {level:"info", event:"redis.keepalive.ok", key:"oz:keepalive", at:<iso>} and resolves to { ok: true, key, at }
    - When redis.set rejects (e.g. new Error("getaddrinfo ENOTFOUND")), it console.error's one JSON line parsing to {level:"error", event:"redis.keepalive.failed", key, error:"getaddrinfo ENOTFOUND", timestamp:<iso>} and then rejects with the same error (not swallowed)
    - Non-Error rejections (a string) are logged with error: String(value) and still rethrown
    - redisKeepalive export is defined (module imports cleanly with @upstash/redis mocked)
  </behavior>
  <action>
Create lib/inngest/functions/redis-keepalive.ts. Header doc comment in the same style as sandbox-sweep.ts: file path line, "Cron: keep the free-tier Upstash Redis DB alive.", then a paragraph explaining the incident (Upstash archives inactive free-tier DBs; archived host stopped resolving; sandboxCreateRateLimit.limit() threw in enterSandbox and broke "Try the live demo"), why it does a WRITE rather than PING (writes are more reliably counted as activity), and the TTL choice.

Exports:
- `KEEPALIVE_KEY = "oz:keepalive"` (uses the existing `oz:` prefix convention from lib/rate-limit.ts).
- `KEEPALIVE_TTL_SECONDS = 7 * 24 * 60 * 60`. Planner's call, document in a comment: 7-day TTL so the key self-cleans if the cron is ever removed, while daily writes keep it continuously present (each write resets the TTL); a missing key in the Upstash console is then a quick signal the cron has stopped for a week.
- `writeKeepalive(redis: Pick<Redis, "set">, now: Date = new Date())`: async; computes `at = now.toISOString()`; inside try awaits `redis.set(KEEPALIVE_KEY, at, { ex: KEEPALIVE_TTL_SECONDS })`, then `console.info(JSON.stringify({ level: "info", event: "redis.keepalive.ok", key: KEEPALIVE_KEY, at }))` and returns `{ ok: true as const, key: KEEPALIVE_KEY, at }`. In catch: `console.error(JSON.stringify({ level: "error", event: "redis.keepalive.failed", key: KEEPALIVE_KEY, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }))` then `throw err` — do NOT swallow; the rethrow is what makes Inngest retry and then mark the run failed in the dashboard.
- `redisKeepalive = inngest.createFunction({ id: "redis-keepalive", triggers: [{ cron: "0 9 * * *" }], retries: 2 }, async ({ step }) => step.run("write-keepalive", () => writeKeepalive(Redis.fromEnv())))`. Comment the cron as daily 09:00 UTC and retries: 2 as "a missed day isn't critical (archive threshold is far longer), but failures must stay visible". Construct Redis.fromEnv() INSIDE the step callback, not at module top level, so importing the module (e.g. from the serve route in hello-world.test.ts) never touches env/network.

Imports: `inngest` from "@/lib/inngest/client", `Redis` from "@upstash/redis". Do NOT add `import "server-only"` (it breaks Vitest; this module is reachable from tests via the serve route).

Create tests/unit/redis-keepalive.test.ts (header comment in the style of other tests/unit files): `vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: vi.fn(() => ({ set: vi.fn() })) } }))` so the module imports offline. Build a fake redis `{ set: vi.fn().mockResolvedValue("OK") }`, use a fixed `new Date("2026-10-28T09:00:00.000Z")`, spy on console.info / console.error with vi.spyOn(...).mockImplementation(() => {}) and restore in afterEach. Cover every case in <behavior>, parsing the logged string with JSON.parse and asserting with toMatchObject. For the failure cases use `await expect(writeKeepalive(...)).rejects.toBe(err)` (same reference) and assert console.info was not called. Also assert `redisKeepalive` is defined.

Write the test first, watch it fail (module missing), then implement.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx vitest run tests/unit/redis-keepalive.test.ts && ! grep -v '^\s*//' lib/inngest/functions/redis-keepalive.ts | grep -q 'server-only'</automated>
  </verify>
  <done>All redis-keepalive tests pass; module has no server-only import; Redis.fromEnv() only called inside the step callback; error path logs then rethrows.</done>
</task>

<task type="auto">
  <name>Task 2: Register redisKeepalive in the Inngest serve route and typecheck</name>
  <files>app/api/inngest/route.ts</files>
  <action>
In app/api/inngest/route.ts add `import { redisKeepalive } from "@/lib/inngest/functions/redis-keepalive";` directly after the `sandboxExit` import, and append `redisKeepalive,` to the end of the `functions` array after `sandboxExit`. Change nothing else in the file (do not touch maxDuration or other entries). Then run the full typecheck and the serve-route test that imports the route.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx tsc --noEmit && npx vitest run tests/unit/redis-keepalive.test.ts tests/unit/hello-world.test.ts && grep -c 'redisKeepalive' app/api/inngest/route.ts</automated>
  </verify>
  <done>route.ts imports and registers redisKeepalive (grep count 2); `npx tsc --noEmit` exits 0; redis-keepalive and hello-world tests pass. Only the three files in files_modified are changed (`git status --short` shows no other new modifications from this plan).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Inngest cloud -> /api/inngest | Cron invocation of the serve handler (signed by Inngest signing key, already in place) |
| Vercel function -> Upstash REST | Outbound write using server-only UPSTASH_REDIS_REST_TOKEN |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261028-01 | Information Disclosure | redis-keepalive.ts logs | mitigate | Logs contain only key, ISO timestamp, and err.message — never the token or REST URL object; credentials stay in Redis.fromEnv() |
| T-261028-02 | Tampering | oz:keepalive key | accept | Value is a non-sensitive timestamp read by nothing; separate `oz:keepalive` key cannot collide with `oz:chat:ratelimit` / `oz:sandbox:create` prefixes |
| T-261028-03 | Denial of Service | Upstash free-tier quota | accept | 1 write/day (+ max 2 retries) is negligible against free-tier command limits |
| T-261028-04 | Repudiation | Silent keep-alive failure | mitigate | Structured console.error + rethrow so Inngest marks the run failed and it's visible in the dashboard |
</threat_model>

<verification>
- `npx tsc --noEmit` exits 0
- `npx vitest run tests/unit/redis-keepalive.test.ts tests/unit/hello-world.test.ts` passes
- route.ts functions array contains redisKeepalive
- No `server-only` import in the new module
</verification>

<success_criteria>
A daily (0 9 * * *) Inngest cron `redis-keepalive` with retries: 2 writes `oz:keepalive` (7-day TTL) to Upstash, logs structured ok/failed JSON, rethrows on failure, is registered in the serve route, and is covered by passing offline unit tests.
</success_criteria>

<output>
Create `.planning/quick/261028-lhr-upstash-keepalive-cron/261028-lhr-SUMMARY.md` when done
</output>
