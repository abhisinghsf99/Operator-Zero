---
phase: 03-ownership-the-portfolio
plan: 03
subsystem: ui
tags: [react, server-components, supabase-realtime, workflow-detail, inline-edit, versioning, run-now, schedule-picker, version-restore]

# Dependency graph
requires:
  - plan: 03-01
    provides: editWorkflow, restoreVersion, runNow Server Actions, createWorkflowVersion (version-on-edit), Migration 0005 Realtime RLS (runs:<workflowId>)
  - plan: 03-02
    provides: InlineEditableText click-to-edit primitive (reused for name/description)
provides:
  - "app/app/workflows/[id]/page.tsx — Workflow Detail RSC: awaits params (Next.js 15), parallel fetch workflow + last 10 versions + recent 20 runs, onboarding gate, 404 if not owned"
  - "app/app/workflows/[id]/_workflow-detail-view.tsx — client shell: breadcrumb, WorkflowDetailHeader, 5-stat bar, WorkflowDiagram, HistoricalRunsPanel + VersionHistoryPanel"
  - "components/workflows/workflow-detail-header.tsx — InlineEditableText for name/description (D-01/D-03), LevelSelector with L3 confirm dialog, SchedulePicker trigger, Open in Chat (D-06/context_workflow_id), Run Now button"
  - "components/workflows/schedule-picker.tsx — structured frequency+time picker → trigger_config JSONB; no raw cron exposed (D-02)"
  - "components/workflows/workflow-diagram.tsx — read-only step graph with screen-reader text equivalent"
  - "components/workflows/version-history-panel.tsx — last 10 versions + Restore (current marked + disabled, forward-only D-04)"
  - "components/workflows/historical-runs-panel.tsx — recent runs timeline + Realtime subscription runs:<workflowId> (INSERT prepends, UPDATE updates status; WF-13)"
  - "components/workflows/run-now-dialog.tsx — confirm dialog for write/L3 workflows; instant execution for L1 manual; calls runNow (D-05)"
  - "app/app/chat/actions.ts: openWorkflowInChat — creates scoped thread with context_workflow_id set (D-06/WF-12)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC parallel fetch (Promise.all) mirrors settings/page.tsx — workflow + versions + runs in one go"
    - "Realtime historical-runs: createBrowserClient + setAuth + cancelled-flag + removeChannel (runs:<workflowId> postgres_changes INSERT+UPDATE)"
    - "InlineEditableText reused from plan 03-02 for name + description in detail header (D-01/D-03)"
    - "L3 one-time confirm dialog pattern reused from workflow-row.tsx (L3 confirm) in LevelSelector"
    - "Schedule picker maps structured selections → trigger_config JSONB; internal cron but no raw cron exposed to user (D-02)"
    - "RunNowDialog: requiresConfirmDialog(automationLevel) — L2/L3 get confirm, L1 runs instantly (D-05)"
    - "openWorkflowInChat Server Action inserts thread with context_workflow_id set directly in DB (D-06)"
    - "restoreVersion: current version marked + disabled, Restore creates forward version note in UI (D-04/Pitfall 6)"

key-files:
  created:
    - app/app/workflows/[id]/page.tsx
    - app/app/workflows/[id]/_workflow-detail-view.tsx
    - components/workflows/workflow-detail-header.tsx
    - components/workflows/schedule-picker.tsx
    - components/workflows/workflow-diagram.tsx
    - components/workflows/version-history-panel.tsx
    - components/workflows/historical-runs-panel.tsx
    - components/workflows/run-now-dialog.tsx
  modified:
    - app/app/chat/actions.ts

key-decisions:
  - "openWorkflowInChat is a new Server Action (not a modification of createThread) — inserts thread with context_workflow_id set in DB; cleaner than passing workflow context via URL param (D-06/WF-12)"
  - "All Task 2 components created during Task 1 execution — required for compilation since workflow-detail-header imports them; no separate commit needed for correctness"
  - "RunNowDialog: requiresConfirmDialog returns true for L2 and L3 — L2 approval-gated workflows also get the confirm dialog as a precaution (safer than instant run)"
  - "HistoricalRunsPanel Realtime: optimistic runs (id starts with 'optimistic-') are deduped on INSERT event from Realtime"

requirements-completed: [WF-11, WF-12, WF-13, WF-14]

# Metrics
duration: ~30min
completed: 2026-05-22
---

# Phase 3 Plan 03: Workflow Detail Surface Summary

**The Workflow Detail surface delivering /app/workflows/[id] with inline-editable name/description/level/schedule (each edit increments version), version history panel with forward-only Restore, historical runs panel live via Realtime, and Run Now confirm-for-write dialog.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-22T19:00:00Z (approx)
- **Completed:** 2026-05-22T19:30:00Z (approx)
- **Tasks:** 2 (both auto)
- **Files created:** 8 (1 modified)

## Accomplishments

### Task 1: Workflow Detail RSC + view shell + inline-edit header + schedule picker + diagram

