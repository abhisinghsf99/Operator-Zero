---
phase: "01-infrastructure-foundation"
plan: "01"
subsystem: "infrastructure"
tags: ["scaffold", "next.js", "sentry", "ci", "typescript", "tailwind", "vitest"]
dependency_graph:
  requires: []
  provides:
    - "Next.js 16 App Router project shell"
    - "TypeScript strict mode + @/* path alias"
    - "Vitest test harness"
    - "Sentry client + server + edge instrumentation"
    - "Health route (GET /api/health)"
    - "GitHub Actions CI workflow"
  affects:
    - "All subsequent plans in Phase 01 (unblocked by this scaffold)"
tech_stack:
  added:
    - "next@16.2.6 (App Router, React 19)"
    - "@sentry/nextjs@10.53.1"
    - "@supabase/ssr@0.10.3"
    - "@supabase/supabase-js@2.106.1"
    - "drizzle-orm@0.45.2 + drizzle-kit@0.31.10"
    - "postgres@3.4.9"
    - "inngest@4.4.0"
    - "@anthropic-ai/sdk@0.97.1"
    - "voyageai@0.2.1"
    - "libsodium-wrappers@0.8.4"
    - "zod@^3.24.0"
    - "@upstash/ratelimit@2.0.8 + @upstash/redis@1.38.0"
    - "@vercel/analytics@2.0.1"
    - "tailwindcss@4.3.0 + @tailwindcss/postcss"
    - "vitest@4.1.7 + @vitejs/plugin-react@6.0.2"
  patterns:
    - "Sentry Next.js 15+ file convention (instrumentation-client.ts / instrumentation.ts)"
    - "withSentryConfig() wrapper in next.config.ts"
    - "SENTRY_AUTH_TOKEN gates source map upload to CI only"
    - "Structured JSON console.log in health route for future Axiom drain"
key_files:
  created:
    - "package.json"
    - "tsconfig.json (strict: true, noUncheckedIndexedAccess: true, @/* alias)"
    - "next.config.ts (withSentryConfig wrapper)"
    - "tailwind.config.ts"
    - "postcss.config.mjs"
    - "eslint.config.mjs"
    - "vitest.config.mts"
    - ".nvmrc (Node 25.6.1)"
    - ".env.local.example (14 env vars documented)"
    - "app/layout.tsx"
    - "app/page.tsx"
    - "app/globals.css"
    - "app/global-error.tsx (Sentry error boundary)"
    - "app/api/health/route.ts (GET 200; ?testError=1 -> Sentry.captureException)"
    - "instrumentation-client.ts (browser Sentry init)"
    - "instrumentation.ts (runtime detection)"
    - "sentry.server.config.ts"
    - "sentry.edge.config.ts"
    - "tests/unit/smoke.test.ts"
    - ".github/workflows/ci.yml"
  modified:
    - ".gitignore (extended with *.tsbuildinfo; existing rules preserved)"
decisions:
  - "Manual Sentry setup (Pattern 8 files) used instead of npx @sentry/wizard — wizard requires interactive TTY"
  - "Axiom skipped entirely per user decision — structured JSON log line added to health route as future drain target"
  - "Vercel project link deferred to Task 5 PR step per plan"
  - "SENTRY_AUTH_TOKEN gates source map upload so local dev builds are not blocked by missing CI secrets"
  - "Tailwind v4 used (4.3.0 installed) with @tailwindcss/postcss adapter instead of legacy postcss plugin"
  - "NEXT_PUBLIC_SENTRY_DSN accepted as fallback in instrumentation-client.ts (browser cannot read SENTRY_DSN without NEXT_PUBLIC_ prefix)"
metrics:
  duration: "~30 minutes"
  completed_date: "2026-05-21"
  tasks_completed: 2
  tasks_total: 5
  tasks_pending_human: 1
  files_created: 20
  files_modified: 1
---

# Phase 01 Plan 01: Infrastructure Scaffold Summary

**One-liner:** Next.js 16 App Router skeleton with TypeScript strict, full locked dep set, Sentry instrumentation (client/server/edge), health route, and GitHub Actions CI — all three automated verifications (tsc, vitest, build) pass.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| Task 1 | Verify package legitimacy (human gate) | (pre-approved by orchestrator) | — |
| Task 2 | Provision external accounts (human gate) | (pre-done by user) | .env.local (gitignored) |
| Task 3 | Scaffold Next.js 16 + deps + TS + Tailwind + Vitest | 19fe4e1 | package.json, tsconfig.json, vitest.config.mts, app/, tests/ |
| Task 4 | Sentry (client/server/edge) + health route + CI | 5f55735 | instrumentation*.ts, sentry.*.ts, app/api/health/route.ts, .github/workflows/ci.yml |

## Deviations from Plan

### Accepted Deviations (pre-authorized by orchestrator preamble)

