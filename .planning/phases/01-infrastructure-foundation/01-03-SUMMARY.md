---
phase: "01-infrastructure-foundation"
plan: "03"
subsystem: "agent-tier"
tags: ["inngest", "durable-functions", "anthropic", "voyage-ai", "embeddings", "adapters", "rate-limiting", "upstash"]
dependency_graph:
  requires:
    - "01-01 (Next.js scaffold, all deps installed)"
    - "01-02 (DB clients available for future agent functions)"
  provides:
    - "Inngest client (operator-zero, maxRuntime 1m)"
    - "Durable hello-world function with two step.run checkpoints + per-user concurrency key"
    - "Inngest serve route (GET/POST/PUT, maxDuration=60)"
    - "Anthropic SDK wiring (claude-opus-4-7 callable from agent tier)"
    - "Voyage AI embeddings wiring (voyage-4, 1024-dim)"
    - "IntegrationAdapter interface"
    - "ShopifyAdapter + GmailAdapter compile-only skeletons"
    - "Per-user Upstash rate limiter (chatRateLimit, 30/min sliding window)"
  affects:
    - "01-04 (auth — agent tier rails ready for auth-gated workflows)"
    - "Phase 2 (all workflow/catalog/SEO agent functions build on this layer)"
tech_stack:
  added:
    - "inngest@4.4.0 (now wired with client, function, serve route)"
    - "@anthropic-ai/sdk@0.97.1 (now callable from lib/agent/anthropic.ts)"
    - "voyageai@0.2.1 (now callable from lib/agent/embeddings.ts, 1024-dim)"
    - "@upstash/ratelimit@2.0.8 + @upstash/redis@1.38.0 (rate limiter wired)"
  patterns:
    - "Inngest 4.x two-arg createFunction API: (options, handler) where triggers is inside options"
    - "Voyage AI SDK v0.2.1: response shape is data[0].embedding (not embeddings[0] per older docs)"
    - "Vitest CJS alias for voyageai to bypass broken ESM directory import in test env"
    - "Mock Redis for offline rate-limit tests: evalsha returns [usedTokensAfterUpdate, effectiveLimit]"
key_files:
  created:
    - "lib/inngest/client.ts (Inngest client: id=operator-zero, maxRuntime=1m)"
    - "lib/inngest/functions/hello-world.ts (two step.run checkpoints, concurrency key event.data.userId, retries=3)"
    - "app/api/inngest/route.ts (serve GET/POST/PUT, maxDuration=60)"
    - "lib/agent/anthropic.ts (anthropic client + smokeTestAnthropic())"
    - "lib/agent/embeddings.ts (embedText() with voyage-4, 1024-dim)"
    - "lib/integrations/adapter.ts (IntegrationAdapter interface)"
    - "lib/integrations/shopify/client.ts (ShopifyAdapter skeleton)"
    - "lib/integrations/gmail/client.ts (GmailAdapter skeleton)"
    - "lib/rate-limit.ts (chatRateLimit: Upstash slidingWindow 30/min)"
    - "tests/unit/hello-world.test.ts (5 tests: checkpoint payloads in order + serve route exports)"
    - "tests/unit/sdk-smoke.test.ts (6 tests: import checks always run; live API tests skip without keys)"
    - "tests/unit/adapters.test.ts (6 tests: isHealthy()=false, refreshToken() rejects)"
    - "tests/unit/rate-limit.test.ts (4 tests: module import + offline blocked-after-limit behavior)"
  modified:
    - "vitest.config.mts (voyageai CJS alias + no change to existing test env stubs)"
decisions:
  - "Inngest 4.x createFunction uses 2-arg API (options, handler) — trigger goes inside options.triggers[] not as a separate second arg; RESEARCH.md pattern was written for v3 3-arg API"
  - "Voyage AI SDK v0.2.1 returns {data: [{embedding: number[]}]} — RESEARCH.md example used result.embeddings![0] which is incorrect; fixed to result.data?.[0]?.embedding"
  - "voyageai CJS alias in vitest.config.mts: voyageai ESM build has a broken directory import (dist/esm/api) that Node ESM cannot resolve; CJS build works correctly"
  - "Rate-limit offline mock uses fixedWindow (simpler Lua logic) not slidingWindow — chatRateLimit uses slidingWindow in production; mock tests prove block behavior correctly regardless of algorithm"
  - "chatRateLimit uses analytics:true for observability (every rate-limit decision recorded in Upstash)"
