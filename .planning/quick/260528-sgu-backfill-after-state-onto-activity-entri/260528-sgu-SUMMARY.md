---
phase: quick-260528-sgu
plan: "01"
subsystem: integrations/observability
tags: [shopify, activity-log, observability, multi-tenant, tdd]
dependency_graph:
  requires:
    - lib/integrations/shopify/mutations.ts (existing write path)
    - lib/db/schema/activity-entries.ts (activityEntries table)
    - lib/workflows/activity.ts (writeActivity, already wired)
  provides:
    - backfillAfterState helper (mutations.ts)
    - after_state populated on real Shopify writes
  affects:
    - Activity log detail panel (before→after diff now shows real data)
tech_stack:
  added: []
  patterns:
    - observability-first: insert row before effect, backfill after_state once effect known
    - multi-tenant guard: serviceDb UPDATE always scoped by user_id (bypasses RLS)
    - idempotent UPDATE: setting after_state safe under retry
key_files:
  modified:
    - lib/integrations/shopify/mutations.ts
    - tests/unit/shopify-mutations.test.ts
decisions:
  - backfillAfterState takes (userId, stepId, afterState) — matches inserted row by (workflow_run_id IS NULL, step_id, user_id) per plan spec
  - UPDATE scoped by user_id even though step_id is already userId-prefixed — defense-in-depth for T-sgu-01
  - Tests run from worktree directory (node_modules from main repo via PATH); plan verify command adapted because @ alias resolves to worktree when vitest is invoked from there
metrics:
  duration: "~15 minutes"
  completed: "2026-05-28"
  tasks_completed: 2
  files_modified: 2
---

# Quick 260528-sgu: Backfill after_state onto Activity Entries Summary

**One-liner:** Added `backfillAfterState` helper that persists the post-write mirror row as `after_state` on the `activity_entries` row in both `updateProduct` and `updateInventory`, closing the observability gap where real edits showed null after-state in the Activity log detail panel.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED+GREEN) | backfillAfterState helper + wired into updateProduct + updateInventory | 690f122 | lib/integrations/shopify/mutations.ts, tests/unit/shopify-mutations.test.ts |

## What Was Built

### `backfillAfterState` helper (mutations.ts)

A private async helper added above `getIdempotencyBucket` that runs:

```typescript
serviceDb.update(activityEntries)
  .set({ after_state: afterState as Record<string, unknown> | null })
  .where(and(
    isNull(activityEntries.workflow_run_id),
    eq(activityEntries.step_id, stepId),
    eq(activityEntries.user_id, userId)
  ))
```

Called once in `updateProduct` and once in `updateInventory`, AFTER the post-write mirror re-read `afterRow` SELECT, BEFORE the `return { ... }` statement.

### Imports added

- `activityEntries` from `@/lib/db/schema`
- `isNull` added to existing `eq, and` import from `drizzle-orm`

### Tests extended (tests/unit/shopify-mutations.test.ts)

New `describe("after_state backfill — activity row updated post-write")` block with 2 tests:
- `updateProduct calls serviceDb.update with after_state set to the re-read mirror row`
- `updateInventory calls serviceDb.update with after_state set to the re-read mirror row`

Both follow the existing `vi.resetModules + vi.doMock` pattern. Mock `serviceDb` includes an `update` spy, and mocks `@/lib/db/schema` to return a stub `activityEntries` object. Existing tests (WF-06 ordering, CR-01, `writeActivity receives before_state`) also updated with `update` stub and `@/lib/db/schema` mock so they continue to pass now that `backfillAfterState` is called in the write path.

## Verification Results

### Typecheck
`tsc --noEmit` — PASSED (no errors)

### Tests
Run from worktree directory (resolves `@` alias to worktree, picking up the new implementation):

```
Tests  14 passed (14)
```

All 14 tests pass:
- 4 INTEG-07 idempotency key tests
- 4 INTEG-07 pre-read → write → re-read pattern tests
- 4 WF-06 observability-first ordering tests (including CR-01)
- **2 new after_state backfill tests** (GREEN)

Note: The plan's verify command `cd /Users/abhisingh/my-os/dev/Operator-Zero && npx vitest run tests/unit/shopify-mutations.test.ts` runs against the main repo's files (since `@` resolves to the main repo root when cwd is the main repo). The implementation lives in the worktree branch and will be verified correctly after merge. Tests were verified to pass by running vitest from the worktree directory.

## Observability-First Ordering Preserved

The `writeActivity` call (inserting the row with `after_state: null`) still executes BEFORE the Shopify GraphQL mutation in both `updateProduct` and `updateInventory`. The new `backfillAfterState` call occurs AFTER both the mutation AND the post-write mirror re-read — completing the two-phase observability pattern.

## Deviations from Plan

None — plan executed exactly as written.

The existing tests in `WF-06 — writeActivity called BEFORE Shopify API call` needed minor additions (`update` mock + `@/lib/db/schema` mock) because those tests call `updateProduct`/`updateInventory` end-to-end and the new code path now invokes `serviceDb.update`. This is a correctness fix for the test mocks (Rule 1), not a deviation from plan intent.

## Threat Model Mitigations Applied

| Threat | Mitigation | Location |
|--------|-----------|----------|
| T-sgu-01: serviceDb bypasses RLS, cross-tenant UPDATE | `eq(activityEntries.user_id, userId)` in WHERE clause | backfillAfterState WHERE |
| T-sgu-02: retry re-runs the UPDATE | Setting after_state is idempotent; same row targeted each time | backfillAfterState design |

## Known Stubs

None.

## Self-Check: PASSED

- [x] `lib/integrations/shopify/mutations.ts` exists and contains `backfillAfterState`
- [x] `tests/unit/shopify-mutations.test.ts` exists and contains `after_state backfill` describe block
- [x] Commit `690f122` exists
- [x] 14/14 tests pass (worktree run)
- [x] tsc --noEmit passes
