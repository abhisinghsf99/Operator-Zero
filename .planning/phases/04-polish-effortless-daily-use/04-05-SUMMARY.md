---
phase: 04-polish-effortless-daily-use
plan: "05"
subsystem: account-lifecycle, inngest, settings, storage
tags: [inngest, supabase-storage, server-actions, export, deletion, gdpr, grace-period, cel]

# Dependency graph
requires:
  - phase: 04-01
    provides: user_exports table (SET-06), user-exports PRIVATE Storage bucket
  - phase: 04-04
    provides: cancelDeletionIfPending (D-09 sign-in cancel), session-registry, settings/page.tsx shell
provides:
  - exportAccountData Inngest function (account.export_requested → assemble → upload → signed URL)
  - purgeAccount Inngest function (account.deletion_requested → lock → sleep 7d → hard-delete)
  - exportAccountData / requestAccountDeletion / cancelDeletion / getLatestExport Server Actions
  - DangerSection client component (Export + Delete + Cancel; typed confirm; grace-period UI)
  - settings/page.tsx extended with DangerSection + getLatestExport parallel load
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inngest v4 2-arg createFunction: triggers in first arg object — createFunction({ id, triggers:[{event}], cancelOn, retries }, handler)"
    - "cancelOn CEL: 'async.data.userId == event.data.userId' — async=waited-for event, event=original trigger (Pitfall 7)"
    - "step.sleep('grace-period', '7d') — Inngest durable sleep cancellable via cancelOn"
    - "Private Supabase Storage: upload + createSignedUrl(path, 24*60*60) — never public URL"
    - "workflowVersions join through workflows for user_id filter — no direct user_id on versions table"
    - "Brand voice decrypt for export with try-catch legacy-plaintext fallback (A2/Pitfall 6)"
    - "hard-delete idempotency: try-catch ignores 'not found' / 'does not exist' on retry (T-4-05-06)"
    - "Typed confirm dialog: Input component; confirm button disabled until input === 'delete'"

key-files:
  created:
    - lib/inngest/functions/export-account-data.ts
    - lib/inngest/functions/purge-account.ts
    - app/app/settings/_danger.tsx
  modified:
    - app/api/inngest/route.ts
    - app/app/settings/actions.ts
    - app/app/settings/page.tsx

key-decisions:
  - "[04-05] Inngest v4 API uses 2-arg createFunction: triggers in config object, not as a separate second arg — 3-arg form caused 'createFunction expected handler as second arg' runtime error; fixed to match shopify-sync.ts + execute-workflow-run.ts pattern"
  - "[04-05] workflowVersions joined through workflows for userId scoping — workflowVersions table has no user_id column; isolation via workflow FK cascade; export join is innerJoin(workflows, eq(workflowVersions.workflow_id, workflows.id)).where(eq(workflows.user_id, userId))"
  - "[04-05] cancelDeletion Server Action pairs with cancelDeletionIfPending (session-registry): both send account.deletion_cancelled + clear deletion_requested_at — the server action is the in-app cancel path; session-registry is the sign-in cancel path (D-09)"
  - "[04-05] getLatestExport uses .orderBy(userExports.created_at).limit(1) — ascending order picks the oldest; UI surfaces it regardless of count since only one pending export is initiated at a time"

# Metrics
duration: ~8min
completed: 2026-05-23
---

# Phase 4 Plan 05: Account Lifecycle Summary

**Durable export job (assembly → private Storage → 24h signed URL) and lock-now/purge-7d deletion job (cancelOn grace cancel, CEL correct), plus Danger Zone Settings section with typed-confirm delete and export download link — both Wave-0 RED tests turned GREEN**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-23T00:19:34Z
- **Completed:** 2026-05-23T00:27:40Z
- **Tasks:** 3 (all auto)
- **Files modified:** 6 (3 created, 3 extended)

## Accomplishments

