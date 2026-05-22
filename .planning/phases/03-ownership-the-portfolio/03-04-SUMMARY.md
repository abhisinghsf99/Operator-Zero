---
phase: 03-ownership-the-portfolio
plan: 04
subsystem: frontend
tags: [activity-log, virtualization, cursor-pagination, revert, drift-rules, bulk-revert, before-after-diff, reasoning-chain, radix-tooltip, tanstack-virtual]

# Dependency graph
requires:
  - phase: 03-ownership-the-portfolio
    plan: 01
    provides: lib/workflows/revert.ts (canRevert, REVERT_REASON_LABELS), lib/actions/activity.ts (revertActivity, bulkRevertActivity, saveAsWorkflow)

provides:
  - "/app/activity route (RSC + client view) — virtualized day-grouped timeline with cursor infinite scroll + AND-combined filters + removable pills"
  - "app/app/activity/actions.ts — fetchActivityPage Server Action (cursor pagination keyed on occurred_at+id, LIMIT 50, AND-combined filters, shopify_updated_at join, re-filters by user_id)"
  - "components/activity/activity-log.tsx — @tanstack/react-virtual over flattened day-header+row array, overscan 10, infinite scroll"
  - "components/activity/activity-filters.tsx — quick chips + Filter popover (workflow, date presets Today/7d/30d/All + custom from-to, result); removable pills; 300ms debounce"
  - "components/activity/activity-detail.tsx — before/after diff + reasoning chain + revert control (canRevert show/disable) + Save as Workflow"
  - "components/activity/before-after-diff.tsx — renderFieldDiff() with FIELD_LABELS per target_type; email sent badge; page body truncation at 300 chars"
  - "components/activity/reasoning-chain.tsx — inline rendering + Supabase Storage blob fetch on expand"
  - "components/activity/revert-tooltip.tsx — @radix-ui/react-tooltip (first use); aria-describedby; aria-disabled for keyboard accessibility"
  - "components/activity/bulk-revert-modal.tsx — dryRun=true classification → user confirm → dryRun=false atomic execution; all-blocked shows Cancel only"

affects: [activity-log, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ACT-06, ACT-07, ACT-08]

# Tech tracking
tech-stack:
  added:
    - "@tanstack/react-virtual@^3.13.25 — Activity log row virtualization (ACT-07)"
    - "@radix-ui/react-tooltip@^1.2.8 — accessible disabled-revert tooltip (D-09, first Radix Tooltip use)"
  patterns:
    - "Flattened day-header+row array passed to useVirtualizer (estimateSize 36/52, overscan 10)"
    - "Cursor pagination keyed on (occurred_at DESC, id DESC) for stable infinite scroll"
    - "canRevert() UI parity — shopifyUpdatedAt joined server-side and passed to client; Server Action re-evaluates independently"
    - "dryRun=true / dryRun=false two-phase bulk revert (classify → confirm → execute)"
    - "aria-disabled button for accessible disabled state (not truly disabled — keyboard focusable, WCAG 2.1 AA 4.1.2)"

key-files:
  created:
    - app/app/activity/page.tsx
    - app/app/activity/_activity-view.tsx
    - app/app/activity/actions.ts
    - components/activity/activity-log.tsx
    - components/activity/activity-row.tsx
    - components/activity/activity-filters.tsx
    - components/activity/activity-detail.tsx
    - components/activity/before-after-diff.tsx
    - components/activity/reasoning-chain.tsx
    - components/activity/revert-tooltip.tsx
    - components/activity/bulk-revert-modal.tsx
  modified:
    - package.json (added @tanstack/react-virtual, @radix-ui/react-tooltip)

key-decisions:
  - "@tanstack/react-virtual: human pre-verified as official TanStack package before install (Task 1 checkpoint cleared by orchestrator)"
  - "@radix-ui/react-tooltip: auto-installed (Rule 3 — revert-tooltip.tsx imported it; same @radix-ui org as already-installed dialog; legitimate package)"
  - "aria-disabled button for disabled revert (not HTML disabled attribute) — keyboard users can still focus and read tooltip; satisfies WCAG 2.1 AA 4.1.2"
  - "dangerouslySetInnerHTML: 0 uses in before-after-diff.tsx — all field values rendered as plain text (React auto-escapes, T-3-04-04)"
  - "Flattened mixed array (header+row) passed to useVirtualizer for day grouping — no sticky DOM tricks needed"
  - "shopifyUpdatedAt joined in fetchActivityPage server-side for both RSC page 1 and cursor pages — client UI parity for canRevert drift check"

