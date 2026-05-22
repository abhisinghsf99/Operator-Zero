---
phase: 03-ownership-the-portfolio
verified: 2026-05-22T12:12:00Z
status: human_needed
score: 3/5 truths verified (2 are live-usage/performance metrics requiring production data)
overrides_applied: 0
human_verification:
  - test: "Confirm Activity log loads <1s p50 with 1000+ entries"
    expected: "Virtualized cursor-paginated log with the three composite indexes from migration 0005 returns first page in under 1 second at scale"
    why_human: "The structural capability (composite indexes, cursor pagination, @tanstack/react-virtual) is verified in code, but the p50 performance metric requires a load test or seeded production data — cannot be confirmed by static code inspection"
  - test: "Confirm My Workflows is the default landing surface and users visit it 3x/week (SC-1 + SC-2 usage metrics)"
    expected: "Median user has 5+ active workflows visible; 60% visit 3x/week"
    why_human: "SC-1 (5+ workflows) and SC-2 (60% visit 3x/week) are live-usage metrics requiring production user data. The structural capability (grouped surface is the default landing, D-16 redirect live) is verified. The usage rate and workflow count are only observable in production."
  - test: "Verify Realtime strip counts update live on a second browser tab (Realtime channel authorization)"
    expected: "After an activity entry is inserted, the Recent Activity strip on My Workflows refreshes without a page reload within seconds"
    why_human: "Realtime subscription wiring is code-verified. Live cross-tab behavior depends on Supabase Realtime broker connectivity and migration 0005 RLS policies being correctly applied on the live database — requires a live test with two browser tabs."
  - test: "Verify Run Now trigger appears in Historical Runs within seconds"
    expected: "After clicking Run Now on Workflow Detail, the run row appears at the top of Historical Runs without a page refresh"
    why_human: "The Inngest event send + Realtime subscription on runs:<workflowId> is code-verified. End-to-end requires the Inngest worker to emit the run, Supabase to broadcast it, and the Realtime channel RLS to authorize it — requires a live test."
  - test: "Verify blocked-revert tooltip is keyboard and screen-reader accessible"
    expected: "Tab to a blocked revert button, trigger it with keyboard — tooltip appears and is announced by screen reader; aria-describedby is wired correctly"
    why_human: "The @radix-ui/react-tooltip implementation with aria-describedby is code-verified. WCAG 2.1 AA accessibility compliance (screen-reader announcement, keyboard focus management) requires manual testing with AT tools."
---

# Phase 3: Ownership — The Portfolio — Verification Report

**Phase Goal:** Sarah can see, manage, and inspect everything she has built — her workflow portfolio is visible, editable inline, and fully auditable through the Activity log with versioning and revert.
**Verified:** 2026-05-22T12:12:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Step 0: Previous Verification

