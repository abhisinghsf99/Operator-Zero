---
phase: "01-infrastructure-foundation"
plan: "04"
subsystem: "auth"
tags: ["auth", "supabase-ssr", "middleware", "oauth", "jwt", "playwright", "tdd", "walking-skeleton", "rls", "open-redirect"]
dependency_graph:
  requires:
    - "01-01 (Next.js scaffold, all deps installed, @supabase/ssr@0.10.3)"
    - "01-02 (db + serviceDb clients, user_profiles schema with RLS)"
  provides:
    - "lib/auth/server.ts: createClient() — async server-side Supabase client over awaited cookies()"
    - "lib/auth/client.ts: createBrowserClient() — browser client for Google OAuth button"
    - "lib/auth/middleware.ts: updateSession() — getClaims() guard + rolling cookie refresh"
    - "lib/auth/profile.ts: getOrCreateProfile() — create-once-read-thereafter user_profiles via RLS db"
    - "middleware.ts: root middleware delegating to updateSession(), matcher excludes static assets"
    - "app/(auth)/signup: email+password signup Server Action with Zod validation"
    - "app/(auth)/login: email+password login + Google OAuth button (browser client)"
    - "app/auth/callback/route.ts: OAuth code exchange with validateNextParam() open-redirect guard"
    - "app/(app)/layout.tsx: authenticated shell layout"
    - "app/(app)/home/page.tsx: guarded RSC performing user_profiles round-trip via getOrCreateProfile()"
    - "playwright.config.ts: e2e harness (testDir=tests/e2e, baseURL localhost:3000)"
    - "tests/e2e/auth-skeleton.spec.ts: walking-skeleton e2e (unauth guard GREEN, open-redirect GREEN)"
    - "tests/unit/middleware.test.ts: 6-test route-guard unit suite (all GREEN)"
  affects:
    - "All Phase 2 routes that require auth (chat, workflows, catalog, inventory)"
    - "Any agent-tier code reading user_id from claims"
tech_stack:
  added:
    - "@playwright/test@1.60.0 (e2e harness, Chromium)"
    - "Supabase getClaims() API (replaces getSession() for JWT validation)"
    - "useActionState (React 19 Server Action state hook) — replaces deprecated useFormState"
  patterns:
    - "RESEARCH.md Pattern 1: createServerClient over await cookies() — Next.js 15 Pitfall 5 avoided"
    - "RESEARCH.md Pattern 2: updateSession() with getClaims() — never getSession() (Pitfall 1)"
    - "Open-redirect guard: validateNextParam() rejects absolute URLs and // protocol-relative paths"
    - "TDD: middleware unit tests written to drive the guard contract"
    - "create-once-read-thereafter: getOrCreateProfile() SELECT then conditional INSERT"
key_files:
  created:
    - "lib/auth/server.ts"
    - "lib/auth/client.ts"
    - "lib/auth/middleware.ts"
    - "lib/auth/profile.ts"
    - "middleware.ts"
    - "app/(auth)/signup/page.tsx"
    - "app/(auth)/signup/actions.ts"
    - "app/(auth)/login/page.tsx"
    - "app/(auth)/login/actions.ts"
    - "app/auth/callback/route.ts"
    - "app/(app)/layout.tsx"
    - "app/(app)/home/page.tsx"
    - "playwright.config.ts"
    - "tests/e2e/auth-skeleton.spec.ts"
    - "tests/unit/middleware.test.ts"
  modified:
    - "package.json (added @playwright/test devDep + test:e2e script)"
    - "vitest.config.mts (exclude tests/e2e/** from vitest run)"
    - ".planning/phases/01-infrastructure-foundation/01-VALIDATION.md (rows 1-04-01 to 1-04-03 flipped green)"
decisions:
  - "getClaims() returns { data: { claims, header, signature } | null } — destructure data then access .claims, not { data: { claims } } which fails when data is null; fixed as auto-bug Rule 1"
  - "Playwright response.status() after page.goto() returns the FINAL response status (200 from /login page after redirect) — URL assertion is the canonical redirect proof; status assertion corrected"
  - "useActionState used instead of deprecated useFormState for React 19 Server Action state binding in signup/login pages"
  - "vitest.config.mts: tests/e2e/** excluded via test.exclude to prevent Playwright's test() from conflicting with Vitest's test() globals"
  - "Signup e2e test skips without NEXT_PUBLIC_SUPABASE_URL — prevents CI failures without live Supabase; unauth guard and open-redirect tests always run"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-22"
  tasks_completed: 3
  tasks_total: 4
  tasks_pending_human: 1
  files_created: 15
  files_modified: 3