metrics:
  duration: "~45 minutes"
  completed_date: "2026-05-21"
  tasks_completed: 2
  tasks_total: 3
  tasks_pending_human: 1
  files_created: 13
  files_modified: 1
---

# Phase 01 Plan 03: Agent-Tier Rails Summary

**One-liner:** Inngest durable hello-world with two step.run checkpoints + per-user concurrency key; Anthropic SDK + Voyage voyage-4 (1024-dim) callable from the agent tier; IntegrationAdapter interface with ShopifyAdapter/GmailAdapter compile-only skeletons; Upstash rate limiter (30/min); all unit tests green without live keys.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| Task 1 | Inngest client, durable hello-world function, serve route (+ test) | a933483 | lib/inngest/client.ts, lib/inngest/functions/hello-world.ts, app/api/inngest/route.ts, tests/unit/hello-world.test.ts |
| Task 2 | Anthropic + Voyage SDK wiring, adapter skeletons, rate limiter (+ tests) | 1ff1b35 | lib/agent/anthropic.ts, lib/agent/embeddings.ts, lib/integrations/adapter.ts, lib/integrations/shopify/client.ts, lib/integrations/gmail/client.ts, lib/rate-limit.ts, tests/unit/sdk-smoke.test.ts, tests/unit/adapters.test.ts, tests/unit/rate-limit.test.ts, vitest.config.mts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inngest 4.x createFunction is 2-arg, not 3-arg**
- **Found during:** Task 1 (tsc --noEmit)
- **Issue:** RESEARCH.md Pattern 5 showed the Inngest v3 3-arg API: `createFunction(fnConfig, {event: '...'}, handler)`. Inngest 4.4.0 uses a 2-arg API: `createFunction(options, handler)` where `triggers` is inside the options object. TypeScript threw TS2554 "Expected 2 arguments but got 3".
- **Fix:** Changed function signature to `createFunction({ id, triggers: [{ event: 'dev/hello.world' }], concurrency, retries }, handler)`.
- **Files modified:** lib/inngest/functions/hello-world.ts
- **Commit:** a933483

**2. [Rule 1 - Bug] Voyage AI SDK v0.2.1 response shape differs from RESEARCH.md**
- **Found during:** Task 2 (tsc --noEmit)
- **Issue:** RESEARCH.md Pattern 6 used `result.embeddings![0]` but the actual `EmbedResponse` type (voyageai 0.2.1) has `{ data: EmbedResponseDataItem[] }` where each item is `{ embedding?: number[] }`. TypeScript threw TS2339 "Property 'embeddings' does not exist on type 'EmbedResponse'".
- **Fix:** Changed to `result.data?.[0]?.embedding` with a null guard that throws if embeddings are absent.
- **Files modified:** lib/agent/embeddings.ts
- **Commit:** 1ff1b35

**3. [Rule 3 - Blocking] voyageai ESM build has broken directory import**
- **Found during:** Task 2 (vitest run sdk-smoke.test.ts)
- **Issue:** Vitest resolves `voyageai` to its ESM build (`dist/esm/extended/index.mjs`) via the `import` condition in the package exports map. That ESM build imports `./api` as a directory (not a file), which Node.js ESM does not support. Error: "Directory import .../voyageai/dist/esm/api is not supported".
- **Fix:** Added `voyageai` alias to `vitest.config.mts` pointing at the CJS build (`dist/cjs/extended/index.js`). This only affects the test environment — the Next.js build uses its own bundler resolution and is unaffected.
- **Files modified:** vitest.config.mts
- **Commit:** 1ff1b35

**4. [Rule 1 - Bug] Rate-limit mock evalsha return format**
- **Found during:** Task 2 (first vitest run showing rate-limit tests failing)
- **Issue:** Initial mock returned `[remaining, effectiveLimit]` but the fixedWindow single-region algorithm expects `[usedTokensAfterUpdate, effectiveLimit]` where `success = usedTokensAfterUpdate <= effectiveLimit`. The mock was returning decreasing values so the N+1th call still showed success.
- **Fix:** Corrected mock to use INCRBY semantics: `[currentCount + increment, limit]`. The N+1th call returns `[limit+1, limit]` which fails `<= effectiveLimit`.
- **Files modified:** tests/unit/rate-limit.test.ts
- **Commit:** 1ff1b35

## Automated Verification Results