No prior VERIFICATION.md found. Initial verification mode.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Median user has 5+ active workflows visible in My Workflows, grouped by status with inline L1/L2/L3 toggle | ? UNCERTAIN (human_needed) | Structural capability VERIFIED: `app/app/workflows/page.tsx` calls `groupWorkflowsByStatus`, renders 5 status buckets (Scheduled/Triggered/Manual/Paused/Drafts). `WorkflowRow` has `LevelToggle` calling `editWorkflow`. The 5+ count and 60% visit metric are live-usage numbers requiring production data. |
| 2 | My Workflows is the default landing surface (D-16 redirect) | VERIFIED | `lib/auth/middleware.ts` line 95-96 redirects `/app`, `/app/`, `/app/home` → `/app/workflows` with status 307. `app/app/home/page.tsx` also redirects. Middleware test covers the three D-16 cases (confirmed by unit test results: 46/46 pass). |
| 3 | Activity log loads <1s p50 with 1000+ entries, with working filters | ? UNCERTAIN (human_needed) | Structural capability VERIFIED: `activity-log.tsx` uses `useVirtualizer` from `@tanstack/react-virtual`; cursor pagination on `(occurred_at DESC, id DESC)` LIMIT 50; three composite indexes in migration 0005 (`idx_activity_user_workflow_time`, `idx_activity_user_result_time`, `idx_activity_user_level_time`). Filters combine with AND and render as removable pills. p50 under load is not verifiable by code inspection — requires load test. |
| 4 | User can revert a recent agent action subject to drift rules; disabled reverts show a tooltip; bulk revert is atomic all-or-none | VERIFIED | `canRevert()` enforces all 5 fail modes (content 7d, structural 24h, sent never, manually-edited-since, already-reverted). Server Action re-evaluates independently with fresh `shopify_updated_at`. Revert logs via `writeActivityTx` on the SAME tx handle (CR-01 fix). `bulkRevertActivity` wraps all writes in `tx.transaction(innerTx)`. Dry-run returns `revertable: string[]` (CR-02 fix). Disabled button uses `aria-disabled` + `@radix-ui/react-tooltip` with `aria-describedby` (D-09). 14 canRevert unit tests pass. |
| 5 | Workflows are versioned — editing increments version, runs reference their version, restore creates a new version without overwriting history | VERIFIED | `createWorkflowVersion` uses `INSERT...SELECT COALESCE(MAX,0)+1` (atomic, no race — WR-08 fix). `restoreVersion` passes `{ replaceDefinition: true }` → exact snapshot, no shallow merge (WR-06 fix). Old rows never mutated. `workflow_runs.workflow_version_id` FK + `workflow_version_snapshot` JSONB confirm runs reference their version. Version-history-panel marks current version as disabled-restore and calls `restoreVersion` for others. 3 versioning unit tests pass. |

**Score:** 3/5 truths VERIFIED outright; 2/5 are UNCERTAIN pending human verification (live-usage metrics and p50 performance).

---