**1. [Accepted] Axiom skipped entirely**
- **Authorized by:** CRITICAL_PREAMBLE ("Axiom was skipped entirely by the user")
- **Impact on INFRA-08:** Partially satisfied — Sentry is wired and verifiable; Axiom log drain is deferred
- **Mitigation:** A structured JSON `console.log` line was added to the health route's `?testError=1` path. This future-proofs the route: when the Axiom Vercel log drain is eventually installed (no code change needed — it's a dashboard integration), that log line will be captured automatically.
- **INFRA-08 status:** Partially satisfied (Sentry ✓ / Axiom deferred)

**2. [Accepted] Vercel project link deferred to Task 5 (PR step)**
- **Authorized by:** CRITICAL_PREAMBLE ("Vercel project link + preview deploys are deferred to Task 5")
- **Impact:** CI cannot be verified as green until a PR is opened against the Vercel-linked repo. The `ci.yml` workflow exists and is syntactically correct; human verification at Task 5 will confirm it runs.

### Auto-fix Deviations

**3. [Rule 3 - Blocking] Sentry wizard not used (TTY limitation)**
- **Found during:** Task 4
- **Issue:** `npx @sentry/wizard@latest -i nextjs` requires interactive TTY input; cannot run non-interactively in the executor context
- **Fix:** Manually created all 6 Sentry files following Pattern 8 from RESEARCH.md exactly: `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`, `next.config.ts` wrapped with `withSentryConfig()`
- **Result:** Functionally equivalent to wizard output; typechecks clean

**4. [Rule 2 - Missing Critical] NEXT_PUBLIC_SENTRY_DSN fallback in browser init**
- **Found during:** Task 4
- **Issue:** The browser bundle cannot read `SENTRY_DSN` (no `NEXT_PUBLIC_` prefix). Without a public DSN env var, Sentry would silently not initialize in the browser.
- **Fix:** `instrumentation-client.ts` reads `process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN` — allows callers to either set `SENTRY_DSN` (server-only, no browser tracking) or `NEXT_PUBLIC_SENTRY_DSN` (exposes DSN to browser, enables client-side error tracking). DSN is not a secret — it is safe to expose publicly.
- **Note:** `.env.local.example` can be updated to document `NEXT_PUBLIC_SENTRY_DSN` when the Vercel env is configured.

**5. [Rule 2 - Missing Critical] *.tsbuildinfo added to .gitignore**
- **Found during:** Task 3 (post-commit cleanup review)
- **Issue:** TypeScript incremental build generates `tsconfig.tsbuildinfo` — a build artifact that should not be tracked
- **Fix:** Added `*.tsbuildinfo` to `.gitignore` (existing rules preserved; nothing removed)

**6. [Rule 3 - Blocking] Tailwind v4 postcss adapter required**
- **Found during:** Task 3
- **Issue:** Tailwind v4 uses `@tailwindcss/postcss` instead of the legacy `tailwindcss` postcss plugin. The `postcss.config.mjs` and `globals.css` (using `@import "tailwindcss"`) were written for v4 from the start.
- **Fix:** Installed `@tailwindcss/postcss` automatically via npm. Build passes.

## INFRA-08 Partial Satisfaction Status

| Observability Tool | Status | Evidence |
|-------------------|--------|---------|
| Sentry client (browser) | Wired | `instrumentation-client.ts` initializes with `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` |
| Sentry server | Wired | `sentry.server.config.ts` + `instrumentation.ts` registers on `nodejs` runtime |
| Sentry edge | Wired | `sentry.edge.config.ts` + `instrumentation.ts` registers on `edge` runtime |
| Sentry captureException smoke | Wired | `GET /api/health?testError=1` calls `Sentry.captureException(new Error('phase-1 sentry smoke'))` |
| Axiom log drain | Deferred | Vercel dashboard integration (no code needed); structured JSON log line in health route ready to be captured when drain is installed |

## Automated Verification Results

All three automated checks pass (verified before Task 4 commit):

```
npx tsc --noEmit        → exit 0 (no output = clean)
npx vitest run          → 1 test file, 2 tests passed
npm run build           → Next.js 16 production build succeeds; /api/health route shows as dynamic
```

## Known Stubs

None — this plan creates infrastructure/config only, no UI data flows.

## Threat Flags

None beyond the plan's threat model. No new network endpoints, auth paths, or trust boundary crossings introduced that were not already in scope:
- `/api/health` was explicitly planned (T-1-01-03 accepted the `?testError` trigger as a benign smoke endpoint)
- Sentry DSN exposure in browser init is intentional and safe (DSN is not a secret per Sentry's own documentation)

## Self-Check

- [x] `package.json` exists at repo root: FOUND
- [x] `vitest.config.mts` exists: FOUND
- [x] `.github/workflows/ci.yml` exists: FOUND
- [x] `instrumentation-client.ts` exists: FOUND
- [x] `sentry.server.config.ts` exists: FOUND
- [x] `app/api/health/route.ts` exists: FOUND
- [x] Commit `19fe4e1` exists (Task 3): FOUND
- [x] Commit `5f55735` exists (Task 4): FOUND
- [x] `.env.local` is gitignored (`git check-ignore .env.local` succeeds): VERIFIED
- [x] `.env.local.example` is tracked (not gitignored): VERIFIED
- [x] `next.config.ts` contains `withSentryConfig`: VERIFIED

## Self-Check: PASSED