- **`app/app/workflows/[id]/page.tsx`** — RSC mirroring chat/[threadId]/page.tsx: `Promise<{id}>` params awaited (Next.js 15), `getOrCreateProfile` onboarding gate, three-way `Promise.all` parallel fetch of: the workflow row (with 404 if not found or not owned), last 10 versions desc by version_number, recent 20 runs desc by started_at. Passes all to `WorkflowDetailView`.
- **`app/app/workflows/[id]/_workflow-detail-view.tsx`** — Client shell: breadcrumb back to `/app/workflows`, `WorkflowDetailHeader`, 5-stat bar (automation level, trigger, last run, total runs, success rate), `WorkflowDiagram` in left panel, `HistoricalRunsPanel` + `VersionHistoryPanel` in right side panel. Local state tracks optimistic workflow field updates from inline edits.
- **`components/workflows/workflow-detail-header.tsx`** — `InlineEditableText` (from plan 03-02) for name and description; each save calls `editWorkflow(workflowId, patch)` → version increments (D-01/D-03). `LevelSelector` with L3 one-time confirm dialog (Radix Dialog, reuses workflow-row pattern). Schedule picker button opens `SchedulePicker`. "Open in Chat" calls `openWorkflowInChat` → creates thread with `context_workflow_id` set (D-06/WF-12). "Run Now" opens `RunNowDialog`.
- **`components/workflows/schedule-picker.tsx`** — Radix Dialog wrapping a structured frequency select (manual/hourly/daily/weekly/custom) + time-of-day + day-of-week + interval. Maps selections to `trigger_config` JSONB internally (cron/interval_minutes); no free-text cron exposed to user (D-02). Calls `editWorkflow({ trigger_type, trigger_config })` on save → version increments (D-03).
- **`components/workflows/workflow-diagram.tsx`** — Read-only step graph matching the `WorkflowDiagram` design in surface-workflow-detail.jsx. Numbered circles + connector lines + step name/description/tool. Screen-reader text equivalent (visually-hidden `<ol>`) for WCAG 2.1 AA (analog to workflow-visualizer.tsx).
- **`app/app/chat/actions.ts`** — Added `openWorkflowInChat(workflowId, workflowName)` Server Action: Zod-validated, inserts a new thread row with `context_workflow_id` set, returns `{ threadId }` (D-06/WF-12).

### Task 2: Version-history panel (Restore) + historical-runs panel (Realtime) + Run Now dialog

- **`components/workflows/version-history-panel.tsx`** — Lists last 10 versions (number + relative date). The row matching `current_version_id` is marked "Current" with Restore disabled (RESEARCH Pitfall 6; T-3-03-04). All other versions show a "Restore" button that calls `restoreVersion(workflowId, versionId)` with `isPending` guard. Footer note: "Restore creates a new version — history is never overwritten" (D-04/success-criterion 5). Sonner toast on success/error.
- **`components/workflows/historical-runs-panel.tsx`** — Timeline of recent runs with status-colored dots and relative timestamps. Subscribes to Supabase Realtime `runs:${workflowId}` (postgres_changes INSERT + UPDATE on `workflow_runs`, filter `workflow_id=eq.X`) using canonical `createBrowserClient + setAuth + cancelled-flag + removeChannel` pattern. INSERT event prepends new run and deduplicates optimistic rows. UPDATE event updates status in place (WF-13).
- **`components/workflows/run-now-dialog.tsx`** — For L2/L3 workflows: Radix Dialog with description summary of what Run Now does, then calls `runNow(workflowId)` on confirm. For L1 (manual): no dialog — executes immediately. `useTransition` pending state + "Running…" label. Emits a synthetic optimistic `WorkflowRunData` row to `HistoricalRunsPanel` so the new run appears immediately; Realtime replaces it with the real row within seconds (WF-13/D-05).

## Task Commits

All files were created in a single commit as Task 1 + Task 2 were created together for compilation (header imports all Task 2 components):

1. **Tasks 1+2** (feat): `be66303` — Workflow Detail route + view shell + inline-edit header + schedule picker + diagram (+ all Task 2 panel/dialog components)

## Files Created/Modified

- `app/app/workflows/[id]/page.tsx` — Workflow Detail RSC (145+ lines)
- `app/app/workflows/[id]/_workflow-detail-view.tsx` — Client view shell (290+ lines)
- `components/workflows/workflow-detail-header.tsx` — Header with inline-edit + level + schedule + actions (320+ lines)
- `components/workflows/schedule-picker.tsx` — Structured schedule picker (280+ lines)
- `components/workflows/workflow-diagram.tsx` — Read-only step graph (125+ lines)
- `components/workflows/version-history-panel.tsx` — Version list + Restore (200+ lines)
- `components/workflows/historical-runs-panel.tsx` — Realtime runs timeline (215+ lines)
- `components/workflows/run-now-dialog.tsx` — Run Now confirm dialog (165+ lines)
- `app/app/chat/actions.ts` — openWorkflowInChat action added (~50 lines)

