---
phase: 04-polish-effortless-daily-use
plan: "04"
subsystem: settings, auth, workflow-engine
tags: [autonomy, sessions, session-registry, settings, server-actions, d-06, d-09, d-10, inngest, supabase-auth]

# Dependency graph
requires:
  - phase: 04-01
    provides: user_sessions schema (AUTH-04/05), Wave-0 RED scaffolds (autonomy.test.ts, sessions.test.ts)
  - phase: 04-03
    provides: settings/page.tsx + actions.ts (extended, not clobbered)
provides:
  - getEffectiveAutomationLevel helper (lib/workflows/autonomy.ts) — pure D-06 one-directionality
  - Autonomy override gate in execute-workflow-run.ts (D-07b) — reads per_action_overrides, computes effectiveAutomationLevel
  - saveAutonomyThresholds + getAutonomyThresholds server actions (SET-03)
  - lib/auth/session-registry.ts: recordSession, listSessions, revokeSession, signOutEverywhere, cancelDeletionIfPending
  - revokeSession + signOutEverywhere + listSessions server actions in settings/actions.ts (AUTH-04/05)
  - app/auth/callback/route.ts: session registry write + D-09 cancel on OAuth login
  - app/(auth)/login/actions.ts: session registry write + D-09 cancel on password login
  - AutonomySection component (_autonomy.tsx): LevelToggle + D-05 curated override rows
  - SessionsSection component (_sessions.tsx): session list + revoke + sign-out-everywhere
  - settings/page.tsx extended with AutonomySection + SessionsSection
