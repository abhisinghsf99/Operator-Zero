---
phase: quick-260528-sgu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/integrations/shopify/mutations.ts
  - tests/unit/shopify-mutations.test.ts
autonomous: true
requirements: [INTEG-07, WF-06]

must_haves:
  truths:
    - "After a real product edit, the activity_entries row for that write has after_state populated (not null)"
    - "After a real inventory edit, the activity_entries row for that write has after_state populated (not null)"
    - "The backfill UPDATE is scoped by user_id (multi-tenant) and matches the same row writeActivity inserted (workflow_run_id IS NULL AND step_id = idempotency_key)"
    - "The initial writeActivity call still happens BEFORE the Shopify API call (observability-first ordering preserved)"
  artifacts:
    - path: "lib/integrations/shopify/mutations.ts"
      provides: "backfillAfterState helper + follow-up UPDATE in updateProduct and updateInventory"
      contains: "backfillAfterState"
    - path: "tests/unit/shopify-mutations.test.ts"
      provides: "test asserting after_state is persisted on the activity row"
      contains: "after_state"
  key_links:
    - from: "lib/integrations/shopify/mutations.ts (updateProduct, after re-read)"
      to: "activity_entries row"
      via: "serviceDb.update set after_state where workflow_run_id IS NULL AND step_id = key AND user_id = userId"
      pattern: "backfillAfterState"
---

<objective>
Backfill `after_state` onto the `activity_entries` row in the real Shopify write path so the Activity log detail panel renders a true before→after diff after a real edit.

Today both `updateProduct` and `updateInventory` insert the activity row (with `after_state` null) BEFORE the Shopify API call, then re-read the mirror to compute `after_state` — but that computed value is only returned in `MutationResult` and never persisted onto the row. The UI therefore shows a before value with a blank after on real edits (only seeded demo data has after_state).

Purpose: Make the "Trust through transparency" Activity log truthful for real agent writes, not just seeds.
Output: A shared `backfillAfterState` helper plus a follow-up UPDATE in both mutation functions; an extended unit test asserting persistence.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Key contracts the executor needs — extracted from codebase, no exploration required. -->

From lib/db/schema/activity-entries.ts (activity_entries columns relevant here):
- `user_id` uuid NOT NULL (tenant discriminator)
- `workflow_run_id` uuid NULLABLE — null for tool-layer/chat actions
- `step_id` text NULLABLE — holds the idempotency_key for these tool calls
- `after_state` jsonb NULLABLE — the column being backfilled
- unique("activity_entries_run_step_unique") on (workflow_run_id, step_id) is a PARTIAL unique
  WHERE both non-null; null-workflow_run rows are NOT deduped by it, so they are matched
  for UPDATE by step_id + user_id.

From lib/integrations/shopify/mutations.ts (existing, do not change shape):
- `serviceDb` imported from "@/lib/db/client" (service role, bypasses RLS — MUST pass user_id explicitly)
- `eq, and` imported from "drizzle-orm"
- writeActivity(userId, { workflow_run_id: null, step_id: idempotency_key, ... before_state ... }) is
  called BEFORE the Shopify GraphQL write in both functions.
- After the post-write mirror re-read, `afterRow` is the new mirror row; returned in MutationResult.after_state.
- `MutationResult<T>` return shape is FROZEN — do not modify it.

From drizzle-orm: use `isNull(activityEntries.workflow_run_id)` for the NULL predicate in the UPDATE where-clause.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add backfillAfterState helper and wire it into updateProduct + updateInventory</name>
  <files>lib/integrations/shopify/mutations.ts</files>
  <behavior>
    - After updateProduct computes `afterRow`, an UPDATE runs against activity_entries setting after_state to afterRow, scoped by (workflow_run_id IS NULL, step_id = idempotency_key, user_id = userId).
    - After updateInventory computes `afterRow`, the identical UPDATE runs with the inventory_update idempotency_key.
    - The initial writeActivity call remains BEFORE the Shopify GraphQL write in both functions (ordering unchanged).
    - The UPDATE is a no-op-safe operation under retry (setting after_state is naturally idempotent).
    - MutationResult return shape is unchanged.
  </behavior>
  <action>
Add `isNull` to the existing drizzle-orm import line (alongside `eq, and`).

