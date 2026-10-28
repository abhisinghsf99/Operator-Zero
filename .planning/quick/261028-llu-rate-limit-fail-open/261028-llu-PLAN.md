---
phase: quick-261028-llu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/rate-limit.ts
  - tests/unit/rate-limit-fail-open.test.ts
autonomous: true
requirements: [QUICK-261028-llu]

must_haves:
  truths:
    - "When Upstash Redis is unreachable (DNS/network/auth error), chatRateLimit.limit(id) and sandboxCreateRateLimit.limit(id) resolve with success:true instead of throwing, so the 'Try the live demo' button and chat send keep working"
    - "Each swallowed Redis error emits one structured JSON console.error line with event 'ratelimit.redis_unavailable', the limiter name ('chat' | 'sandbox_create'), the error string, and an ISO timestamp, and never includes the identifier (IP privacy)"
    - "When the underlying limiter resolves, its result (including success:false) is passed through unchanged, so real rate limiting still blocks"
    - "Callers (app/(auth)/login/actions.ts enterSandbox, app/api/chat/[threadId]/send/route.ts) need no changes: same export names, same .limit(id) shape"
  artifacts:
    - path: "lib/rate-limit.ts"
      provides: "failOpen helper + fail-open wrapped chatRateLimit / sandboxCreateRateLimit"
      exports: ["failOpen", "chatRateLimit", "sandboxCreateRateLimit"]
      contains: "ratelimit.redis_unavailable"
    - path: "tests/unit/rate-limit-fail-open.test.ts"
      provides: "Unit tests for failOpen with fake limiters"
  key_links:
    - from: "lib/rate-limit.ts"
      to: "@upstash/ratelimit Ratelimit.limit"
      via: "failOpen(new Ratelimit({...}), name) wrapper with try/catch"
      pattern: "failOpen\\("
---

<objective>
Make the Upstash rate limiters fail OPEN: any error thrown by the underlying `Ratelimit.limit()` is caught, logged as structured JSON, and turned into an allow result. Defense-in-depth after the archived-Upstash-DB incident where `sandboxCreateRateLimit.limit(ip)` threw ENOTFOUND inside the `enterSandbox` server action and crashed the login page's demo button with Next's generic client-side exception.