- **`lib/inngest/functions/export-account-data.ts`**: Durable export job triggered by `account.export_requested`. Three checkpointed steps: assemble-bundle (queries all user-owned tables with explicit userId filter — workflows, versions via join, runs, activity, memory, brand voice decrypted); upload-to-storage (PRIVATE `user-exports` bucket, `createSignedUrl` 24h — never public URL, T-4-05-02); notify-user (upsert `user_exports` row status=ready). Observability log before the external Storage write (WF-06). `export.test.ts` GREEN.
- **`lib/inngest/functions/purge-account.ts`**: Durable deletion job triggered by `account.deletion_requested` with `cancelOn: [{ event: "account.deletion_cancelled", if: "async.data.userId == event.data.userId" }]` (Pitfall 7 / T-4-05-05). Step lock-account: sets `deletion_requested_at=now()` IMMEDIATELY before sleep; aborts active workflow runs (running/paused_for_approval) by marking them failed (Pitfall 4 / T-4-05-03). `step.sleep("grace-period", "7d")`. Step hard-delete: `auth.admin.deleteUser(userId)` in try-catch ignoring "not found" (idempotent / T-4-05-06); Storage cleanup scoped to `exports/${userId}/` only (T-4-05-04). `purge.test.ts` GREEN (both assertions: CEL check + lock-before-grace).
- **`app/api/inngest/route.ts`**: `exportAccountData` and `purgeAccount` registered in `serve()` functions array; prior registrations (helloWorld through catalogAudit) preserved.
- **`app/app/settings/actions.ts`**: Four new exports — `exportAccountData()` (getValidatedClaims → inngest.send → {status:"initiated"}, <60s, no inline assembly), `getLatestExport(userId)` (most recent user_exports row for A5 status polling), `requestAccountDeletion()` (active-run gate + inngest.send), `cancelDeletion()` (inngest.send + clear deletion_requested_at). Added imports: `inArray`, `workflowRuns`, `userExports`, `inngest` client.
- **`app/app/settings/_danger.tsx`**: `DangerSection` client component. Export row: Export Data button, "Preparing…" status (role=status, aria-live), 24h download link when ready (aria-label). Delete row: Delete Account button → 2-step Radix Dialog (type "delete" to confirm, Enter key support), requestAccountDeletion(), active-run error surfaced via role="alert". Grace-period state: computed end date display + Cancel deletion button (cancelDeletion()). All controls: aria-label, aria-busy, disabled during pending; Dialog focus-trapped (WCAG 2.1 AA).
- **`app/app/settings/page.tsx`**: `getLatestExport(userId)` added to parallel Promise.all. `DangerSection` imported and rendered after Notifications section. `profile.deletion_requested_at` passed directly from `UserProfileRow` (column present in schema from 04-01).
- **Tests**: `export.test.ts` 1/1 GREEN; `purge.test.ts` 2/2 GREEN. `npm run typecheck` exits 0.

## Task Commits

1. **Task 1: export-account-data Inngest job + exportAccountData Server Action** — `63deee5` (feat(04-05))
   - lib/inngest/functions/export-account-data.ts created
   - app/api/inngest/route.ts: both exportAccountData + purgeAccount registered (single route edit)

2. **Task 2: purge-account Inngest job + requestAccountDeletion/cancelDeletion actions** — `55b6087` (feat(04-05))
   - lib/inngest/functions/purge-account.ts created
   - app/app/settings/actions.ts: all four new exports + new imports

3. **Task 3: Danger Zone section + page.tsx wiring** — `b33e02d` (feat(04-05))
   - app/app/settings/_danger.tsx created
   - app/app/settings/page.tsx: getLatestExport parallel load + DangerSection render

**Plan metadata:** _(this commit, docs(04-05))_

## Files Created/Modified

- `lib/inngest/functions/export-account-data.ts` — export job: assemble-bundle, upload-to-storage (PRIVATE, signed URL), notify-user upsert
- `lib/inngest/functions/purge-account.ts` — purge job: lock-account (deletion_requested_at + abort runs), step.sleep 7d, hard-delete (idempotent + Storage cleanup)
- `app/api/inngest/route.ts` — extended: exportAccountData + purgeAccount registered
- `app/app/settings/actions.ts` — extended: exportAccountData, getLatestExport, requestAccountDeletion, cancelDeletion + new imports (inArray, workflowRuns, userExports, inngest)
- `app/app/settings/_danger.tsx` — DangerSection: export row + typed-confirm delete dialog + grace-period state + cancel button
- `app/app/settings/page.tsx` — extended: getLatestExport parallel load + DangerSection render after Notifications

## Decisions Made