affects: [04-05, 04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getEffectiveAutomationLevel pure helper — levelOrder {L1:1,L2:2,L3:3}, picks override only when strictly more restrictive (D-06)"
    - "autonomy override gate as step.run inside execute-workflow-run.ts loop — serviceDb query for per_action_overrides, uses helper"
    - "recordSession with ON CONFLICT (supabase_session_id) DO UPDATE last_seen_at — idempotent for refresh flows"
    - "cancelDeletionIfPending — checks deletion_requested_at, sends account.deletion_cancelled to Inngest, clears column (D-09)"
    - "admin.signOut(userId, 'others') for per-session revoke; admin.signOut(userId, 'global') for sign-out-everywhere"
    - "JWT honesty pattern — surfaces ~15-min access-token window in UI confirm dialogs (T-4-04-04)"
    - "LevelToggle as role=radiogroup + aria-checked buttons; ToggleSwitch as role=switch + aria-checked"

key-files:
  created:
    - lib/workflows/autonomy.ts
    - lib/auth/session-registry.ts
    - app/app/settings/_autonomy.tsx
    - app/app/settings/_sessions.tsx
  modified:
    - lib/inngest/functions/execute-workflow-run.ts
    - app/app/settings/actions.ts
    - app/app/settings/page.tsx
    - app/auth/callback/route.ts
    - app/(auth)/login/actions.ts

key-decisions:
  - "[04-04] getEffectiveAutomationLevel is a standalone pure helper in lib/workflows/autonomy.ts — exported so execute-workflow-run.ts and unit tests share the same levelOrder logic without duplication"
  - "[04-04] Override gate placed inside step.run() in execute-workflow-run.ts — DB query happens in a checkpointed Inngest step, not at module level; deterministic step ID uses i + workflowStep.id"
  - "[04-04] Zod enum cast via spread + unknown cast ([...CURATED_OVERRIDE_TOOLS] as unknown as [string, ...string[]]) — TypeScript requires mutable tuple for z.enum; readonly-to-mutable cast via unknown is intentional"
  - "[04-04] admin.signOut second arg is a string scope ('others' | 'global'), not an object — Supabase JS SDK v2 API (fixed from {scope: 'others'} which caused type error TS2345)"
  - "[04-04] recordSession is non-fatal in both login paths — errors are logged (JSON structured) but never block the login redirect; session registry failure is not a login blocker"
  - "[04-04] cancelDeletionIfPending takes inngest client as parameter to avoid circular import between session-registry and inngest/client modules"

# Metrics
duration: ~55min
completed: 2026-05-23
---

# Phase 4 Plan 04: Autonomy Thresholds + Session Management Summary

**Autonomy override gate (one-directional, D-06), session registry with UA/coarse-geo labels, per-session revoke + sign-out-everywhere, cancel-deletion-on-signin (D-09), and the Autonomy + Sessions Settings sections — all Wave-0 RED tests turned GREEN**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-05-23T00:05:00Z
- **Completed:** 2026-05-23T00:50:00Z
- **Tasks:** 3 (all auto)
- **Files modified:** 9 (4 created, 5 extended)

## Accomplishments

- **`lib/workflows/autonomy.ts`**: Pure `getEffectiveAutomationLevel` helper implementing D-06 one-directional logic (`levelOrder {L1:1,L2:2,L3:3}`, override chosen only when strictly more restrictive). Exports `CURATED_OVERRIDE_TOOLS` (D-05 set) and `LEVEL_ORDER`. `autonomy.test.ts` 3/3 GREEN.
- **`lib/inngest/functions/execute-workflow-run.ts`**: Autonomy override gate inserted before L2 branch check (D-07b). Reads `per_action_overrides` from `autonomy_thresholds` via serviceDb (explicit user_id filter, T-2-07-04), computes `effectiveAutomationLevel` using the pure helper. An L2 override on an L3 workflow forces the write through the approval branch. Cannot loosen (D-06). Activity log uses `effectiveAutomationLevel`.
- **`app/app/settings/actions.ts`**: `saveAutonomyThresholds` (D-05 Zod key restriction T-4-04-05, D-07 default applies to new workflows only); `getAutonomyThresholds`; `revokeSession` (delegates to registry); `signOutEverywhere` (delegates to registry); `listSessions`. All use `getValidatedClaims` with userId from claims.sub only.
- **`lib/auth/session-registry.ts`**: `recordSession` (UA parse without 3rd-party, coarse geo from Vercel headers, ON CONFLICT DO UPDATE for idempotency); `listSessions`; `revokeSession` (ownership re-check id+user_id, admin.signOut "others"); `signOutEverywhere` (admin.signOut "global"); `cancelDeletionIfPending` (D-09 grace cancel: checks deletion_requested_at, sends Inngest event, clears column).
- **`app/auth/callback/route.ts`** and **`app/(auth)/login/actions.ts`**: recordSession + cancelDeletionIfPending wired into both login paths. Non-fatal error handling with structured logging.
- **`app/app/settings/_autonomy.tsx`**: `AutonomySection` — default LevelToggle (role=radiogroup + aria-checked buttons) + exactly the D-05 curated override rows with role=switch toggles. Copy confirms "applies to new workflows only" (D-07) and "overrides only add friction" (D-06). NO discount-codes row (not a v1 tool).
- **`app/app/settings/_sessions.tsx`**: `SessionsSection` — session list with device/location (always "(approximate)")/relative-time, per-session Revoke with confirm Dialog, "Sign out everywhere" with confirm Dialog. JWT honesty note (~15-min window) in both confirm dialogs (T-4-04-04).
- **`app/app/settings/page.tsx`**: Extended parallel loads to include `getAutonomyThresholds` + `listSessions`; renders `<AutonomySection>` and `<SessionsSection>` in the correct order.
- **Tests**: `tests/unit/autonomy.test.ts` 3/3 GREEN; `tests/unit/sessions.test.ts` 2/2 GREEN; `npm run typecheck` exits 0 for source files (3 pre-existing Wave-0 RED scaffold errors for export/purge remain — expected, not this plan's scope).

## Task Commits

1. **Task 1: Autonomy override gate + session registry helpers + saveAutonomyThresholds** — `276bd84` (feat(04-04))
   - lib/workflows/autonomy.ts created (getEffectiveAutomationLevel, LEVEL_ORDER, CURATED_OVERRIDE_TOOLS)
   - lib/inngest/functions/execute-workflow-run.ts: override gate in step.run before L2 branch
   - app/app/settings/actions.ts: saveAutonomyThresholds + getAutonomyThresholds + revokeSession + signOutEverywhere + listSessions
   - lib/auth/session-registry.ts created (recordSession, listSessions, revokeSession, signOutEverywhere, cancelDeletionIfPending)
   - autonomy.test.ts 3/3 GREEN; sessions.test.ts 2/2 GREEN

2. **Task 2: Wire session registry + D-09 into login paths** — `a06e1e0` (feat(04-04))
   - app/auth/callback/route.ts: recordSession + cancelDeletionIfPending after OAuth exchange
   - app/(auth)/login/actions.ts: recordSession + cancelDeletionIfPending after signInWithPassword

3. **Task 3: AutonomySection + SessionsSection + page.tsx** — `d16a921` (feat(04-04))
   - app/app/settings/_autonomy.tsx: AutonomySection with LevelToggle + D-05 curated override rows
   - app/app/settings/_sessions.tsx: SessionsSection with revoke + sign-out-everywhere + JWT honesty note
   - app/app/settings/page.tsx: parallel loads + both sections rendered

**Plan metadata:** _(this commit, docs(04-04))_

## Files Created/Modified

- `lib/workflows/autonomy.ts` — pure getEffectiveAutomationLevel + LEVEL_ORDER + CURATED_OVERRIDE_TOOLS
- `lib/auth/session-registry.ts` — recordSession, listSessions, revokeSession, signOutEverywhere, cancelDeletionIfPending
- `lib/inngest/functions/execute-workflow-run.ts` — autonomy override gate added before L2 branch
- `app/app/settings/actions.ts` — 5 new exports: saveAutonomyThresholds, getAutonomyThresholds, revokeSession, signOutEverywhere, listSessions
- `app/app/settings/_autonomy.tsx` — AutonomySection (new file)
- `app/app/settings/_sessions.tsx` — SessionsSection (new file)
- `app/app/settings/page.tsx` — extended with parallel loads + 2 new section renders
- `app/auth/callback/route.ts` — session registry + D-09 wired after OAuth exchange
- `app/(auth)/login/actions.ts` — session registry + D-09 wired after signInWithPassword

## Decisions Made

- **Pure helper in lib/workflows/autonomy.ts:** Extracted `getEffectiveAutomationLevel` as a standalone pure function so the engine and unit tests share identical logic — no levelOrder duplication (D-06 correctness requirement).
- **Override gate as step.run:** The DB query for `per_action_overrides` is inside a `step.run()` call — making it a checkpointed Inngest step. Uses deterministic step ID `compute-effective-level-${i}-${workflowStep.id}` (Pitfall 6 compliance).
- **admin.signOut signature:** Supabase JS SDK v2 `admin.signOut(uid, scope)` takes scope as a second string arg (`'others'` / `'global'`), not an object. Fixed during typecheck.
- **Zod enum cast:** `z.enum([...CURATED_OVERRIDE_TOOLS] as unknown as [string, ...string[]])` — the readonly-to-mutable cast via unknown is the standard pattern for deriving Zod enums from `as const` arrays.
- **Non-fatal session registry:** Both login paths wrap recordSession + cancelDeletionIfPending in try-catch. A session registry DB failure must never block user login.
- **cancelDeletionIfPending takes inngest client as param:** Avoids circular import between `lib/auth/session-registry.ts` and `@/lib/inngest/client`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Supabase Admin signOut signature mismatch**
- **Found during:** Task 1 typecheck
- **Issue:** Plan context referenced `admin.signOut(userId, { scope: 'others' })` but the Supabase JS SDK v2 API is `admin.signOut(uid: string, scope?: 'global' | 'local' | 'others')` — scope as string, not object
- **Fix:** Changed to `admin.signOut(userId, "others")` and `admin.signOut(userId, "global")`
- **Files modified:** `lib/auth/session-registry.ts`
- **Commit:** `276bd84`

**2. [Rule 1 - Bug] Zod enum from readonly const array**
- **Found during:** Task 1 typecheck
- **Issue:** `z.enum(CURATED_OVERRIDE_TOOLS as [string, ...string[]])` errors because CURATED_OVERRIDE_TOOLS is `readonly` and TypeScript cannot widen to mutable tuple via direct cast
- **Fix:** Spread into new array first: `z.enum([...CURATED_OVERRIDE_TOOLS] as unknown as [string, ...string[]])`
- **Files modified:** `app/app/settings/actions.ts`
- **Commit:** `276bd84`

## Known Stubs

None. All sections render from real server-loaded data:
- AutonomySection loads from `getAutonomyThresholds` (returns null → default L2 is shown)
- SessionsSection loads from `listSessions` (returns live non-revoked rows)

The "~15 minutes" JWT honesty note is intentional UX copy (T-4-04-04 accepted disposition), not a stub.

## Threat Flags

No new security-relevant surface beyond the plan's threat model. All T-4-04-0x mitigations applied:

| Flag | Applied | Location |
|------|---------|----------|
| T-4-04-01 | getEffectiveAutomationLevel picks override only when levelOrder[override] < levelOrder[workflow]; unit test asserts never-loosen | autonomy.ts + execute-workflow-run.ts |
| T-4-04-02 | gate in execute-workflow-run.ts (engine), not dispatchTool | execute-workflow-run.ts L210–237 |
| T-4-04-03 | listSessions/revokeSession filter by user_id; revokeSession re-checks (id + user_id) | session-registry.ts + actions.ts |
| T-4-04-04 | JWT ~15-min window labeled honestly in both confirm dialogs; no "instant revocation" claim | _sessions.tsx |
| T-4-04-05 | Zod restricts override keys to CURATED_OVERRIDE_TOOLS (D-05 set) before persist | actions.ts SaveAutonomySchema |
| T-4-04-06 | UA/IP stored as display labels only; user_id always from claims.sub, never from client input | session-registry.ts + login paths |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `lib/workflows/autonomy.ts` exists | FOUND |
| `lib/auth/session-registry.ts` exists | FOUND |
| `app/app/settings/_autonomy.tsx` exists | FOUND |
| `app/app/settings/_sessions.tsx` exists | FOUND |
| `AutonomySection` in `page.tsx` | FOUND |
| `SessionsSection` in `page.tsx` | FOUND |
| `getEffectiveAutomationLevel` exported from autonomy.ts | FOUND |
| `recordSession` exported from session-registry.ts | FOUND |
| `revokeSession` exported from settings/actions.ts | FOUND |
| `signOutEverywhere` exported from settings/actions.ts | FOUND |
| Override gate in execute-workflow-run.ts | FOUND |
| `recordSession` called in auth/callback/route.ts | FOUND |
| `recordSession` called in login/actions.ts | FOUND |
| Commit `276bd84` (Task 1) | FOUND |
| Commit `a06e1e0` (Task 2) | FOUND |
| Commit `d16a921` (Task 3) | FOUND |
| `npx vitest run tests/unit/autonomy.test.ts` | 3/3 PASS |
| `npx vitest run tests/unit/sessions.test.ts` | 2/2 PASS |
| `npm run typecheck` (source files) | 0 errors |