---

# Phase 01 Plan 04: Auth + Walking Skeleton Summary

**One-liner:** email/password signup+login via @supabase/ssr Server Actions + Google OAuth + getClaims() middleware guard on /app/* + guarded /app/home doing a single RLS-enforced user_profiles round-trip; open-redirect guard on callback; 6 unit + 2 e2e tests green.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| Task 1 (RED) | Failing Playwright e2e (walking-skeleton spec) | ca4829d | playwright.config.ts, tests/e2e/auth-skeleton.spec.ts |
| Task 2 | Auth clients + middleware + signup/login + OAuth callback + guarded /app/home | 03f34e0 | lib/auth/{server,client,middleware,profile}.ts, middleware.ts, app/(auth)/*, app/auth/callback, app/(app)/* |
| Task 3 | Middleware unit tests + e2e GREEN | 52b3fab | tests/unit/middleware.test.ts, tests/e2e/auth-skeleton.spec.ts (fix), 01-VALIDATION.md |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] getClaims() actual return shape differs from RESEARCH.md pattern**
- **Found during:** Task 2 (npx tsc --noEmit)
- **Issue:** RESEARCH.md Pattern 2 showed destructuring as `const { data: { claims } } = await supabase.auth.getClaims()`. The actual @supabase/auth-js GoTrueClient type is `Promise<{ data: { claims, header, signature } | null; error: null | AuthError }>`. When there is no session, `data` is `null`, not `{ claims: null }`. The destructuring pattern fails TypeScript strict mode with TS2339 "Property 'claims' does not exist on type '... | null'".
- **Fix:** Changed destructuring to `const { data: claimsData } = await supabase.auth.getClaims(); const claims = claimsData?.claims ?? null;` in both lib/auth/middleware.ts and lib/auth/profile.ts.
- **Files modified:** lib/auth/middleware.ts, lib/auth/profile.ts
- **Commit:** 03f34e0

**2. [Rule 1 - Bug] Playwright status assertion — response.status() is final-response status**
- **Found during:** Task 3 (npx playwright test)
- **Issue:** The e2e test asserted `expect(response?.status()).not.toBe(200)` intending to prove a redirect occurred. However, Playwright's `page.goto()` follows redirects and returns the status of the FINAL response (200 from the /login page). The redirect IS happening (URL assertion `toHaveURL(/\/login/)` passes), but the status check was incorrect.
- **Fix:** Updated assertion to `expect(response?.status()).toBe(200)` with a comment explaining that the URL assertion is the canonical proof of redirect.
- **Files modified:** tests/e2e/auth-skeleton.spec.ts
- **Commit:** 52b3fab

**3. [Rule 3 - Blocking] vitest picked up Playwright e2e spec file**
- **Found during:** Task 2 verification (npx vitest run)
- **Issue:** Vitest's default test file glob matches `tests/e2e/auth-skeleton.spec.ts`. The file uses `@playwright/test` which registers a `test()` global that conflicts with Vitest's `test()` global. Error: "Playwright Test did not expect test() to be called here."
- **Fix:** Added `exclude: ["tests/e2e/**", "node_modules/**"]` to vitest.config.mts test options.
- **Files modified:** vitest.config.mts
- **Commit:** 03f34e0 (bundled with Task 2 commit)

## E2E Test Side-Effect Note

The signup happy-path e2e test (test 2 in auth-skeleton.spec.ts) creates a **real user in the live Supabase auth.users table** when run with a live `NEXT_PUBLIC_SUPABASE_URL`. The test email is `walking-skeleton+<timestamp>@example.com` — a unique address per run. This is the expected and intentional side effect of a walking-skeleton proof: it demonstrates that real auth works end-to-end.

These test users accumulate in the Supabase `auth.users` table across repeated runs. They can be safely deleted via the Supabase dashboard (Authentication → Users) without affecting the application. Alternatively, a dedicated Supabase preview project (separate from production) should be used for e2e runs.

## Automated Verification Results

```
npx tsc --noEmit            → exit 0 (clean, strict mode)
npx vitest run              → 8 test files, 44 passed | 3 skipped
npx playwright test         → 2 passed, 1 skipped
  ✓ unauth /app/home → /login redirect (GREEN)
  ✓ open-redirect rejection via /auth/callback?next=absolute (GREEN)
  - signup happy path (SKIPPED — no live Supabase in test env)
```

## Open-Redirect Security Verification

The `validateNextParam()` function in `app/auth/callback/route.ts` enforces:
- Rejects absolute URLs (`http://`, `https://`, `javascript:`, etc.) — regex `/^[a-zA-Z][a-zA-Z0-9+\-.]*:/`
- Rejects protocol-relative URLs (`//evil.example`) — prefix check
- Accepts only paths starting with `/` that do not match either rejection rule
- Default fallback: `/app/home` for any invalid or absent `next` value

The Playwright e2e test 3 (open-redirect rejection) probes `/auth/callback?next=https://evil.example.com/steal` and asserts the final URL is `http://localhost:3000/*`, not `evil.example`.

## Known Stubs

None — all files in this plan are fully wired. The `app/(app)/home/page.tsx` performs a real Drizzle `user_profiles` round-trip (not a mock).

The app/(app)/layout.tsx header contains a "Walking Skeleton — Phase 1" label — this is intentional scaffolding that Phase 2 will replace with a full nav.

## Threat Flags

None beyond the plan's threat model. All surfaces introduced match the planned scope:
- New auth routes: (auth)/signup, (auth)/login, auth/callback — all within scope
- Root middleware: matches the planned coverage pattern
- getClaims() used throughout — no getSession() calls in any new file (T-1-04-01)
- No NEXT_PUBLIC_ prefix on service-role or secret keys (T-1-04-06)
- user_profiles read/write only via RLS db client — serviceDb not imported in any web-tier file (T-1-04-07)

## Self-Check

- [x] lib/auth/server.ts exists: FOUND
- [x] lib/auth/client.ts exists: FOUND
- [x] lib/auth/middleware.ts exists with getClaims(): FOUND
- [x] lib/auth/profile.ts exists and exports getOrCreateProfile: FOUND
- [x] middleware.ts exists with getClaims() and correct matcher: FOUND
- [x] app/(auth)/signup/page.tsx exists: FOUND
- [x] app/(auth)/signup/actions.ts exists: FOUND
- [x] app/(auth)/login/page.tsx exists: FOUND
- [x] app/(auth)/login/actions.ts exists: FOUND
- [x] app/auth/callback/route.ts exists with exchangeCodeForSession and validateNextParam: FOUND
- [x] app/(app)/layout.tsx exists: FOUND
- [x] app/(app)/home/page.tsx exists with data-testid=home-greeting: FOUND
- [x] playwright.config.ts exists with testDir tests/e2e and webServer: FOUND
- [x] tests/e2e/auth-skeleton.spec.ts exists with 3 specs: FOUND
- [x] tests/unit/middleware.test.ts exists: FOUND
- [x] npx tsc --noEmit exits 0: VERIFIED
- [x] npx vitest run exits 0 (44 pass, 3 skip): VERIFIED
- [x] npx playwright test: 2 pass, 1 skip: VERIFIED
- [x] Commit ca4829d (Task 1 RED): FOUND
- [x] Commit 03f34e0 (Task 2 implementation): FOUND
- [x] Commit 52b3fab (Task 3 unit + e2e GREEN): FOUND
- [x] No .getSession() method calls in any new file: VERIFIED
- [x] No NEXT_PUBLIC_ prefix on service-role/encryption/anthropic keys: VERIFIED

## Self-Check: PASSED

## Pending: Task 4 (Checkpoint — Human Verify)

Task 4 is a `type="checkpoint:human-verify"` requiring:
1. Google OAuth provider configured in Supabase dashboard
2. Real browser verification: sign up, Google OAuth, user_profiles single-row round-trip
3. Cookie flag inspection (HttpOnly, Secure)
4. Open-redirect probe in real browser (http://localhost:3000/auth/callback?next=https://evil.example)

See checkpoint return message for exact verification steps.