Add a private helper near the top of the file (below the imports, above getIdempotencyBucket):
`backfillAfterState(userId: string, stepId: string, afterState: unknown): Promise<void>`.
It runs `serviceDb.update(activityEntries).set({ after_state: afterState as Record<string, unknown> | null }).where(and(isNull(activityEntries.workflow_run_id), eq(activityEntries.step_id, stepId), eq(activityEntries.user_id, userId)))`.
Import `activityEntries` from "@/lib/db/schema" (same import path writeActivity uses). Document with a one-line comment that this completes the observability-first pattern: the row was inserted with after_state null BEFORE the effect; this fills it in once the effect result is known. Note it is retry-safe because setting after_state is idempotent and matching by step_id+user_id targets the exact inserted row.

In `updateProduct`: AFTER the `afterRow` re-read select (the block ending at line ~233) and BEFORE the `return { ... }`, call `await backfillAfterState(userId, idempotency_key, afterRow ?? null)`.

In `updateInventory`: AFTER the `afterRow` re-read select and BEFORE the `return { ... }`, call `await backfillAfterState(userId, idempotency_key, afterRow ?? null)`.

Do NOT move or remove either initial `writeActivity` call. Do NOT change MutationResult, the GraphQL queries, or the mirror upsert logic.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npm run typecheck</automated>
  </verify>
  <done>tsc --noEmit passes; backfillAfterState exists and is called once in each of updateProduct and updateInventory after the post-write re-read; both initial writeActivity calls remain before the Shopify GraphQL mutation; MutationResult shape unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend tests to assert after_state is persisted onto the activity row</name>
  <files>tests/unit/shopify-mutations.test.ts</files>
  <behavior>
    - A new test asserts that after updateProduct, serviceDb.update(...).set(...) was called with after_state set to the re-read mirror row, scoped to the correct user.
    - A parallel test asserts the same for updateInventory.
    - Existing observability-ordering and CR-01 tests still pass unchanged.
  </behavior>
  <action>
Add a new `describe("after_state backfill — activity row updated post-write")` block with two tests (updateProduct, updateInventory). Follow the EXISTING mocking pattern in this file (vi.resetModules + vi.doMock for "@/lib/workflows/activity", "@/lib/integrations/shopify/client", "@/lib/db/client", "@/lib/db/schema/shopify-mirror").

Critically, the mock serviceDb must now also mock `.update()`: `update: vi.fn().mockReturnValue({ set: setSpy.mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })` where `setSpy` is a `vi.fn()` you can assert on. Also mock the schema module the helper imports: `vi.doMock("@/lib/db/schema", () => ({ activityEntries: { name: "activity_entries" } }))`.

For the select mock, return the "before" row on call 1 and the "after" row on the post-write re-read call (the file already uses a `selectCallCount` pattern — reuse it). The updateProduct re-read uses 2 selects (before + after); updateInventory uses 2 selects (before + after) as well — confirm against the function bodies and set the mock accordingly.

Assert: `setSpy` was called with an object whose `after_state` equals the after-mirror row (e.g. `{ product_gid: ..., title: "New Title" }`). Optionally assert `mockServiceDb.update` was called. Keep assertions resilient to the exact column-mapping but require `after_state` to be present and non-null.

Do not weaken or delete existing tests.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx vitest run tests/unit/shopify-mutations.test.ts</automated>
  </verify>
  <done>All tests in shopify-mutations.test.ts pass, including the two new after_state-backfill tests; existing ordering/CR-01 tests unchanged and green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| tool layer → serviceDb | serviceDb bypasses RLS; every query MUST carry explicit user_id |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sgu-01 | Information Disclosure | backfillAfterState UPDATE via serviceDb (bypasses RLS) | mitigate | WHERE clause includes `eq(activity_entries.user_id, userId)` — update cannot touch another tenant's row |
| T-sgu-02 | Tampering | Inngest/tool retry re-runs the UPDATE | accept | Setting after_state is idempotent; matching by (workflow_run_id IS NULL, step_id, user_id) targets the single inserted row, no double-effect |
</threat_model>

<verification>
- `npm run typecheck` passes.
- `npx vitest run tests/unit/shopify-mutations.test.ts` passes (existing + new tests).
- Manual (not gating): after a real product edit, the Activity log detail panel shows a populated before AND after.
</verification>

<success_criteria>
- after_state is persisted onto the activity_entries row for both updateProduct and updateInventory real write paths.
- Backfill UPDATE is user_id-scoped and matches the exact row inserted by writeActivity (workflow_run_id IS NULL AND step_id = idempotency_key).
- Observability-first ordering preserved (initial writeActivity stays before the Shopify call).
- No schema change, no UI change, MutationResult shape unchanged.
- DRY: a single backfillAfterState helper is reused by both functions.
</success_criteria>

<output>
Create `.planning/quick/260528-sgu-backfill-after-state-onto-activity-entri/260528-sgu-SUMMARY.md` when done
</output>