Purpose: rate limiting is a guardrail, not a correctness gate — availability beats strictness. Cost caps and Inngest concurrency keys remain the runaway-cost backstop.
Output: updated `lib/rate-limit.ts`, new `tests/unit/rate-limit-fail-open.test.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@lib/rate-limit.ts
@tests/unit/rate-limit.test.ts

<interfaces>
@upstash/ratelimit v2.0.8. `RatelimitResponse` is NOT exported from the package — derive it:
  type RatelimitResult = Awaited<ReturnType<Ratelimit["limit"]>>;
Fields: success: boolean; limit: number; remaining: number; reset: number (unix ms); pending: Promise<unknown>; reason?: "timeout" | "cacheBlock" | "denyList"; deniedValue?.
Ratelimit constructor option `timeout?: number` (default 5000 ms) — on timeout the library already resolves success:true with reason "timeout" (built-in fail-open for hangs). It does NOT cover thrown errors (ENOTFOUND, WRONGPASS), which is what this task fixes.

Callers (do not modify):
- app/(auth)/login/actions.ts ~L175: `const { success } = await sandboxCreateRateLimit.limit(ip);`
- app/api/chat/[threadId]/send/route.ts ~L79: `const { success: rateLimitOk } = await chatRateLimit.limit(userId);`
- tests/integration/chat-stream.test.ts L108 mocks `@/lib/rate-limit` as `{ chatRateLimit: { limit: vi.fn() } }` — unaffected as long as export name stays.

Codebase structured-log style (lib/auth/session-registry.ts):
  console.error(JSON.stringify({ level: "warn", event: "session.sign_out_everywhere.failed", userId, error: String(err) }));
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add failOpen helper and wrap both limiters in lib/rate-limit.ts</name>
  <files>lib/rate-limit.ts, tests/unit/rate-limit-fail-open.test.ts</files>
  <behavior>
    - Test 1: failOpen(fakeLimiter whose limit rejects with Error("getaddrinfo ENOTFOUND x.upstash.io"), "sandbox_create").limit("1.2.3.4") resolves with success:true (does not throw).
    - Test 2: in that case console.error (vi.spyOn, mockImplementation no-op) is called once; JSON.parse of the argument has level "error", event "ratelimit.redis_unavailable", limiter "sandbox_create", error containing "ENOTFOUND", timestamp a valid ISO string; and the raw logged string does NOT contain "1.2.3.4".
    - Test 3: limiter name "chat" is reflected in the log when the chat-named wrapper rejects (also covers a non-Error rejection value, e.g. rejecting with a string "WRONGPASS" → error field is that string).
    - Test 4: fake limiter resolving { success: true, limit: 30, remaining: 29, reset: 123, pending: Promise.resolve() } → wrapper returns that exact object (toBe same reference), console.error not called.
    - Test 5: fake limiter resolving success:false (remaining 0) → wrapper returns success:false unchanged (still blocks), console.error not called.
    - Test 6: fake limiter's limit receives the identifier argument unchanged (vi.fn called with "user-123").
    - Test 7: module exports chatRateLimit and sandboxCreateRateLimit, each with a function `limit` (import "@/lib/rate-limit"; Redis.fromEnv only warns without env vars).
  </behavior>
  <action>
    RED first: create tests/unit/rate-limit-fail-open.test.ts (vitest, `describe/it/expect/vi/afterEach` from "vitest"; restore spies with vi.restoreAllMocks in afterEach) covering the behaviors above. Fake limiters are plain objects `{ limit: vi.fn() }` cast to the helper's parameter type — no real Redis. Run it, confirm it fails (failOpen not exported).

    GREEN: in lib/rate-limit.ts:
    - Define `type RatelimitResult = Awaited<ReturnType<Ratelimit["limit"]>>` and a minimal structural type `LimiterLike = { limit: (identifier: string) => Promise<RatelimitResult> }` (export both types so tests can type the fakes).
    - Export `failOpen(limiter: LimiterLike, name: "chat" | "sandbox_create"): LimiterLike` returning an object whose async `limit(identifier)` awaits `limiter.limit(identifier)` inside try/catch. On success return the result untouched. On catch: `console.error(JSON.stringify({ level: "error", event: "ratelimit.redis_unavailable", limiter: name, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }))` — do NOT include the identifier (it may be a client IP; privacy). Then return an allow result `{ success: true, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve() }` (fully satisfies RatelimitResult so caller destructuring and any `pending` handling keep working).
    - Keep both `new Ratelimit({...})` configs exactly as they are (Redis.fromEnv(), same limiter windows, prefixes, analytics:true), but assign them to `chatRateLimit = failOpen(new Ratelimit({...}), "chat")` and `sandboxCreateRateLimit = failOpen(new Ratelimit({...}), "sandbox_create")`. Export names unchanged. Do NOT set a custom `timeout` — the library default (5000 ms) already fails open on hangs; just mention it in the header comment.
    - Rewrite the header comment: keep the existing AUTH-06 / T-1-03-03 / usage notes, and add a "Fail-open policy" paragraph: rate limiting is a guardrail, availability > strictness; on any Redis error (DNS/network/auth/WRONGPASS) we log `ratelimit.redis_unavailable` and allow the request; motivated by the 2026-10 incident where the archived Upstash DB's host stopped resolving and the thrown error crashed the enterSandbox server action ("Try the live demo"); hangs are already covered by Ratelimit's built-in `timeout` (default 5 s, resolves success:true reason "timeout"); cost caps + Inngest concurrency keys remain the backstop against abuse while Redis is down.
    - Do NOT add `import "server-only"` (module is imported by Vitest). Do NOT touch callers.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx vitest run tests/unit/rate-limit-fail-open.test.ts tests/unit/rate-limit.test.ts</automated>
  </verify>
  <done>All tests in both rate-limit unit files pass; failOpen exported; both limiters wrapped; no identifier in the log line; header documents fail-open policy.</done>
</task>

<task type="auto">
  <name>Task 2: Typecheck and regression-run dependent tests</name>
  <files>lib/rate-limit.ts</files>
  <action>
    Run `npx tsc --noEmit` and fix any type errors in lib/rate-limit.ts or the new test (only those two files may change). Confirm callers compile unchanged: `git diff --name-only` must list only lib/rate-limit.ts and tests/unit/rate-limit-fail-open.test.ts (plus this quick-task's .planning files). Run the integration test that mocks the module (tests/integration/chat-stream.test.ts) and re-grep `grep -rln "rate-limit\|login/actions\|chat/\[threadId\]/send" tests` for any other importer and run those too. If chat-stream.test.ts requires live infra (DB env) and fails for reasons unrelated to rate-limit, record that in the SUMMARY rather than modifying it.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx tsc --noEmit && npx vitest run tests/unit/rate-limit-fail-open.test.ts tests/unit/rate-limit.test.ts tests/integration/chat-stream.test.ts && git diff --name-only -- app lib tests</automated>
  </verify>
  <done>tsc clean; rate-limit unit tests and chat-stream integration test pass (or unrelated infra failure documented); git diff under app/lib/tests shows only lib/rate-limit.ts and the new test file.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → enterSandbox server action | Unauthenticated visitor triggers anonymous-user creation, keyed by client IP |
| client → chat send route | Authenticated user triggers LLM calls |
| app → Upstash Redis | Third-party dependency whose failure previously crashed the request |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261028-01 | Denial of Service | enterSandbox / chat send when Redis is down | mitigate | failOpen catches thrown Upstash errors and allows the request instead of crashing the action/route |
| T-261028-02 | Denial of Service / Elevation (abuse) | Rate limit bypass while Redis is down | accept | Fail-open is deliberate; cost caps, Inngest concurrency keys, and the Redis keep-alive cron (separate PR) bound exposure; every bypass is logged as ratelimit.redis_unavailable for alerting |
| T-261028-03 | Information Disclosure | Error log line | mitigate | Log omits identifier (client IP / userId); only limiter name, error message, timestamp |
</threat_model>

<verification>
- `npx tsc --noEmit` clean
- `npx vitest run tests/unit/rate-limit-fail-open.test.ts tests/unit/rate-limit.test.ts tests/integration/chat-stream.test.ts` green
- `grep -v '^\s*//' lib/rate-limit.ts | grep -c 'server-only'` returns 0
- `grep -c 'ratelimit.redis_unavailable' lib/rate-limit.ts` >= 1
</verification>

<success_criteria>
A Redis outage (thrown error from Ratelimit.limit) can no longer crash the "Try the live demo" button or chat send; it logs a structured event and allows the request. Normal rate limiting (success:false) still blocks. Only lib/rate-limit.ts and the new test file change.
</success_criteria>

<output>
Create `.planning/quick/261028-llu-rate-limit-fail-open/261028-llu-SUMMARY.md` when done
</output>