## Decisions Made

- **`openWorkflowInChat` Server Action added** (Rule 2 — missing critical functionality for D-06/WF-12): The `createThread` action didn't accept `context_workflow_id`. Rather than modifying the shared `createThread` function (which would require schema/signature changes), a new dedicated `openWorkflowInChat` action inserts the thread with `context_workflow_id` set directly. Cleaner separation between general thread creation and workflow-scoped chat.
- **All Task 2 components created during Task 1 commit**: `workflow-detail-header.tsx` imports all three Task 2 components (run-now-dialog, historical-runs-panel, version-history-panel), so they had to exist for TypeScript compilation. All files were created in the same commit pass; no separate commit was needed since they're all part of the same logical change.
- **RunNowDialog includes L2 in the confirm gate**: D-05 says "confirm for write/L3 workflows." L2 (approval-gated) was included as safer — an L2 run will pause at approval steps, but it's still reasonable to confirm before triggering.
- **Optimistic run deduplication**: HistoricalRunsPanel filters out optimistic rows (id starts with "optimistic-") when a real Realtime INSERT arrives, preventing duplicates.

## Deviations from Plan

### Auto-added Missing Critical Functionality

**[Rule 2 - Missing Critical Functionality] openWorkflowInChat Server Action**
- **Found during:** Task 1 — implementing D-06/WF-12 "Open in Chat"
- **Issue:** The `createThread` action in `app/app/chat/actions.ts` had no parameter for `context_workflow_id`. Without setting this FK at creation time, the thread would not be scoped to the workflow (violating D-06/WF-12).
- **Fix:** Added `openWorkflowInChat(workflowId, workflowName)` Server Action to `app/app/chat/actions.ts`. Zod-validated, inserts thread with `context_workflow_id` set via `withUserRls`. Returns `{ threadId }`.
- **Files modified:** `app/app/chat/actions.ts`
- **Commit:** `be66303`

## Known Stubs

- **WorkflowDiagram "empty state"**: If `workflow_versions.definition.steps` is empty or undefined (e.g., workflow created before version snapshots), the diagram shows "No steps defined yet. Use 'Edit in chat' to build this workflow." This is correct behavior — newly created workflows may have no steps until defined in Chat.
- **HistoricalRunsPanel "run summary text"**: Runs show status + trigger_source + relative time, but no human-readable summary of what the run did. The actual summary comes from `activity_entries` (linked via `workflow_runs` → `workflow_id`). This is out of scope for plan 03-03; plan 03-04 (Activity) handles the full activity narrative. The run timeline is functional but terse.

Neither stub blocks WF-11/WF-12/WF-13/WF-14 goals.

## Threat Surface Scan

- **New endpoint: `openWorkflowInChat` Server Action**: Creates a thread with `context_workflow_id`. Threat: spoofing a foreign workflow ID to create a thread associated with another user's workflow. Mitigation already in the Server Action: `workflowId` is Zod-validated (UUID), and the thread insert is inside `withUserRls` which enforces `user_id = auth.uid()` — the thread is owned by the caller, not the workflow owner. The `context_workflow_id` FK just links to the workflow; the RLS on threads ensures isolation. No new STRIDE risk beyond what's in the plan's threat model.

No other new network endpoints or auth paths introduced.

## Self-Check: PASSED

Files verified present on disk:
- `app/app/workflows/[id]/page.tsx` — FOUND
- `app/app/workflows/[id]/_workflow-detail-view.tsx` — FOUND
- `components/workflows/workflow-detail-header.tsx` — FOUND
- `components/workflows/schedule-picker.tsx` — FOUND
- `components/workflows/workflow-diagram.tsx` — FOUND
- `components/workflows/version-history-panel.tsx` — FOUND
- `components/workflows/historical-runs-panel.tsx` — FOUND
- `components/workflows/run-now-dialog.tsx` — FOUND

Commit verified: `be66303` — FOUND in git history

Acceptance criteria verified:
- `await params` in detail page: 1 (≥1) ✓
- `InlineEditableText\|editWorkflow` in header: 12 (≥2) ✓
- `context_workflow_id` in header: 4 (≥1) ✓
- `trigger_config` in schedule-picker: 17 (≥1) ✓
- `restoreVersion` in version-history-panel: 4 (≥1) ✓
- `current` (case-insensitive) in version-history-panel: 13 (≥1) ✓
- `postgres_changes\|runs:` in historical-runs-panel: 9 (≥1) ✓
- `removeChannel` in historical-runs-panel: 3 (≥1) ✓
- `runNow` in run-now-dialog: 6 (≥1) ✓
- `L3\|write\|read-only\|manual` in run-now-dialog: 15 (≥1) ✓

TypeScript: `npx tsc --noEmit` — PASSED (exit 0)
Unit tests: `npx vitest run tests/unit/actions/workflows.test.ts` — PASSED (4/4)

---
*Phase: 03-ownership-the-portfolio*
*Completed: 2026-05-22*