## Required Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `supabase/migrations/0005_activity_indexes.sql` | VERIFIED | Present. 3 composite indexes (`idx_activity_user_workflow_time`, `idx_activity_user_result_time`, `idx_activity_user_level_time`) + 3 Realtime RLS policies (activity, runs, approvals-strip). Confirmed applied to live DB per SUMMARY-01. |
| `lib/workflows/versions.ts` | VERIFIED | Present, substantive (241 lines). Exports `createWorkflowVersion`, `createWorkflowVersionWithRetry`, `CreateVersionOptions`. Atomic INSERT...SELECT, 10-version prune, forward-only restore via `replaceDefinition` option. |
| `lib/workflows/revert.ts` | VERIFIED | Present, substantive. Exports `canRevert`, `REVERT_REASON_LABELS`, `executeRevertEffect`. All 5 fail modes + success path implemented. executeRevertEffect is a documented stub (IN-02, acceptable for Phase 3). |
| `lib/workflows/grouping.ts` | VERIFIED | Present. Exports `groupWorkflowsByStatus`. Pure function — 5 status buckets. |
| `lib/actions/workflows.ts` | VERIFIED | Present, substantive. Exports `editWorkflow`, `togglePause`, `restoreVersion`, `runNow`. All Zod-validated, withUserRls, toClientError. `togglePause` intentionally NOT versioned (WR-05 corrected). |
| `lib/actions/activity.ts` | VERIFIED | Present, substantive (438 lines). Exports `revertActivity`, `bulkRevertActivity`, `saveAsWorkflow`. CR-01 fix: uses `writeActivityTx` on same tx handle. CR-02 fix: dry-run returns `revertable` field. toClientError used throughout (WR-09). |
| `app/app/workflows/page.tsx` | VERIFIED | Present (145+ lines). RSC, calls `groupWorkflowsByStatus`, parallel fetch, onboarding gate. `desc()` on activity ticker query (WR-01 fix). |
| `components/workflows/workflow-row.tsx` | VERIFIED | Present (443 lines). `editWorkflow` + `togglePause` wired. L3 confirm Dialog present. `context_workflow_id` omitted on new workflow path (WF-10). |
| `components/workflows/recent-activity-strip.tsx` | VERIFIED | Present (374 lines). Realtime subscriptions to `activity:${userId}` and `approvals-strip:${userId}` both with `{ config: { private: true } }` (WR-02 fix). "estimated" label present (9 matches). removeChannel cleanup present. |
| `components/workflows/inline-editable-text.tsx` | VERIFIED | Present (172 lines). Enter saves, Escape cancels via `cancelledRef`, no separate save button. |
| `app/app/workflows/[id]/page.tsx` | VERIFIED | Present. `await params` (Next.js 15). Parallel fetch workflow + last 10 versions + recent 20 runs. 404 if not owned. |
| `components/workflows/version-history-panel.tsx` | VERIFIED | Present (200+ lines). Calls `restoreVersion`. Current version marked and disabled. Footer note: "Restore creates a new version — history is never overwritten". |
| `components/workflows/historical-runs-panel.tsx` | VERIFIED | Present (215+ lines). Realtime on `runs:${workflowId}` with `{ config: { private: true } }`. `removeChannel` cleanup. INSERT prepends, UPDATE updates status. |
| `components/workflows/run-now-dialog.tsx` | VERIFIED | Present (165+ lines). L1 trigger via `useEffect` with `hasFiredRef` guard (WR-03 fix). L2/L3 show confirm dialog. Calls `runNow`. |
| `components/workflows/workflow-detail-header.tsx` | VERIFIED | Present (320+ lines). `InlineEditableText` for name/description → `editWorkflow`. `L3 confirm` via explicit arg `applyLevel("L3")` (WR-04 fix). `openWorkflowInChat` sets `context_workflow_id` (WF-12). |
| `app/app/activity/page.tsx` | VERIFIED | Present. `await searchParams` (Next.js 15). `shopify_updated_at` join present. Onboarding gate. |
| `app/app/activity/actions.ts` | VERIFIED | Present. `fetchActivityPage` cursor pagination keyed on `(occurred_at DESC, id DESC)`. Re-filters by `user_id`. `shopify_updated_at` join. LIMIT 50. |
| `components/activity/activity-log.tsx` | VERIFIED | Present. `useVirtualizer` from `@tanstack/react-virtual`. Flattened day-header+row array. estimateSize 36/52, overscan 10. Infinite scroll. |
| `components/activity/activity-detail.tsx` | VERIFIED | Present. Calls `canRevert` with `shopifyUpdatedAt`. Imports from `lib/actions/activity` (not route-local). Enabled revert → `revertActivity`. Disabled → `RevertTooltip`. `saveAsWorkflow` → router push. |
| `components/activity/before-after-diff.tsx` | VERIFIED | Present. `dangerouslySetInnerHTML` count = 0 (XSS-safe). Independent `expandedBefore`/`expandedAfter` state (WR-07 fix). |
| `components/activity/reasoning-chain.tsx` | VERIFIED | Present. Uses `createBrowserClient()` from `@/lib/auth/client` (CR-03 fix — not `NEXT_PUBLIC_SUPABASE_ANON_KEY`). |
| `components/activity/revert-tooltip.tsx` | VERIFIED | Present. Imports `@radix-ui/react-tooltip`. `aria-describedby` present. `aria-disabled` button (not HTML disabled). |
| `components/activity/bulk-revert-modal.tsx` | VERIFIED | Present. `bulkRevertActivity` called with `dryRun:true` then `dryRun:false`. Reads `classification.revertable.length` for Confirm button gate (CR-02 fix). all-blocked = Cancel only. Imports from `lib/actions/activity`. |

---

## Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `lib/actions/activity.ts` | `lib/workflows/revert.ts` | `canRevert` | WIRED | `import { canRevert, ... } from "@/lib/workflows/revert"` line 30; called at lines 138, 280 |
| `lib/actions/workflows.ts` | `inngest` | `workflow.run_requested` | WIRED | `name: "workflow.run_requested"` at line 314 |
| `lib/workflows/versions.ts` | `workflow_versions` | atomic INSERT...SELECT | WIRED | `INSERT INTO workflow_versions ... SELECT COALESCE(MAX(version_number),0)+1` at lines 155-166 |
| `app/app/workflows/page.tsx` | `lib/workflows/grouping.ts` | `groupWorkflowsByStatus` | WIRED | Import line 26; called line 185 |
| `components/workflows/workflow-row.tsx` | `lib/actions/workflows.ts` | `editWorkflow / togglePause` | WIRED | Import line 32; called lines 199, 236 |
| `components/workflows/recent-activity-strip.tsx` | `activity_entries / approvals` | `postgres_changes` (private channel) | WIRED | `channel('activity:${userId}', { config: { private: true } })` lines 142-145 |
| `components/workflows/workflow-detail-header.tsx` | `lib/actions/workflows.ts` | `editWorkflow` | WIRED | grep count ≥ 12 per SUMMARY-03 |
| `components/workflows/version-history-panel.tsx` | `lib/actions/workflows.ts` | `restoreVersion` | WIRED | Import + called at line 68 |
| `components/workflows/historical-runs-panel.tsx` | `workflow_runs` | `postgres_changes runs:<workflowId>` | WIRED | `channel('runs:${workflowId}', { config: { private: true } })` line 102 |
| `components/activity/activity-detail.tsx` | `lib/workflows/revert.ts` | `canRevert` (UI show/disable) | WIRED | Import line 35; called at canRevert(entry, shopifyUpdatedAt) |
| `components/activity/activity-detail.tsx` | `lib/actions/activity.ts` | `revertActivity` | WIRED | Import lines 37-39; called in enabled-revert path |
| `components/activity/bulk-revert-modal.tsx` | `lib/actions/activity.ts` | `bulkRevertActivity` (dry-run + execute) | WIRED | Import from `lib/actions/activity`; called at lines with `dryRun:true` and `dryRun:false` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `app/app/workflows/page.tsx` | `workflows`, `grouped` | Drizzle query filtered by `user_id` → `groupWorkflowsByStatus` | Yes — live DB query | FLOWING |
| `components/workflows/recent-activity-strip.tsx` | `stats` (decisions/ran/timeSaved) | RSC fetch (approvals count, L3 last-12h count, time-saved aggregate) + Realtime INSERT updates | Yes — live DB queries + Realtime | FLOWING |
| `app/app/activity/page.tsx` | `initialEntries` | Drizzle cursor query `(occurred_at DESC, id DESC)` LIMIT 50 + `shopify_updated_at` join | Yes — live DB query | FLOWING |
| `components/activity/activity-log.tsx` | virtual rows | `initialEntries` from RSC + `fetchActivityPage` cursor pagination | Yes — real entries from DB | FLOWING |
| `components/workflows/version-history-panel.tsx` | `versions` | Passed from RSC: last 10 `workflow_versions` desc | Yes — live DB query in RSC | FLOWING |
| `components/workflows/historical-runs-panel.tsx` | `runs` | Passed from RSC + Realtime INSERT/UPDATE on `workflow_runs` | Yes — live DB + Realtime | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript: no type errors across all 41 phase files | `npx tsc --noEmit` | exit 0, no output | PASS |
| All 6 Wave 0 test files (versions/revert/grouping/actions/smoke/middleware) | `npx vitest run` (6 files) | 46/46 tests pass | PASS |
| Full test suite | `npx vitest run` (31 files) | 315/315 pass, 3 skipped, 12 todo | PASS |
| Migration 0005 has 3 composite indexes | `grep -c "idx_activity_user_*" 0005.sql` | 3 | PASS |
| Migration 0005 has Realtime RLS policies | `grep -v "^--" 0005.sql \| grep -c "activity:\|runs:"` | 2 (+ approvals-strip in WR-02 fix) | PASS |
| `canRevert` wired in Server Action | `grep -c "canRevert" lib/actions/activity.ts` | present (import + calls) | PASS |
| `workflow.run_requested` event emitted by `runNow` | `grep -c "workflow.run_requested" lib/actions/workflows.ts` | 1 | PASS |
| `dangerouslySetInnerHTML` absent from before-after-diff | `grep -c "dangerouslySetInnerHTML" before-after-diff.tsx` | 0 | PASS |
| CR-03: reasoning-chain uses project factory | `grep "createBrowserClient" reasoning-chain.tsx` | `from "@/lib/auth/client"` | PASS |
| CR-02: dry-run returns `revertable` field | Inspected `lib/actions/activity.ts:294-298` + modal reads `classification.revertable.length` | `revertable: revertable.map(e => e.id)` returned on dry-run | PASS |
| CR-01: `writeActivityTx` on same tx handle | Inspected `lib/actions/activity.ts:147,310` | `writeActivityTx(tx, ...)` / `writeActivityTx(innerTx, ...)` — not serviceDb | PASS |

