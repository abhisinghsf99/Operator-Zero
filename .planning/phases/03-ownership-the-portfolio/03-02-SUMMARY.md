---
phase: 03-ownership-the-portfolio
plan: 02
subsystem: ui
tags: [react, server-components, supabase-realtime, workflow-surface, inline-edit, level-toggle, pause-resume]

# Dependency graph
requires:
  - plan: 03-01
    provides: groupWorkflowsByStatus, editWorkflow, togglePause Server Actions, Migration 0005 Realtime RLS, approvals.ts pending count source
provides:
  - "app/app/workflows/page.tsx — My Workflows RSC: parallel fetch (workflows + strip stats), groupWorkflowsByStatus, onboarding gate, StripStats type"
  - "app/app/workflows/_workflows-view.tsx — client shell: SurfaceHeader, RecentActivityStrip, WorkflowSearch, WorkflowGroup sections, empty state, + New Workflow → /app/chat"
  - "components/workflows/recent-activity-strip.tsx — 3-stat strip with Realtime subscription (activity:<userId>, approvals); 'What just happened' ticker; estimated label for time-saved (D-15)"
  - "components/workflows/workflow-group.tsx — section header + WorkflowRow list for one status bucket"
  - "components/workflows/workflow-search.tsx — client-side fuzzy filter by name/description/trigger_type (D-17)"
  - "components/workflows/workflow-row.tsx — WorkflowRow: StatusDot, name link, LevelToggle + L3 confirm Dialog (WF-08), pause/resume (WF-09), accessible disabled states"
  - "components/workflows/inline-editable-text.tsx — click-to-edit primitive: Enter/blur saves, Escape cancels, isPending guard (D-01 / Pitfall 3)"
