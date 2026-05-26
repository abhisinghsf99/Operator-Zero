---
phase: quick-260526-ii6
plan: "01"
subsystem: demo
tags: [demo, seed, reseed, server-action, route-handler, beacon]
dependency_graph:
  requires: [quick-260526-fmp]
  provides: [demo-reset-on-entry, demo-reset-beacon]
  affects: [app/(auth)/login/actions.ts, app/app/layout.tsx]
tech_stack:
  added: []
  patterns: [drizzle-transaction, service-db, server-only-module, navigator-sendbeacon]
key_files:
  created:
    - lib/demo/seed.ts
    - app/api/demo/reset/route.ts
    - components/layout/demo-reset-beacon.tsx
  modified:
    - app/(auth)/login/actions.ts
    - app/app/layout.tsx
decisions:
  - reasoning_summary in approvals is NOT NULL in schema — seed uses empty string "" when the /tmp source has null reasoning
  - Non-null assertions (!), not `any`, used to satisfy strict TS on wf/runs map lookups that are always-populated by construction
metrics:
  duration: "~15min"
  completed: "2026-05-26"
  tasks: 2
  files: 5
---

# Quick Task 260526-ii6: Demo Reset-on-Entry via reseedDemo SUMMARY

## One-Liner

Wipes and reseeds the shared demo user's full app data on every entry (and best-effort on tab close) via a server-only `reseedDemo()` that faithfully ports the 13-section `/tmp/oz_seed.mjs` seed onto Drizzle's `serviceDb`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Port the seed into server-only lib/demo/seed.ts | 6b142c4 | lib/demo/seed.ts (new, 560+ lines) |
| 2 | Wire reseed into enterDemo, reset route, and tab-close beacon | b58c896 | actions.ts, route.ts (new), demo-reset-beacon.tsx (new), layout.tsx |

## What Was Built

### lib/demo/seed.ts
Server-only module exporting `reseedDemo()`. Guards early return when `DEMO_USER_ID` is unset/empty — no DB access in that case. Runs one `serviceDb.transaction` covering all 13 data sections from the reference seed:

1. **Wipe** (FK-safe order): approvals → activityEntries → messages → threads → workflowRuns → workflows (null current_version_id first, then delete, cascades workflow_versions) → memoryItems → brandVoiceSamples → brandVoiceProfiles → autonomyThresholds → userSessions → integrations → shopifyProductVariants → shopifyProducts
2. **Profile** — upsert with onConflictDoUpdate (display_name "User", onboarding_step 5)
3. **Integrations** — Shopify + Gmail, status "active", TOK placeholder ciphertext
4. **Brand voice** — full Wanderbound markdown profile, tone_tags + forbidden_phrases arrays
5. **Autonomy thresholds** — default L2, 8-key per_action_overrides plain object (jsonb)
6. **Memory** — 6 items (preference × 2, brand, catalog, policy, decision_history)
7. **Sessions** — 3 rows with randomUUID() supabase_session_id
8. **Shopify products + variants** — 14 products starting at pidx 100000001, price as `(n/100).toFixed(2)` string for numeric column
9. **Workflows + versions** — 10 workflows; 2 receive a v2 version with `current_version_id` updated
10. **Workflow runs** — 10 runs, paused_for_approval runs get `current_step_id = "approve"`
11. **Approvals** — 6 pending approvals with preview/proposed_action as plain JS objects
12. **Activity entries** — 26 entries; before_state/after_state as plain objects
13. **Threads + messages** — 4 threads (A: SEO, B: flash sale, C: inbox triage, D: archived onboarding), 14 messages including `workflow_plan`, `preview`, and `approval_card` inline blocks. Thread B's approval_card `payload.approval_id` is wired to `appr["Set 20% weekend discount on Explorer Series (6 SKUs)"]`.

### app/api/demo/reset/route.ts
Route handler `POST /api/demo/reset`. Guards: only runs `reseedDemo()` when `isDemoUser(claims.sub)` is true. Always returns 204. Errors are logged, never thrown. `force-dynamic` to prevent caching.

### components/layout/demo-reset-beacon.tsx
`"use client"` component rendering `null`. `useEffect` registers:
- `pagehide` listener → fires `navigator.sendBeacon("/api/demo/reset")`
- `visibilitychange` listener → fires sendBeacon when `visibilityState === "hidden"`

Both listeners are cleaned up on unmount. Guards `typeof navigator.sendBeacon !== "function"`.

### Wired into existing files
- **app/(auth)/login/actions.ts**: `enterDemo()` calls `reseedDemo()` in a try/catch before `createClient()`. Errors are logged to console as structured JSON; never block the demo entry flow.
- **app/app/layout.tsx**: `DemoResetBeacon` rendered alongside `DemoBanner` under the existing `isDemo` condition. Non-demo users unaffected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] reasoning_summary NOT NULL constraint**
- **Found during:** Task 1 — tsc type check
- **Issue:** The `approvals.reasoning_summary` column is `.notNull()` in the schema. The /tmp seed passes `${reasoning}` which can be `null` for some approvals (the three with `null` reasoning in apprDefs). Drizzle's typed `.values()` would reject a `null` value here.
- **Fix:** Used `reasoning ?? ""` to pass an empty string instead of null, which is consistent with the schema contract and doesn't alter the visible data for the demo (the UI shows nothing for empty reasoning).
- **Files modified:** lib/demo/seed.ts
- **Commit:** 6b142c4

## Verification Results

- `npx tsc --noEmit`: clean (no output)
- `npx vitest run`: 351 passed, 3 skipped, 12 todo — all green
- Static checks:
  - `reseedDemo` exported from lib/demo/seed.ts: confirmed
  - `reseedDemo` imported in enterDemo (actions.ts): confirmed
  - `reseedDemo` imported in reset route: confirmed
  - `DemoResetBeacon` mounted in app/app/layout.tsx under isDemo: confirmed
  - `sendBeacon("/api/demo/reset")` in beacon component: confirmed
  - Reset route always returns 204: confirmed (last line before closing brace)
  - DEMO_USER_ID guard precedes transaction: confirmed (line 49)
  - `/tmp/oz_seed.mjs` not moved/committed/deleted: confirmed

## Known Stubs

None. All seeded data is fully wired — the 14 products, 10 workflows, 6 approvals, 26 activity entries, 4 threads, and 14 messages are inserted on every reseed.

## Threat Flags

None. All new surface is covered by the plan's threat model (T-ii6-01 through T-ii6-04).

## Self-Check: PASSED

- lib/demo/seed.ts: FOUND
- app/api/demo/reset/route.ts: FOUND
- components/layout/demo-reset-beacon.tsx: FOUND
- Commit 6b142c4: FOUND
- Commit b58c896: FOUND