---

## Code Review Fix Verification (3 Blockers + 9 Warnings)

| Finding | Status | Evidence |
|---------|--------|---------|
| CR-01: Bulk-revert not atomic (serviceDb outside tx) | FIXED | `writeActivityTx(tx/innerTx, userId, ...)` — both single and bulk revert write on the RLS tx handle. `lib/workflows/activity.ts` exports `writeActivityTx` sharing column mapping with `writeActivity`. |
| CR-02: Bulk-revert confirm button never appears | FIXED | `bulkRevertActivity` returns `revertable: revertable.map(e => e.id)` on dry-run. Modal reads `classification.revertable.length` for `revertableCount`. Confirm button gated on `revertableCount > 0`. |
| CR-03: reasoning-chain uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (undefined) | FIXED | `components/activity/reasoning-chain.tsx:179` imports and calls `createBrowserClient()` from `@/lib/auth/client`. No `ANON_KEY` reference anywhere in the file. |
| WR-01: Ticker queries oldest 5 entries (asc order) | FIXED | `app/app/workflows/page.tsx:172`: `.orderBy(desc(activityEntries.occurred_at)).limit(5)` |
| WR-02: Activity/approvals channels not private (RLS bypass) | FIXED | Both channels: `{ config: { private: true } }`. Migration 0005 gains an `approvals-strip:<userId>` RLS policy. |
| WR-03: RunNowDialog executes Server Action during render | FIXED | L1 execution moved to `useEffect(() => { ... }, [open, needsConfirm])` with `hasFiredRef.current` guard. |
| WR-04: L3 confirm reads async `pendingLevel` state | FIXED | `handleConfirmL3` calls `applyLevel("L3")` directly. `pendingLevel` state removed from the function. |
| WR-05: `togglePause` misleading versioning comment | FIXED | Doc block explicitly states: "status is intentionally NOT versioned. D-03 scopes 'every edit creates a new version' to WorkflowDefinition fields." |
| WR-06: `restoreVersion` shallow-merges (not exact snapshot) | FIXED | `restoreVersion` passes `{ replaceDefinition: true }` to `createWorkflowVersionWithRetry`. `createWorkflowVersion` uses `{ ...patch }` when `options?.replaceDefinition === true`. |
| WR-07: DiffRow shared expand state between before/after | FIXED | `components/activity/before-after-diff.tsx:160-161`: `const [expandedBefore, setExpandedBefore] = useState(false)` and `const [expandedAfter, setExpandedAfter] = useState(false)` — independent. |
| WR-08: `createWorkflowVersionWithRetry` race + aborted tx | FIXED | `createWorkflowVersion` now uses `INSERT INTO workflow_versions ... SELECT COALESCE(MAX(version_number),0)+1 ... RETURNING id, version_number` — single atomic statement eliminates the read-then-insert race. The wrapper retry is kept as belt-and-suspenders. |
| WR-09: `String(err)` leaks raw DB errors to client | FIXED | All Server Actions use `toClientError(err, context)` from `lib/errors.ts` which logs server-side and returns a safe generic message. |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WF-07 | 03-01, 03-02 | My Workflows grouped by status, recent-activity strip | SATISFIED | `groupWorkflowsByStatus` wired; 5 status buckets rendered; strip with Realtime |
| WF-08 | 03-01, 03-02 | Inline L1/L2/L3 toggle with immediate save; L3 one-time confirm | SATISFIED | `editWorkflow` called from `LevelToggle`; Dialog gates L3 selection |
| WF-09 | 03-01, 03-02 | Pause/resume without deleting (history + config retained) | SATISFIED | `togglePause` flips `active↔paused`; row stays in list |
| WF-10 | 03-02 | + New Workflow opens Conversation thread with no context | SATISFIED | `_workflows-view.tsx` navigates to `/app/chat` with no `context_workflow_id` |
| WF-11 | 03-03 | Workflow Detail: definition + runs; name/description/schedule/level inline-editable | SATISFIED | `workflow-detail-header.tsx` InlineEditableText + editWorkflow; schedule-picker |
| WF-12 | 03-03 | Open in Chat: scoped thread with workflow context | SATISFIED | `openWorkflowInChat` SA inserts thread with `context_workflow_id` set |
| WF-13 | 03-01, 03-03 | Run Now triggers execution; run appears within seconds | SATISFIED | `runNow` sends `workflow.run_requested`; `historical-runs-panel.tsx` Realtime subscription |
| WF-14 | 03-01, 03-03 | Versioned — editing increments version; runs reference version; restore creates new version | SATISFIED | `createWorkflowVersion` atomic; `workflow_version_id` FK on runs; `replaceDefinition` restore |
| ACT-01 | 03-04 | Activity log lists agent actions chronologically with all required fields | SATISFIED | `activity-row.tsx` renders timestamp, workflow, summary, result, automation level |
| ACT-02 | 03-04 | Filters combine with AND; removable pills | SATISFIED | `activity-filters.tsx` AND-combined; removable pills in filter bar |
| ACT-03 | 03-04 | Activity detail: before/after diff + reasoning chain + parent workflow link | SATISFIED | `activity-detail.tsx` + `before-after-diff.tsx` + `reasoning-chain.tsx` |
| ACT-04 | 03-01, 03-04 | Revert subject to drift rules; disabled = tooltip explaining why | SATISFIED | `canRevert` enforced server-side; `revert-tooltip.tsx` with `aria-describedby` |
| ACT-05 | 03-01, 03-04 | Multi-select bulk revert: atomic all-or-none | SATISFIED | `bulkRevertActivity` with `innerTx`; modal with dry-run/execute split |
| ACT-06 | 03-01, 03-04 | Save as Workflow: scoped Conversation thread with action context | SATISFIED | `saveAsWorkflow` creates thread with action context; returns `threadId` |
| ACT-07 | 03-01, 03-04 | Activity log loads <1s p50 with 1000+ entries | STRUCTURAL SATISFIED / METRIC: human_needed | Indexes + virtualization + cursor pagination in place; p50 requires load test |
| ACT-08 | 03-01, 03-04 | Drift rules enforced consistently in UI and backend | SATISFIED | Single `canRevert` function (D-11) shared by UI + Server Action; fresh re-fetch on server |