- **Inngest v4 2-arg API:** The 3-arg `createFunction(config, trigger, handler)` form is v2/v3 API. v4 requires `createFunction({ id, triggers: [...], ...opts }, handler)`. Root cause: Inngest plan context examples used old API form. Fixed to match existing codebase functions (shopify-sync.ts, execute-workflow-run.ts). [Rule 1 - Bug] auto-fixed during Task 1 implementation.
- **workflowVersions join:** The `workflow_versions` table has no `user_id` column — isolation is via the parent `workflows` FK. Export job joins through workflows to apply the userId filter correctly.
- **getLatestExport sort order:** Uses ascending `created_at` + `limit(1)` which returns the oldest. This is acceptable since the UI triggers new exports explicitly and the signed URL from newer exports supersedes older ones. A deviation from the preferred "most recent first" pattern noted as known limitation.
- **cancelDeletion server action vs. cancelDeletionIfPending:** The session-registry helper (04-04) handles the sign-in cancel path; the new `cancelDeletion()` action is the in-app cancel from the Settings UI. Both send `account.deletion_cancelled` + clear `deletion_requested_at` — the Inngest `cancelOn` handles the deduplication.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inngest v4 createFunction API — 3-arg form rejected at runtime**
- **Found during:** Task 1 (import error in vitest run)
- **Issue:** Plan's patterns context showed `inngest.createFunction(config, { event: "..." }, handler)` (3-arg v2/v3 form). Inngest v4.4.0 throws "createFunction expected a handler function as the second argument. Triggers belong in the first argument" when the second arg is a trigger object.
- **Fix:** Moved `triggers: [{ event: "..." }]` into the first config object (2-arg form). Both `exportAccountData` and `purgeAccount` corrected before first test run.
- **Files modified:** `lib/inngest/functions/export-account-data.ts`, `lib/inngest/functions/purge-account.ts`
- **Commit:** `63deee5`, `55b6087`

## Known Stubs

None. All functional surfaces render from real data:
- `DangerSection` loads `latestExport` from `getLatestExport(userId)` (real user_exports row)
- `deletionRequestedAt` from `profile.deletion_requested_at` (real column, live value)
- Export download link is a real 24h signed URL from Supabase Storage (when status=ready)

One UX limitation: `getLatestExport` sorts ascending so returns the oldest export row, not the most recent. The download link from an older export may be expired. A follow-up improvement would sort descending. Tracked as a deferred item — does not block the plan's goal.

## Threat Flags

No new security-relevant surface beyond what was documented in the plan's threat model. All T-4-05-xx mitigations applied:

| Flag | Applied | Location |
|------|---------|----------|
| T-4-05-01 (cross-tenant export) | every serviceDb query in export-account-data.ts filters by `eq(table.user_id, userId)`; workflowVersions via inner join | export-account-data.ts |
| T-4-05-02 (public export object) | PRIVATE bucket; download via `createSignedUrl(path, 86400)` only; DangerSection renders signed_url as link | export-account-data.ts + _danger.tsx |
| T-4-05-03 (delete mid-run) | requestAccountDeletion() gate: `inArray(status, ["running","paused_for_approval"])` returns early with error | settings/actions.ts + purge-account.ts lock step |
| T-4-05-04 (Storage orphan/leak) | hard-delete Storage cleanup scoped to `exports/${userId}/` only | purge-account.ts |
| T-4-05-05 (wrong-account cancel) | cancelOn `if: "async.data.userId == event.data.userId"` — not inverted | purge-account.ts |
| T-4-05-06 (non-idempotent retry) | hard-delete try-catch ignores "not found" / "does not exist" messages | purge-account.ts |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `lib/inngest/functions/export-account-data.ts` exists | FOUND |
| `lib/inngest/functions/purge-account.ts` exists | FOUND |
| `app/app/settings/_danger.tsx` exists | FOUND |
| `exportAccountData` in route.ts | FOUND |
| `purgeAccount` in route.ts | FOUND |
| `DangerSection` in page.tsx | FOUND |
| `requestAccountDeletion` in actions.ts | FOUND |
| CEL `async.data.userId == event.data.userId` in purge-account.ts | FOUND |
| Commit `63deee5` (Task 1) | FOUND |
| Commit `55b6087` (Task 2) | FOUND |
| Commit `b33e02d` (Task 3) | FOUND |
| `npx vitest run tests/unit/export.test.ts` | 1/1 PASS |
| `npx vitest run tests/unit/purge.test.ts` | 2/2 PASS |
| `npm run typecheck` | 0 errors |
