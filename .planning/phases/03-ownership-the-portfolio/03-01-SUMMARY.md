---
phase: 03-ownership-the-portfolio
plan: 01
subsystem: api
tags: [server-actions, drizzle, postgres, supabase-realtime, rls, inngest, zod, versioning, revert, migration]

# Dependency graph
requires:
  - phase: 02-foundation-prove-the-agent
    provides: workflows / workflow_versions / activity_entries schema, withUserRls tx helper, writeActivity observability-before-effect pattern, inngest client + execute-workflow-run consumer, getClaims auth, middleware guard chain
provides:
  - "Migration 0005: three composite indexes on activity_entries + activity:<userId> / runs:<workflowId> Realtime RLS policies (applied to live DB)"
  - "lib/workflows/versions.ts — createWorkflowVersion (atomic increment + 23505 retry + 10-version prune + forward-only restore)"
  - "lib/workflows/revert.ts — canRevert pure function (D-11 shared by UI + Server Action) + REVERT_REASON_LABELS + executeRevertEffect"
  - "lib/workflows/grouping.ts — groupWorkflowsByStatus (5 status buckets for My Workflows)"
  - "lib/actions/workflows.ts — editWorkflow, togglePause, restoreVersion, runNow Server Actions"
  - "lib/actions/activity.ts — revertActivity, bulkRevertActivity (dry-run + atomic execute), saveAsWorkflow"
  - "D-16 default-landing redirect (/app, /app/, /app/home → /app/workflows, 307)"
affects: [03-02-my-workflows, 03-03-workflow-detail, 03-04-activity, my-workflows, workflow-detail, activity-log]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function trust gate shared by UI + Server Action (canRevert, D-11) — never trust client classification"
    - "version-on-every-edit via createWorkflowVersion delegation (D-03)"
    - "Optimistic concurrency: UNIQUE(workflow_id, version_number) violation (23505) retried once with fresh MAX read"
    - "dry-run/execute split for bulk mutations (classify all → return split | wrap revertable in one tx)"

key-files:
  created:
    - supabase/migrations/0005_activity_indexes.sql
    - lib/workflows/versions.ts
    - lib/workflows/revert.ts
    - lib/workflows/grouping.ts
    - lib/actions/workflows.ts
    - lib/actions/activity.ts
    - tests/unit/workflows/versions.test.ts
    - tests/unit/workflows/revert.test.ts
    - tests/unit/workflows/grouping.test.ts
    - tests/unit/actions/workflows.test.ts
    - tests/smoke/activity.test.ts
  modified:
    - lib/auth/middleware.ts
    - app/app/home/page.tsx
    - tests/unit/middleware.test.ts

key-decisions:
  - "Migration 0005 applied via `supabase db push --db-url <session-pooler>` (not the Supabase MCP) because the MCP lacked project permission; recorded in remote migration history (Local 0005 / Remote 0005)"
  - "createWorkflowVersion retries once on 23505 with a fresh MAX(version_number) read — handles concurrent version inserts (RESEARCH Pitfall 1 / Open Question 2)"
  - "canRevert is a single pure function consumed by BOTH the Activity UI and the revert Server Action (D-11); Server Action re-fetches shopify_updated_at fresh and re-evaluates independently of the client (T-3-01-05)"
  - "Unknown action_type defaults to the 'content' (7d) revert window"

patterns-established:
  - "Pattern 1: lib helpers take (db, userId) as params — no requireUserId() inside lib; Server Actions own auth and pass claims into withUserRls"
  - "Pattern 2: revert_* activity entries are written with is_revertable:false BEFORE the external effect, then the original entry's reverted_at is set (observability-before-effect)"
  - "Pattern 3: foreign user IDs in bulkRevertActivity are silently excluded by the user_id filter, never surfaced as errors (T-3-01-01)"

requirements-completed: [WF-08, WF-09, WF-13, WF-14, ACT-04, ACT-05, ACT-06, ACT-07, ACT-08]

# Metrics
duration: ~50min (across checkpoint)
completed: 2026-05-22
---

# Phase 3 Plan 01: Foundation Summary

**Shared Phase 3 backend — migration 0005 (Activity composite indexes + Realtime RLS) applied live, version/revert/grouping lib helpers, all six Server Actions, and the D-16 default-landing redirect, with full Wave 0 TDD test coverage.**

## Performance

- **Duration:** ~50 min (spanning the Task 3 migration checkpoint)
- **Started:** 2026-05-22T17:12:00Z (approx)
- **Completed:** 2026-05-22T18:30:00Z (approx)
- **Tasks:** 3 (2 auto/TDD + 1 blocking-human checkpoint)
- **Files modified:** 14 (11 created, 3 modified)