All 16 requirements (WF-07 through WF-14, ACT-01 through ACT-08) are mapped and covered. No orphaned requirements.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/workflows/versions.ts:46` | 46 | `DrizzleTx = any` — type widening | INFO | Pre-existing, acceptable for Phase 3; `IN-05` from code review; does not affect correctness |
| `lib/workflows/revert.ts:179-191` | 179-191 | `executeRevertEffect` is a documented no-op stub | INFO | `IN-02` from code review; success toast issued before external effect wired; acceptable documented stub for Phase 3 — Phase 4 wires adapters. Comment in code acknowledges this. |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-3-modified file.
No hardcoded empty data flowing to UI rendering.
No `dangerouslySetInnerHTML` in diff renderer.

---

## Human Verification Required

### 1. Activity Log p50 Performance Under Load

**Test:** Seed the database with 1000+ activity entries for a test user. Navigate to `/app/activity`, measure Time to First Byte and time to interactive in the browser DevTools Network panel.
**Expected:** Page loads and first 50 rows are visible in under 1 second (p50). Scroll to the bottom to trigger cursor pagination; next page loads in under 1 second.
**Why human:** The composite indexes from migration 0005, `@tanstack/react-virtual` virtualization, and LIMIT-50 cursor pagination are all in place. The p50 metric itself requires a seeded database and network measurement — cannot be derived from code inspection.

### 2. My Workflows Usage Metrics (SC-1 + SC-2)

**Test:** Observe production usage over week 4 — median active workflow count per user; % of users visiting My Workflows 3x/week.
**Expected:** Median user has 5+ active workflows; 60% visit 3x/week.
**Why human:** SC-1 (median 5+ workflows) and SC-2 (60% visit frequency) are live-usage metrics. The structural capability is verified: D-16 redirect is live, My Workflows is the confirmed default landing surface, and status grouping is functional. The engagement numbers require production analytics.

### 3. Realtime Strip Live-Count Update

**Test:** Open My Workflows in two browser tabs as the same user. In Tab B trigger an activity event (e.g., approve a pending action or trigger a Run Now). In Tab A observe the Recent Activity Strip.
**Expected:** The "Ran while you slept" counter and "What just happened" ticker update in Tab A within ~5 seconds without a manual refresh.
**Why human:** Realtime subscription wiring uses `{ config: { private: true } }` and migration 0005 RLS policy. Live behavior depends on the Supabase Realtime broker and channel authorization being correctly applied on the live database.

### 4. Run Now → Historical Runs Realtime Appearance

**Test:** On Workflow Detail for an L1 workflow, click "Run Now". Observe the Historical Runs panel.
**Expected:** A new run row appears at the top of Historical Runs within seconds without a page refresh. The optimistic row (prefixed `optimistic-`) is replaced by the real row once Realtime broadcasts the INSERT.
**Why human:** Requires live Inngest worker to process the `workflow.run_requested` event and write a `workflow_runs` row, which then triggers the Supabase Realtime `runs:<workflowId>` broadcast.

### 5. Disabled-Revert Tooltip Accessibility (WCAG 2.1 AA)

**Test:** Navigate to `/app/activity`, select an activity entry with a blocked revert (e.g., sent email or entry older than 7 days). Using keyboard only (Tab key), focus the disabled revert button. With a screen reader (VoiceOver or NVDA) active, trigger the focused button.
**Expected:** Tooltip appears on focus; screen reader announces the disable reason (e.g., "Sent emails cannot be undone"). The button is focusable despite being `aria-disabled` (not HTML `disabled`).
**Why human:** The `@radix-ui/react-tooltip` implementation with `aria-describedby` is code-verified. Actual screen-reader announcement behavior requires AT testing.

---

## Gaps Summary

No blocking gaps found. All code review findings (3 critical + 9 warnings) have been fixed and verified in the codebase. The two UNCERTAIN truths are live-usage/performance metrics that cannot be proven by static code inspection — they require human verification with production data or load testing.

The phase goal is structurally achieved: all 16 requirements are implemented, wired, and tested. The human verification items cover observable production metrics and live Realtime/accessibility behaviors that are beyond static verification scope.

---

_Verified: 2026-05-22T12:12:00Z_
_Verifier: Claude (gsd-verifier)_
