---
phase: quick-260526-fmp
plan: "01"
subsystem: auth/ui
tags: [demo-mode, auth, settings, login, banner]
dependency_graph:
  requires: []
  provides: [demo-mode, enterDemo-action, demo-banner, settings-demo-guards]
  affects: [app/(auth)/login, app/app/layout, app/app/settings/actions]
tech_stack:
  added: []
  patterns: [server-only-env-reads, server-action-redirect, async-server-component]
key_files:
  created:
    - lib/auth/demo.ts
    - components/layout/demo-banner.tsx
  modified:
    - app/(auth)/login/actions.ts
    - app/(auth)/login/page.tsx
    - app/app/layout.tsx
    - app/app/settings/actions.ts
decisions:
  - "Demo credentials read exclusively from server-side env vars; never referenced in any 'use client' file or NEXT_PUBLIC_ var"
  - "enterDemo() mirrors the existing login() post-sign-in block (recordSession + cancelDeletionIfPending) for parity"
  - "app/app/layout.tsx made async to read getClaims().sub for isDemoUser check; outer flex-col + inner flex-1 min-h-0 preserves h-screen/overflow scrolling and BottomTabs"
  - "updateEmail/updatePassword: added const userId = claims.sub as string before demo guard since these functions previously had no userId var"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-26"
  tasks_completed: 3
  files_changed: 6
---

# Quick Task 260526-fmp: Add One-Click Public Demo Mode with Banner

**One-liner:** Server-only demo mode with real Supabase session, persistent in-app banner, and 6 destructive-action guards — credentials strictly server-side.

## What Was Built

### Task 1: Server-only demo helper + enterDemo() action + login CTA (commit d80c542)

- `lib/auth/demo.ts`: Three exports — `isDemoUser(userId)`, `getDemoCredentials()`, `DEMO_DISABLED_MESSAGE`. No "use client" directive; reads `DEMO_USER_ID`, `DEMO_EMAIL`, `DEMO_PASSWORD` from `process.env` server-side only.
- `app/(auth)/login/actions.ts`: Added `enterDemo()` server action. Reads credentials via `getDemoCredentials()`, calls `supabase.auth.signInWithPassword`, mirrors the session-registry block from `login()` (recordSession + cancelDeletionIfPending in a non-fatal try/catch), then `redirect("/app/workflows")`.
- `app/(auth)/login/page.tsx`: Added `useTransition` + `demoError` state. Demo CTA ("View the live demo →") rendered as the primary `Button` above the "Welcome back" heading, with a 12px disclaimer line and `AuthDivider` separating it from the existing login form. `demoError` and `state?.error` unified into a single `role="alert"` region. All existing form elements, Google sign-in, and signup link unchanged.

### Task 2: DemoBanner component + app layout wire (commit 7364e44)

- `components/layout/demo-banner.tsx`: Slim `role="note"` strip — 30px height, `flex-shrink: 0`, background `var(--acc-chat-bg)`, color `var(--text-secondary)`, 0.5px `var(--border)` hairline bottom. Exact copy as specified.
- `app/app/layout.tsx`: Made async. Reads `getClaims().sub` via `isDemoUser()`. Outer div changed to `flex flex-col` with `DemoBanner` as first child (only when `isDemo`); existing Sidebar/main/BottomTabs row moved into `flex flex-1 min-h-0` inner div. `h-screen overflow-hidden`, `id="main-content"`, `tabIndex={-1}` all preserved.

### Task 3: Guard 6 destructive settings actions (commit d7b7cc0)

Imported `isDemoUser` and `DEMO_DISABLED_MESSAGE` from `@/lib/auth/demo` in `app/app/settings/actions.ts`. Added `if (isDemoUser(userId)) return { error: DEMO_DISABLED_MESSAGE }` guard in:

1. `disconnectIntegration` — after `userId = claims.sub`, before `withUserRls` delete
2. `requestAccountDeletion` — after `userId = claims.sub`, before active-run gate
3. `signOutEverywhere` — after `userId = claims.sub`, before `registrySignOutEverywhere`
4. `revokeSession` — after `userId = claims.sub` (post Zod parse), before `registryRevokeSession`
5. `updateEmail` — added `const userId = claims.sub as string` then guard, before `auth.updateUser`
6. `updatePassword` — same as updateEmail

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All wiring is complete; demo mode is functional end-to-end once DEMO_EMAIL/DEMO_PASSWORD/DEMO_USER_ID env vars are set in the environment.

## Threat Flags

No new security surface introduced. The demo path uses the existing auth model (real signInWithPassword session, existing RLS). DEMO_PASSWORD never reaches the client bundle — confirmed by `grep -rn "DEMO_PASSWORD|getDemoCredentials|DEMO_USER_ID" --include="*.tsx"` returning no hits in any client file.

## Verification

- `npx tsc --noEmit` — clean (no errors)
- `npx vitest run` — 351 passed, 3 skipped, 12 todo (all pre-existing)
- `grep -rn "DEMO_PASSWORD|getDemoCredentials|DEMO_USER_ID" --include="*.tsx"` — no hits in client files
- `git status` — only `.planning/` and `HANDOFF.md` untracked; all 6 modified files committed

## Self-Check: PASSED

- lib/auth/demo.ts: exists (created in commit d80c542)
- components/layout/demo-banner.tsx: exists (created in commit 7364e44)
- app/(auth)/login/actions.ts: enterDemo() exported (commit d80c542)
- app/(auth)/login/page.tsx: demo CTA + demoError + disclaimer rendered (commit d80c542)
- app/app/layout.tsx: async, isDemoUser, DemoBanner conditional (commit 7364e44)
- app/app/settings/actions.ts: 6 isDemoUser(userId) guards (commit d7b7cc0)
- All commits verified in git log