affects: [03-03-workflow-detail, 03-04-activity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC parallel fetch (Promise.all) mirrors settings/page.tsx — onboarding gate + multi-fetch in one go"
    - "Realtime strip: createBrowserClient + setAuth + cancelled-flag + removeChannel (two channels: activity:<userId> + approvals-strip:<userId>)"
    - "Optimistic UI on level/pause mutations: local state updated immediately, reverted on Server Action error"
    - "L3 one-time confirm: Dialog gating before Server Action call — client-side UX gate, Server Action is the security enforcement"
    - "Inline edit: cancelledRef flag prevents double-save on Escape+blur (RESEARCH Pitfall 3)"
    - "Client-side fuzzy search: query state lifted to _workflows-view, filterWorkflows applied per useMemo per group"

key-files:
  created:
    - app/app/workflows/page.tsx
    - app/app/workflows/_workflows-view.tsx
    - components/workflows/recent-activity-strip.tsx
    - components/workflows/workflow-group.tsx
    - components/workflows/workflow-search.tsx
    - components/workflows/workflow-row.tsx
    - components/workflows/inline-editable-text.tsx
  modified: []

key-decisions:
  - "WorkflowRow name renders as a Link to /app/workflows/[id] (detail page) — inline name edit is a detail-only feature per D-01; list is read-only for name"
  - "context_workflow_id is explicitly NOT passed in any new-workflow path in this plan — WF-10 new-workflow navigates to /app/chat (blank thread); context_workflow_id is a detail-surface concern (WF-12 / plan 03-03)"
  - "Time-saved strip stat uses client-side incremental update: on new activity INSERT, looks up minutes from local TIME_SAVED constant (mirrors RSC constants) — avoids round-trip while keeping estimate honest"
  - "approvals-strip channel named differently from activity channel to avoid channel name collisions; subscribes to user-scoped filter"

requirements-completed: [WF-07, WF-08, WF-09, WF-10]

# Metrics
duration: ~25min
completed: 2026-05-22
---

# Phase 3 Plan 02: My Workflows Landing Surface Summary

**The My Workflows RSC route, client view shell, recent-activity strip with Realtime live counts, client-side search, WorkflowGroup sections, and WorkflowRow with L3-confirm level toggle and pause/resume — the default home surface is now live.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-22T18:30:00Z (approx)
- **Completed:** 2026-05-22T18:55:00Z (approx)
- **Tasks:** 2 (both auto)
- **Files created:** 7 (0 modified)

## Accomplishments

### Task 1: My Workflows RSC + grouped view + recent-activity strip

- **`app/app/workflows/page.tsx`** — RSC mirroring `settings/page.tsx`: `getOrCreateProfile` onboarding gate, `Promise.all` parallel fetch of: all user workflows, pending-approvals count, L3 last-12h count, 7-day per-action-type time-saved aggregate (D-15 heuristic with `TIME_SAVED_MINUTES` constants), recent-5 ticker entries. Calls `groupWorkflowsByStatus` (plan 01), builds `StripStats`, passes everything to `WorkflowsView`.
- **`app/app/workflows/_workflows-view.tsx`** — Client shell with SurfaceHeader (kicker = "My Workflows · N active", display title "Your workshop, today."), `RecentActivityStrip`, `WorkflowSearch`, `WorkflowGroup` per non-empty bucket (Scheduled / Triggered / Manual / Paused / Drafts), empty state with onboarding CTAs. "+ New Workflow" button navigates to `/app/chat` (blank thread, no `context_workflow_id`, WF-10).
- **`components/workflows/recent-activity-strip.tsx`** — Three-stat grid: "Decisions outstanding" (pending approvals count), "Ran while you slept" (L3 actions last 12h), "Time saved this week" (`estimated` label — D-15). "What just happened" ticker (last 5 entries). Realtime subscription to `activity:<userId>` (INSERT on `activity_entries`) and `approvals-strip:<userId>` (INSERT + UPDATE on `approvals`) using canonical `createBrowserClient + setAuth + cancelled-flag + removeChannel` pattern (T-3-02-02, T-3-02-03, RESEARCH Pitfall 2).
- **`components/workflows/workflow-group.tsx`** — Section header with count + `WorkflowRow` list in a card container; `muted` prop for Paused/Drafts groups.
- **`components/workflows/workflow-search.tsx`** — Search input with icon, clear button, onFocus border highlight. Filter state lifted to `_workflows-view.tsx` via `onQueryChange` (D-17 client-side fuzzy filter over name/description/trigger_type).

### Task 2: WorkflowRow + inline-editable-text

- **`components/workflows/workflow-row.tsx`** — Full WorkflowRow: StatusDot (active/paused/running colors with pulse animation), name `<Link>` to `/app/workflows/[id]` (D-01: inline edit is a detail-surface feature), trigger_type domain badge, description truncated. `LevelToggle` calls `editWorkflow(id, { automation_level })` with optimistic local state + isPending guard (WF-08); selecting L3 shows a `Dialog` confirmation ("Enable Autonomous (L3) mode?") before saving — only saves on confirm. Pause/resume `<button>` calls `togglePause` with optimistic status flip `active↔paused` (WF-09); row stays in list. Accessible disabled states (aria-label, opacity: 0.5, cursor: not-allowed per inline-approval-card pattern, T-3-02-01).
- **`components/workflows/inline-editable-text.tsx`** — Click-to-edit: span with role="button" → autoFocus input on click. `handleBlur`: saves only if changed via `onSave` (async); `handleKeyDown`: Enter → blur (triggers save), Escape → sets `cancelledRef.current = true` before blur fires (prevents double-save, RESEARCH Pitfall 3). No separate Save button. isPending guard + error display + revert on error.

## Task Commits

1. **Task 1** (feat): `e8de042` — My Workflows RSC + grouped view + recent-activity strip (Realtime)
2. **Task 2** (feat): `35d9885` — WorkflowRow with inline level toggle (L3 confirm), pause/resume, inline-edit primitive

## Files Created

- `app/app/workflows/page.tsx` — My Workflows RSC (145 lines)
- `app/app/workflows/_workflows-view.tsx` — Client view shell (307 lines)
- `components/workflows/recent-activity-strip.tsx` — Realtime strip + ticker (374 lines)
- `components/workflows/workflow-group.tsx` — Group section (84 lines)
- `components/workflows/workflow-search.tsx` — Client-side search (133 lines)
- `components/workflows/workflow-row.tsx` — WorkflowRow (443 lines)
- `components/workflows/inline-editable-text.tsx` — Click-to-edit primitive (172 lines)

## Decisions Made

- **WorkflowRow name is a Link (not inline-edit)**: D-01 specifies inline edit is for the Detail route; the list surface only links to `/app/workflows/[id]`. Avoids the complexity of inline edit in a grid row.
- **`context_workflow_id` explicitly omitted**: The "+ New Workflow" button in `_workflows-view.tsx` routes to `/app/chat` with no query parameters — a blank Conversation thread (WF-10). WF-12 ("Open in Chat" with workflow context) is a detail-surface feature for plan 03-03.
- **Time-saved Realtime update**: Client increments `timeSavedMins` on each new activity INSERT using a local `TIME_SAVED` constant (mirrors RSC `TIME_SAVED_MINUTES`) — keeps the strip live without a round-trip fetch.
- **Two Realtime channels per strip**: `activity:<userId>` for activity entries and `approvals-strip:<userId>` for approvals — distinct channel names to avoid collision; both use `setAuth` for proper RLS enforcement via migration 0005 policy.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the auto type; no architectural issues, blocking bugs, or missing dependencies encountered.

## Known Stubs

- **WorkflowRow "Next" column**: Shows "—" for all workflows. Actual next-run scheduling requires parsing `trigger_config` JSONB (a cron/schedule object). This is a display-only stub; the data is available in `workflows.trigger_config` and will be wired in plan 03-03 (Workflow Detail) where the schedule picker is implemented.
- **WorkflowRow "Last" column**: Shows `workflow.updated_at` as a stand-in. Actual last-run timestamp comes from `workflow_runs` (plan 03-03 fetches this for detail; the list view is a lower-priority enhancement).

Both stubs are display-only — they do not affect the core functionality (level toggle, pause/resume, strip stats, Realtime, search). No plan goal is blocked by these stubs.

## Threat Surface Scan

No new network endpoints or auth paths introduced. All mutations go through existing `editWorkflow` / `togglePause` Server Actions (ownership verified via `withUserRls`, T-3-02-01). Realtime subscription to `activity:<userId>` is protected by migration 0005 RLS policy (T-3-02-02). No new trust boundaries beyond what the plan's threat model covers.

## Self-Check: PASSED

Files verified present:
- `app/app/workflows/page.tsx` — FOUND
- `app/app/workflows/_workflows-view.tsx` — FOUND
- `components/workflows/recent-activity-strip.tsx` — FOUND
- `components/workflows/workflow-group.tsx` — FOUND
- `components/workflows/workflow-search.tsx` — FOUND
- `components/workflows/workflow-row.tsx` — FOUND
- `components/workflows/inline-editable-text.tsx` — FOUND

Commits verified in git history:
- `e8de042` (Task 1) — FOUND
- `35d9885` (Task 2) — FOUND

TypeScript check: `npx tsc --noEmit` — PASSED (0 errors)
Unit tests: `npx vitest run tests/unit/workflows/grouping.test.ts` — PASSED (8/8)

---
*Phase: 03-ownership-the-portfolio*
*Completed: 2026-05-22*
