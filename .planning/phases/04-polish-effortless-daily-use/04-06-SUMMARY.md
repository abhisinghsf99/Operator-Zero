---
phase: 04-polish-effortless-daily-use
plan: "06"
subsystem: mobile, accessibility, performance, e2e
tags: [mobile-parity, drill-down, wcag-2.1-aa, axe-core, keyboard, reduced-motion, performance, playwright, e2e]

# Dependency graph
requires:
  - phase: 04-02
    provides: Approvals surface (list/detail/inline-card) to make mobile + keyboard-accessible
  - phase: 04-03
    provides: Settings sections to collapse into mobile drill-down nav
  - phase: 04-04
    provides: Autonomy + Sessions settings sections
  - phase: 04-05
    provides: Danger Zone settings section
provides:
  - Mobile drill-down for Approvals (list <-> detail) and Settings (section nav <-> section) with no read-only stripping (UX-01, D-11)
  - WCAG 2.1 AA axe-core e2e across all 5 surfaces + login (UX-02)
  - Keyboard model e2e (A/R/E/S with textarea-typing guard, Tab traversal, row activation) (UX-03)
  - Performance pass — loading.tsx skeletons on all 5 surfaces + unstable_cache on Workflows (UX-04)
  - e2e specs: a11y, mobile, keyboard, perf (HAS_LIVE_STACK-guarded)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mobile drill-down via CSS visibility (hidden md:flex) — list and detail swap on <md; no separate route, no read-only stripping"
    - "SettingsShell client component: desktop = single scroll column, mobile = section nav + full-screen section with back affordance + focus return (D-11)"
    - "axe-core/playwright: new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze() — assertZeroViolations helper formats output"
    - "Keyboard shortcut scoping via [data-approval-detail] container; guard skips when focus is in input/textarea (Pitfall 5)"
    - "Next.js loading.tsx per route segment = instant streaming skeleton shell"
    - "unstable_cache with per-user key + tag, invalidated by revalidatePath on mutation"
    - 'Sync cache-tag helpers must live OUTSIDE "use server" modules (which may only export async fns)'

key-files:
  created:
    - app/app/approvals/layout.tsx
    - app/app/settings/_settings-shell.tsx
    - app/app/approvals/loading.tsx
    - app/app/workflows/loading.tsx
    - app/app/settings/loading.tsx
    - app/app/activity/loading.tsx
    - app/app/chat/loading.tsx
    - lib/cache-tags/workflows.ts
    - supabase/migrations/0007_workflow_versions_rls.sql
  modified:
    - app/app/approvals/_list.tsx
    - app/app/approvals/_detail.tsx
    - app/app/settings/page.tsx
    - app/app/workflows/page.tsx
    - lib/actions/workflows.ts
    - lib/db/schema/workflow-versions.ts
    - tests/e2e/a11y.spec.ts
    - tests/e2e/mobile.spec.ts
    - tests/e2e/keyboard.spec.ts
    - tests/e2e/perf.spec.ts

key-decisions:
  - "[04-06] Mobile parity via CSS swap (not separate routes): on <md the list panel is full-width when no detail is active and hidden when a detail opens; the detail is the inverse, with a mobile-only Back button that returns focus to the activating row (D-11). No functionality is stripped on mobile — approve/reject/snooze/edit/bulk all work at 375px."
  - "[04-06] SettingsShell renders all 8 sections in one scroll column on desktop; on mobile it shows a section nav list and pushes a full-screen section on tap with a Back affordance; focus returns to the nav item on back."
  - "[04-06 GATE FIX] Extracted sync workflowsCacheTag out of lib/actions/workflows.ts into lib/cache-tags/workflows.ts — a \"use server\" module may only export async functions, so the sync helper added in Task 3 broke the production build of /app/workflows (\"Server Actions must be async functions\"). Found during live gate verification; next build now compiles all 20 routes. (commit 6675011)"
  - "[04-06 GATE FIX] Added workflow_versions_user_policy (migration 0007). workflow_versions was the lone phase-2 table with RLS enabled on the live DB but no policy, so default-deny rejected every version insert — surfaced by onboarding's createStarterWorkflows during the gate. The table has no user_id column, so the policy checks ownership via the parent workflow (EXISTS against workflows under the authenticated role). This broke ALL version-creating paths (onboarding, edit, restore), not just onboarding. Chose to add the policy (RLS stays enforced per the multi-tenant constraint) over a service-role bypass. Mirrored in the Drizzle schema with .enableRLS(). Applied to live DB via supabase db push over the session pooler (5432). (commit 04a4a81)"
  - "[04-06] e2e specs are HAS_LIVE_STACK-guarded so they auto-skip headlessly; full mobile/a11y/keyboard/perf verification requires a running dev server + live Supabase + auth, performed as the human-verify gate."

# Metrics
duration: ~70min (impl) + live human-verify gate (2 gate-fixes)
completed: 2026-05-22
---

# Phase 4 Plan 06: Cross-Cutting Quality Pass Summary

**Mobile drill-down parity for Approvals + Settings with no read-only stripping, WCAG 2.1 AA axe-core + keyboard-model + reduced-motion e2e across all surfaces, and a performance pass (per-surface loading skeletons + cached Workflows list). Two bugs surfaced during the live daily-use gate and were fixed: a sync helper illegally exported from a "use server" module, and the missing workflow_versions RLS policy that was breaking every version-creating path.**

## What shipped

- **Task 1 — Mobile drill-down (UX-01, D-11):** `app/app/approvals/layout.tsx`, `_list.tsx`/`_detail.tsx` CSS visibility swap with mobile Back + focus return; `app/app/settings/_settings-shell.tsx` section-nav → full-screen-section pattern. All actions remain functional at 375px.
- **Task 2 — WCAG 2.1 AA + keyboard (UX-02, UX-03):** `tests/e2e/a11y.spec.ts` (axe WCAG 2.1 AA scans + specific criteria + reduced-motion), `tests/e2e/keyboard.spec.ts` (A/R/E/S model, Pitfall-5 textarea guard, Tab traversal, row activation).
- **Task 3 — Performance (UX-04):** `loading.tsx` skeletons for all 5 surfaces; `unstable_cache` on the Workflows list (per-user key + tag, revalidatePath invalidation); `tests/e2e/perf.spec.ts` measuring shell/nav/list targets.
- **Task 4 — Daily-use verification gate (human-verify):** Approved after fixing the two gate bugs below. Unit suite 336 passing, typecheck 0 errors, `next build` compiles all routes, onboarding creates starter workflows end-to-end.

## Gate fixes (found during live verification)

1. **Build break:** sync `workflowsCacheTag` exported from a `"use server"` file → moved to `lib/cache-tags/workflows.ts` (commit 6675011).
2. **RLS gap:** `workflow_versions` had RLS enabled but no policy → added `workflow_versions_user_policy` via migration 0007 (ownership via parent workflow), applied to the live DB; mirrored in Drizzle schema (commit 04a4a81).

## Self-Check: PASSED
