---
phase: 3
slug: ownership-the-portfolio
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-22
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `03-RESEARCH.md` → `## Validation Architecture`. Task IDs are filled in by the planner; this contract maps requirements → tests so every plan can attach `<automated>` verification.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (from Phase 1/2) |
| **Config file** | `vitest.config.mts` |
| **Quick run command** | `npx vitest run tests/unit/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10–20 seconds (unit, no DB) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/` (fast, no DB)
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

> Task IDs assigned by planner. Plan column = expected slice (My Workflows / Workflow Detail / Activity / Wave 0 infra).

| Plan (slice) | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|--------------|-------------|----------|-----------|-------------------|-------------|--------|
| Wave 0 infra | — | Migration 0005 (activity indexes + Realtime RLS) applied to live DB | manual/CLI | `npx supabase db push` then `npx supabase migration list` | ❌ W0 | ⬜ pending |
| Workflow Detail | WF-14 | `createWorkflowVersion` increments version_number atomically | unit | `npx vitest run tests/unit/workflows/versions.test.ts` | ❌ W0 | ⬜ pending |
| Workflow Detail | WF-14 | Restore creates a NEW forward version (does not mutate old rows) | unit | `npx vitest run tests/unit/workflows/versions.test.ts` | ❌ W0 | ⬜ pending |
| Workflow Detail | WF-14 | 10-version retention prune removes oldest, preserves latest 10 | unit | `npx vitest run tests/unit/workflows/versions.test.ts` | ❌ W0 | ⬜ pending |
| Activity | ACT-08 | `canRevert()` → `allowed:false` for entries outside 7d content window | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ W0 | ⬜ pending |
| Activity | ACT-08 | `canRevert()` → `allowed:false` for sent email (window=sent=never) | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ W0 | ⬜ pending |
| Activity | ACT-08 | `canRevert()` → `allowed:false` when `shopifyUpdatedAt > occurred_at` (manually edited since) | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ W0 | ⬜ pending |
| Activity | ACT-08 | `canRevert()` → `allowed:false` for structural edits outside 24h | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ W0 | ⬜ pending |
| Activity | ACT-08 | `canRevert()` → `allowed:true` for in-window content edit (success path) | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ W0 | ⬜ pending |
| Activity | ACT-05 | `bulkRevertActivity` dry-run returns correct split of revertable vs blocked (no writes) | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ W0 | ⬜ pending |
| Activity | ACT-05 | `bulkRevertActivity` is atomic — partial failure rolls back all writes | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ W0 | ⬜ pending |
| Activity | ACT-07 | Activity page renders a 50-item page without error (smoke) | smoke | `npx vitest run tests/smoke/activity.test.ts` | ❌ W0 | ⬜ pending |
| Workflow Detail | WF-13 | `runNow` Server Action sends correct Inngest event with `userId` + `workflowId` | unit (mock inngest) | `npx vitest run tests/unit/actions/workflows.test.ts` | ❌ W0 | ⬜ pending |
| My Workflows | WF-07 | My Workflows groups workflows by status correctly | unit | `npx vitest run tests/unit/workflows/grouping.test.ts` | ❌ W0 | ⬜ pending |
| My Workflows | D-16 | `/app` and `/app/home` redirect to `/app/workflows` | integration | `npx vitest run tests/unit/middleware.test.ts` (+ manual browser check) | ✅ extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Trust-critical behaviors requiring test coverage before deployment:**
- `canRevert()`: all 5 failure modes (out_of_window, sent, manually_edited_since, structural_out_of_window, already_reverted/is_revert_entry) + the success path
- `createWorkflowVersion`: atomicity + 10-version retention enforcement + restore-creates-forward-version (never mutates history)
- `bulkRevertActivity`: dry-run classification returns correct split before any writes; atomic all-or-none on execute

---

## Wave 0 Requirements

- [ ] `tests/unit/workflows/versions.test.ts` — WF-14 version increment, restore-forward, 10-version prune (mock db)
- [ ] `tests/unit/workflows/revert.test.ts` — ACT-08 `canRevert()` all 5 fail modes + success path; ACT-05 bulk dry-run split + atomicity (pure function — no mock needed for canRevert)
- [ ] `tests/unit/actions/workflows.test.ts` — WF-13 `runNow` (mock `inngest.send`)
- [ ] `tests/unit/workflows/grouping.test.ts` — WF-07 status-grouping logic (pure function)
- [ ] `tests/smoke/activity.test.ts` — ACT-07 Activity page renders without error
- [ ] Extend `tests/unit/middleware.test.ts` — D-16 `/app` → `/app/workflows` redirect (existing file)

*Migration 0005 (`supabase/migrations/0005_activity_indexes.sql`) is a Wave 0 dependency for all Activity work — composite indexes on `activity_entries` + Realtime RLS policies for `activity:<userId>` and `runs:<workflowId>` channels. Must be pushed (`npx supabase db push`) before Activity perf can be validated.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Activity log loads <1s p50 with 1,000+ entries | ACT-07 | Real-DB timing — depends on indexes + live row volume; not reproducible in unit test | Seed 1,000+ activity entries for a user, open `/app/activity`, measure p50 load over ~10 reloads (browser perf panel / server timing) |
| "Run Now" → run appears in Historical Runs within seconds | WF-13 | Requires live Inngest + Realtime/poll round-trip | Trigger Run Now on a read-only workflow, observe new run row appears without manual refresh |
| Realtime strip counts update live | WF-08/D-15 | Requires live Supabase Realtime channel auth | Open My Workflows in two tabs; cause an L3 action / approval; confirm strip updates |
| Inline edit click-to-edit UX (blur/Enter saves, Esc cancels) | WF-11 | Interaction/visual behavior | Click name/description on Workflow Detail; edit; blur & Enter save, Esc reverts |
| Disabled-revert tooltip is keyboard- + screen-reader-accessible | ACT-08/D-09 | A11y behavior | Tab to a disabled revert; confirm tooltip reachable + announced |

---

## Validation Sign-Off

- [x] All requirements have `<automated>` verify or a Wave 0 dependency (perf/realtime are manual by necessity)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-22