requirements-completed: [ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ACT-06, ACT-07, ACT-08]

# Metrics
duration: ~45min
completed: 2026-05-22
---

# Phase 3 Plan 04: Activity Log Surface Summary

**Activity log surface delivering trust-through-transparency: virtualized day-grouped timeline (ACT-07), AND-combining filters with removable pills (ACT-02), field-level before/after diff + reasoning chain (ACT-03), single revert with drift-rule-enforced disabled tooltip (ACT-04/D-09), atomic bulk revert with split confirm modal (ACT-05/D-08), and Save as Workflow (ACT-06/D-10).**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-05-22
- **Tasks:** 3 (1 checkpoint Task 1 pre-approved, 2 auto)
- **Files created:** 11 (routes + components)
- **Files modified:** 1 (package.json — 2 new deps)

## Accomplishments

- **`/app/activity` RSC route** — awaits searchParams (Next.js 15), onboarding gate, fetches page 1 with AND-combined filters (workflowId/result/automationLevel/dateFrom/dateTo), joins `shopify_updated_at` from `shopify_products` for product/page targets, fetches workflow name list for filter popover.
- **`fetchActivityPage` Server Action** — cursor-based pagination keyed on `(occurred_at DESC, id DESC)` (RESEARCH Pattern 5), LIMIT 50, re-filters by `user_id` regardless of client cursor (T-3-04-03), `shopify_updated_at` + workflow name join in same query.
- **`ActivityLog`** — `@tanstack/react-virtual` (useVirtualizer) over a flattened `{type: 'header', day} | {type: 'row', entry}` array; `estimateSize 36/52`, `overscan 10`; infinite scroll triggers `fetchActivityPage` when last virtual item is near end of list (ACT-07).
- **`ActivityRow`** — timeline node, timestamp, workflow name, summary, level badge (L3=workflow-accent), ResultIndicator; keyboard-accessible via role="button"; select-mode checkboxes with aria-checked (D-07).
- **`ActivityFiltersBar`** — quick level/result chips (instant URL update via `useTransition`) + Filter popover (workflow select, date-range presets Today/7d/30d/All + custom from-to inputs, result radio group); 300ms debounce for slow inputs (Pitfall 4); AND-combined active-filter removable pills (D-12/D-13).
- **`BeforeAfterDiff`** — `renderFieldDiff()` with `FIELD_LABELS` map per `target_type` (product/email/page, RESEARCH Pattern 6, D-14); email renders sent badge instead of full diff (Discretion 3); page/product `body_html` truncates at 300 chars with Show more; all values rendered as text (React auto-escapes, T-3-04-04, zero `dangerouslySetInnerHTML`).
- **`ReasoningChain`** — renders inline JSONB when `reasoning_chain` non-null; fetches Supabase Storage blob via `createBrowserClient` on expand when `reasoning_chain_url` present (Discretion 4); `isExpanded` + `isLoading` state.
- **`RevertTooltip`** — first `@radix-ui/react-tooltip` use: `Provider > Root > Trigger asChild > Portal > Content`; `aria-describedby` wired; `aria-disabled` button (not truly disabled — keyboard focusable + tooltip readable, WCAG 2.1 AA 4.1.2, D-09).
- **`ActivityDetail`** — `canRevert(entry, shopifyUpdatedAt)` for show/disable; `shopifyUpdatedAt` from `entry.shopifyUpdatedAt` (product/page targets); enabled revert → `revertActivity` + sonner toast + `isPending` guard; disabled → `RevertTooltip` with `REVERT_REASON_LABELS[reason]`; `saveAsWorkflow` → `router.push(threadId)` (ACT-06/D-10); imports from `lib/actions/activity` not route-local `actions.ts`.
- **`BulkRevertModal`** — Radix Dialog; `bulkRevertActivity(ids, dryRun:true)` on open for classification; shows revertable (green) + blocked (list of unique reasons) split; confirm calls `dryRun:false` (atomic all-or-none); all-blocked = Cancel only (D-08); imports from `lib/actions/activity`.

## Task Commits

1. **Task 1 (checkpoint pre-approved): install @tanstack/react-virtual** — `114033b`
2. **Task 2 (feat): Activity RSC + fetchActivityPage + ActivityLog + ActivityFiltersBar** — `7171893`
3. **Task 3 (feat): ActivityDetail + BeforeAfterDiff + ReasoningChain + RevertTooltip + BulkRevertModal** — `7fc0d29`

