---
phase: 1
slug: infrastructure-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit/component) + Playwright (e2e) |
| **Config file** | none — Wave 0 installs (`vitest.config.ts`, `playwright.config.ts`) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~30 seconds (unit) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Filled by the planner from PLAN.md tasks. One row per task; each row maps a requirement to an automated command or a Wave 0 dependency.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | INFRA-* / AUTH-* | T-1-01 / — | (planner fills) | unit/e2e | `npx vitest run` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 3 | AUTH-01, AUTH-03 | T-1-04-02 | Unauth /app/* redirects to /login; signup happy path reaches guarded /app/home | e2e | `npx playwright test tests/e2e/auth-skeleton.spec.ts` | ❌ W0 (playwright.config.ts) | ⬜ pending |
| 1-04-02 | 04 | 3 | AUTH-01, AUTH-02, AUTH-03 | T-1-04-01 / -03 / -04 / -05 / -06 / -07 | getClaims() (not getSession()) session validation; safe OAuth callback exchange + next-param redirect; httpOnly cookie; RLS-enforced user_profiles round-trip | unit/e2e | `npx tsc --noEmit && npx vitest run tests/unit/middleware.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-03 | 04 | 3 | AUTH-03 | T-1-04-01 / -02 | Middleware redirects unauthenticated /app/* to /login; public paths pass through; claimed /app/home passes through | unit | `npx vitest run tests/unit/middleware.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-04 | 04 | 3 | AUTH-01, AUTH-02, AUTH-03 | T-1-04-03 / -04 / -05 | Live Google OAuth round-trip, single-row user_profiles write, cookie flags, open-redirect rejection | manual (human-verify) | manual-only (real Supabase + Google consent) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` + `package.json` test scripts — framework install (no framework exists yet — greenfield)
- [ ] `playwright.config.ts` — e2e config for the walking-skeleton happy path (signup → protected page); created in Plan 04 Task 1
- [ ] Test DB / Supabase preview branch fixtures for RLS + migration verification

*Greenfield project — Wave 0 must install and configure the entire test toolchain.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel + Supabase + Inngest project provisioning | INFRA-01, INFRA-05 | External account/dashboard setup not scriptable in CI | Create projects, capture env vars/keys; verify deploy + Inngest event keys present |
| Deployed Inngest durable function checkpoints in production | INFRA-05 | Requires a real Vercel deploy (local dev cannot prove the `maxDuration=60` deploy-time behavior) | Trigger hello-world event on preview deploy; confirm step checkpoints in Inngest dashboard |
| Google OAuth round-trip | AUTH-02 | Requires real Google OAuth consent screen | Manual sign-in with a Google account; confirm callback exchanges the code and lands on /app/home (Plan 04 Task 4) |
| Live user_profiles round-trip + httpOnly cookie + open-redirect rejection | AUTH-01, AUTH-03 | Requires a live Supabase project (real DB write) + browser cookie inspection | Plan 04 Task 4: signup creates exactly one user_profiles row (no duplicate on reload); cookie is HttpOnly/Secure; next=absolute does not navigate off-origin |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