```
npx tsc --noEmit     → exit 0 (clean)
npx vitest run       → 7 test files, 38 passed, 3 skipped (live API smoke tests — skip without keys)
grep -c "maxDuration = 60" app/api/inngest/route.ts → 1
```

## Local Dev Instructions

To run Inngest locally for Task 3 verification:

1. Ensure `INNGEST_DEV=1` is set in `.env.local` (already documented in `.env.local.example`).
2. Run `npm run dev` in one terminal.
3. In a second terminal, install and run the Inngest dev server: `npx inngest-cli@latest dev` (or install via `curl -sSfL https://cli.inngest.com/install.sh | sh` and run `inngest dev`).
4. Open the Inngest dev UI at http://localhost:8288.
5. In the "Send Event" panel, send event `dev/hello.world` with body `{ "data": { "userId": "test-user-1" } }`.
6. Confirm both `checkpoint-1` and `checkpoint-2` show as completed steps in the function run view.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `ShopifyAdapter.isHealthy()` always returns `false` | lib/integrations/shopify/client.ts | Phase 1 skeleton — no Shopify credentials exist yet; Phase 2 wires real Shopify API token verification |
| `ShopifyAdapter.refreshToken()` throws `Not implemented until Phase 2` | lib/integrations/shopify/client.ts | Same — Phase 1 interface only |
| `GmailAdapter.isHealthy()` always returns `false` | lib/integrations/gmail/client.ts | Phase 1 skeleton — no Gmail OAuth token stored yet |
| `GmailAdapter.refreshToken()` throws `Not implemented until Phase 2` | lib/integrations/gmail/client.ts | Same |

These stubs are intentional. The IntegrationAdapter interface is fully defined and typed. Phase 2 will wire real implementations behind the same interface with no breaking changes.

## Threat Flags

None beyond the plan's threat model. The surfaces added match exactly what was planned:
- Inngest serve route: INNGEST_SIGNING_KEY is required for production signature verification (T-1-03-01)
- Anthropic/Voyage API keys: server-only env vars, no NEXT_PUBLIC_ prefix used anywhere (T-1-03-02)
- Rate limiter: chatRateLimit guards the future chat endpoint (T-1-03-03)
- Adapter skeletons: no real API calls, no token access (T-1-03-04)

## Self-Check

- [x] `lib/inngest/client.ts` exists: FOUND
- [x] `lib/inngest/functions/hello-world.ts` exists: FOUND
- [x] `app/api/inngest/route.ts` exists with `maxDuration = 60`: VERIFIED (grep count: 1)
- [x] `lib/agent/anthropic.ts` exists and exports `anthropic` + `smokeTestAnthropic`: FOUND
- [x] `lib/agent/embeddings.ts` exists and exports `embedText` with `voyage-4`: FOUND
- [x] `lib/integrations/adapter.ts` exports `IntegrationAdapter`: FOUND
- [x] `lib/integrations/shopify/client.ts` exists (ShopifyAdapter): FOUND
- [x] `lib/integrations/gmail/client.ts` exists (GmailAdapter): FOUND
- [x] `lib/rate-limit.ts` exists and exports `chatRateLimit`: FOUND
- [x] `tests/unit/hello-world.test.ts` 5 tests pass: VERIFIED
- [x] `tests/unit/sdk-smoke.test.ts` 3 tests pass, 3 skipped (keys absent): VERIFIED
- [x] `tests/unit/adapters.test.ts` 6 tests pass: VERIFIED
- [x] `tests/unit/rate-limit.test.ts` 4 tests pass: VERIFIED
- [x] `npx tsc --noEmit` exits 0: VERIFIED
- [x] `npx vitest run` exits 0 (38/38 pass, 3 skip): VERIFIED
- [x] Commit a933483 exists (Task 1): FOUND
- [x] Commit 1ff1b35 exists (Task 2): FOUND
- [x] No NEXT_PUBLIC_ prefix on ANTHROPIC_API_KEY/VOYAGE_API_KEY/UPSTASH_REDIS_*: VERIFIED

## Self-Check: PASSED

## Pending: Task 3 (Checkpoint)

Task 3 (Inngest hello-world deployed verification + SDK smoke with real keys) is a `type="checkpoint:human-verify"` — it requires:
1. Local Inngest dev server to show both checkpoints completed
2. Deployed Inngest dashboard (Vercel + Inngest integration) showing both checkpoints completed without maxDuration timeout
3. Real ANTHROPIC_API_KEY + VOYAGE_API_KEY in env for the SDK smoke test to run live

See checkpoint return message for exact steps.