## Accomplishments
- **Migration 0005 applied to the live DB** — three composite indexes on `activity_entries` (`idx_activity_user_workflow_time` partial, `idx_activity_user_result_time`, `idx_activity_user_level_time` partial) for ACT-07 sub-1s Activity filtering, plus two Realtime RLS policies (`activity:<userId>` direct uid check, `runs:<workflowId>` EXISTS subquery on `workflow_runs`). Confirmed Local 0005 / Remote 0005 in migration history.
- **lib/workflows/versions.ts** — `createWorkflowVersion` with atomic MAX+1 increment, 23505-retry-once, 10-version retention prune, and forward-only restore (old rows never mutated).
- **lib/workflows/revert.ts** — `canRevert` (D-11 shared trust gate covering content/structural/sent windows + all 5 fail modes) and `REVERT_REASON_LABELS`.
- **lib/workflows/grouping.ts** — `groupWorkflowsByStatus` partitioning into scheduled/triggered/manual/paused/drafts.
- **lib/actions/workflows.ts + lib/actions/activity.ts** — all six Server Actions: editWorkflow, togglePause, restoreVersion, runNow (ownership-then-inngest.send), revertActivity, bulkRevertActivity (dry-run split + atomic execute), saveAsWorkflow.
- **D-16 default-landing redirect** live in middleware + home page (`/app`, `/app/`, `/app/home` → `/app/workflows`, 307).
- Six Wave 0 test files green covering every trust-critical behavior.

## Task Commits

Each task was committed atomically (TDD test → feat per task):

1. **Task 1 (RED): failing tests for versions, revert, grouping** - `659f51d` (test)
2. **Task 1 (GREEN): Migration 0005 SQL + shared lib helpers** - `001b085` (feat)
3. **Task 2 (RED): failing tests for Server Actions + activity smoke** - `7aeb39a` (test)
4. **Task 2 (GREEN): Server Actions (workflows + activity) + D-16 redirect** - `6c67a0b` (feat)
5. **Task 3 (checkpoint): STATE.md stopped-at marker** - `b3af0d5` (chore)
6. **Task 3 (resume): migration 0005 applied to live DB** - confirmed via `supabase db push` (Local 0005 / Remote 0005; SQL committed in `001b085`)

**Plan metadata:** see final commit (docs: complete plan)

## Files Created/Modified
- `supabase/migrations/0005_activity_indexes.sql` - 3 composite indexes + 2 Realtime RLS policies (applied live)
- `lib/workflows/versions.ts` - createWorkflowVersion transaction helper + forward-only restore
- `lib/workflows/revert.ts` - canRevert pure function + REVERT_REASON_LABELS + executeRevertEffect
- `lib/workflows/grouping.ts` - groupWorkflowsByStatus pure function
- `lib/actions/workflows.ts` - editWorkflow / togglePause / restoreVersion / runNow Server Actions
- `lib/actions/activity.ts` - revertActivity / bulkRevertActivity / saveAsWorkflow Server Actions
- `lib/auth/middleware.ts` - D-16 redirect block inserted before Guard 1
- `app/app/home/page.tsx` - body replaced with redirect('/app/workflows')
- `tests/unit/workflows/{versions,revert,grouping}.test.ts` - Wave 0 unit tests
- `tests/unit/actions/workflows.test.ts` - runNow event-shape + ownership-rejection tests
- `tests/smoke/activity.test.ts` - Activity page 50-item render smoke test
- `tests/unit/middleware.test.ts` - extended with three D-16 redirect cases

## Decisions Made
- **Migration 0005 applied via `supabase db push --db-url <session-pooler>`** (not the Supabase MCP `apply_migration`) — the MCP lacked project permission for this project. The push over the session pooler succeeded and is recorded in remote migration history (`supabase migration list` shows Local 0005 / Remote 0005). Carry forward: future migrations on this project should use `supabase db push` with the session-pooler db-url, not the MCP, until MCP project permission is granted.
- **23505 retry-once** on createWorkflowVersion to absorb concurrent version inserts.
- **canRevert is one shared pure function** (D-11) re-evaluated server-side with a fresh `shopify_updated_at` fetch — the UI classification is never trusted (T-3-01-05).
- **Unknown action_type defaults to the content (7d) window.**

## Deviations from Plan

None - plan executed exactly as written. Tasks 1 and 2 followed the TDD RED→GREEN cycle; Task 3 paused at the blocking-human checkpoint as designed and resumed on approval.

## Issues Encountered
- **Supabase MCP could not apply migration 0005** (lacked project permission). Resolved by applying via `supabase db push --db-url <session-pooler>`; verified the three indexes and two Realtime policies exist in the live DB and that migration history records 0005 remotely.

## User Setup Required
None remaining — the only external step (migration 0005 push) is complete and verified in the live DB.

## Next Phase Readiness
- All Wave 0 contracts are implemented and consumed-ready: plans **03-02 (My Workflows)**, **03-03 (Workflow Detail)**, and **03-04 (Activity)** can now build their surfaces directly against `lib/workflows/*` and `lib/actions/*` with no reimplementation of versioning, revert drift, or grouping.
- Migration 0005 live means the Activity log can hit its ACT-07 performance target and the new Realtime channels (`activity:<userId>`, `runs:<workflowId>`) authorize correctly.
- D-16 redirect is live, so the default landing surface is settled before the surface plans wire navigation.
- Note for plan 03-04: the `@tanstack/react-virtual` install (T-3-01-SC) still requires the slopcheck blocking-human checkpoint in that plan before install.

## Self-Check: PASSED

- All 6 created lib/migration files verified present on disk.
- All 4 task commits (659f51d, 001b085, 7aeb39a, 6c67a0b) verified in git history.
- Migration 0005 verified Local 0005 / Remote 0005 in `supabase migration list`.

---
*Phase: 03-ownership-the-portfolio*
*Completed: 2026-05-22*