## Files Created

- `app/app/activity/page.tsx` — RSC: onboarding gate, await searchParams, page 1 fetch, shopify_updated_at join, workflow list for filter popover
- `app/app/activity/_activity-view.tsx` — client shell: SurfaceHeader, ActivityFiltersBar, ActivityLog, ActivityDetail, BulkRevertModal; selectMode + selectedIds state
- `app/app/activity/actions.ts` — fetchActivityPage Server Action (cursor pagination, AND filters, user_id re-filter, shopify_updated_at + workflow name join)
- `components/activity/activity-log.tsx` — useVirtualizer (flattened header+row array, estimateSize 36/52, overscan 10, infinite scroll)
- `components/activity/activity-row.tsx` — timeline row (timestamp, workflow, summary, level badge, ResultIndicator, select checkbox)
- `components/activity/activity-filters.tsx` — quick chips + Filter popover + removable pills + select-mode bulk bar
- `components/activity/activity-detail.tsx` — detail panel (diff + reasoning chain + canRevert revert button + RevertTooltip + Save as Workflow)
- `components/activity/before-after-diff.tsx` — renderFieldDiff + FIELD_LABELS per target_type; email badge; page truncation
- `components/activity/reasoning-chain.tsx` — inline JSONB or Supabase Storage blob on expand
- `components/activity/revert-tooltip.tsx` — Radix Tooltip + aria-describedby + aria-disabled (D-09)
- `components/activity/bulk-revert-modal.tsx` — dryRun=true classify → confirm → dryRun=false atomic execute; all-blocked = Cancel only

## Decisions Made

- `@radix-ui/react-tooltip` auto-installed (Rule 3 — same official Radix org, required for D-09 accessibility)
- `aria-disabled` (not `disabled`) on blocked revert button — keyboard users can focus it and trigger the tooltip
- Flattened array for day grouping: cleaner than CSS sticky tricks with virtualization
- `shopifyUpdatedAt` joined server-side in both RSC + fetchActivityPage — no extra client round-trip for drift check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @radix-ui/react-tooltip not installed**
- **Found during:** Task 3 (revert-tooltip.tsx implementation)
- **Issue:** PATTERNS.md noted the package was "already installed via @radix-ui/react-dialog" but `@radix-ui/react-tooltip` is a separate package not included as a transitive dependency of `@radix-ui/react-dialog`
- **Fix:** `npm install @radix-ui/react-tooltip@^1.2.8` — same official @radix-ui org, same legitimacy level as already-installed dialog primitive
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** `7171893` (staged with Task 2)

**2. [Rule 1 - Bug] TypeScript error in before-after-diff.tsx**
- **Found during:** Task 3 tsc check
- **Issue:** `FIELD_LABELS.email` typed as `Record<string, string>` not `Record<string, string> | undefined` — TS18048 'possibly undefined'
- **Fix:** Changed `FIELD_LABELS.email[key]` to `(FIELD_LABELS["email"] ?? {})[key]`
- **Files modified:** `components/activity/before-after-diff.tsx`
- **Commit:** `7fc0d29`

## Known Stubs

None — no placeholder data flows to UI rendering.

## Threat Flags

None — no new trust boundaries beyond what the plan's threat model covers (T-3-04-01 through T-3-04-SC).

## Self-Check: PASSED

**Files verified present:**
- FOUND: `app/app/activity/page.tsx`
- FOUND: `app/app/activity/_activity-view.tsx`
- FOUND: `app/app/activity/actions.ts`
- FOUND: `components/activity/activity-log.tsx`
- FOUND: `components/activity/activity-row.tsx`
- FOUND: `components/activity/activity-filters.tsx`
- FOUND: `components/activity/activity-detail.tsx`
- FOUND: `components/activity/before-after-diff.tsx`
- FOUND: `components/activity/reasoning-chain.tsx`
- FOUND: `components/activity/revert-tooltip.tsx`
- FOUND: `components/activity/bulk-revert-modal.tsx`

**Commits verified:**
- FOUND: `114033b` (chore: install @tanstack/react-virtual)
- FOUND: `7171893` (feat: Task 2 — RSC + pagination + log + filters)
- FOUND: `7fc0d29` (feat: Task 3 — detail + diff + revert + bulk modal)

**Tests:** tsc clean + 17 tests passing (14 revert unit + 3 activity smoke)

---
*Phase: 03-ownership-the-portfolio*
*Completed: 2026-05-22*
