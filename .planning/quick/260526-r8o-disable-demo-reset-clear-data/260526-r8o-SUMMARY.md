---
phase: quick-260526-r8o
plan: 01
subsystem: demo
tags: [demo, auto-reset, cleanup, db-clear]
dependency_graph:
  requires: []
  provides: [persistent-demo-account]
  affects: [app/(auth)/login/actions.ts, app/app/layout.tsx]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - app/(auth)/login/actions.ts
    - app/app/layout.tsx
  deleted:
    - app/api/demo/reset/route.ts
    - components/layout/demo-reset-beacon.tsx
decisions:
  - Demo account is now a persistent real environment — no auto-reset on entry or tab close
  - reseedDemo() stays defined in lib/demo/seed.ts (available for future use) but has zero call sites
metrics:
  duration: ~8 minutes
  completed_date: 2026-05-26
---

# Quick Task 260526-r8o: Disable Demo Auto-Reset + Clear Demo Data

**One-liner:** Removed demo reseed-on-entry + tab-close beacon, then cleared all seeded Wanderbound rows from live DB so a real Shopify dev store can stay connected permanently.

## Tasks Completed

### Task 1 — Disable demo auto-reset (committed code change)

Commit: `8387197` — `feat(quick-260526-r8o-01): turn off demo auto-reset (keep demo sign-in + guards)`

Four changes made:

1. **`app/(auth)/login/actions.ts`** — Removed `import { reseedDemo } from "@/lib/demo/seed"` (line 32) and the `try { await reseedDemo(); } catch` block from `enterDemo()`. `getDemoCredentials` guard, `signInWithPassword`, session-registry block, and `redirect("/app/workflows")` all preserved.

2. **`app/api/demo/reset/route.ts`** — Deleted via `git rm`. The tab-close beacon endpoint is gone. The `app/api/demo/` directory was automatically removed (empty after delete).

3. **`components/layout/demo-reset-beacon.tsx`** — Deleted via `git rm`. The client component that fired `navigator.sendBeacon` on pagehide/visibilitychange is gone.

4. **`app/app/layout.tsx`** — Removed `import { DemoResetBeacon }` and the `<DemoResetBeacon />` element. The `{isDemo && <DemoBanner />}` pattern is preserved; the surrounding fragment collapsed to a single element. `DemoBanner`, `isDemoUser`, and all destructive-action guards in `app/app/settings/actions.ts` are untouched.

`lib/demo/seed.ts` is NOT modified — `reseedDemo()` remains defined with zero call sites.

**Verification results:**

- `npx tsc --noEmit`: clean (0 errors; `.next` cache cleared first — stale validator.ts reference was a build-cache artifact, not a source error)
- `grep -rn "DemoResetBeacon|reseedDemo" app/ components/ lib/ --include="*.ts" --include="*.tsx" | grep -v "lib/demo/seed.ts"`: **zero matches**

### Task 2 — Clear demo account data in live DB (data-only, NO commit)

**No commit was made for Task 2. This task produced zero repo changes.**

A throwaway script `/tmp/oz_clear_demo.mjs` was written, run against the live DB using `node --env-file=.env.local`, and deleted from `/tmp` afterward. No file was committed or left in the repo.

**Wipe order executed (child → parent, all filtered by DEMO_USER_ID):**

| Step | Table | Rows deleted |
|------|-------|-------------|
| 1 | approvals | 6 |
| 2 | activity_entries | 26 |
| 3 | messages | 14 |
| 4 | threads | 4 |
| 5 | workflow_runs | 10 |
| 6 | workflows.current_version_id = NULL | 10 |
| 7 | workflows (cascades workflow_versions) | 10 |
| 8 | memory_items | 6 |
| 9 | brand_voice_samples | 0 |
| 10 | brand_voice_profiles | 1 |
| 11 | autonomy_thresholds | 1 |
| 12 | user_sessions | 3 |
| 13 | integrations | 2 |
| 14 | shopify_product_variants | 14 |
| 15 | shopify_products | 14 |
| 16 | gmail_messages | 23 |
| 17 | gmail_threads | 23 |
| 18 | gmail_sync_state | 0 (table empty) |
| — | user_profiles: shopify_shop = NULL | 1 row updated |

**Post-clear verification — demo user (274e81f5-...) — all 0:**

```
OK  approvals: 0
OK  activity_entries: 0
OK  messages: 0
OK  threads: 0
OK  workflow_runs: 0
OK  workflows: 0
OK  memory_items: 0
OK  brand_voice_samples: 0
OK  brand_voice_profiles: 0
OK  autonomy_thresholds: 0
OK  user_sessions: 0
OK  integrations: 0
OK  shopify_product_variants: 0
OK  shopify_products: 0
OK  gmail_messages: 0
OK  gmail_threads: 0
OK  gmail_sync_state: 0
OK  user_profiles: 1 row(s), shopify_shop = NULL
```

**Other accounts untouched (integrations):**

```
gmail integration user  (43f6ce70-e5f9-4440-8279-43b1f1c0218b): 1 row(s)  — UNTOUCHED
shopify integration user (c0c77de9-6165-416f-8ab4-efdbbd7287b8): 1 row(s)  — UNTOUCHED
```

## Deviations from Plan

None — plan executed exactly as written. The `.next` build cache contained a stale type-validator reference to the deleted route; clearing it (Rule 3 auto-fix, non-repo) allowed `tsc --noEmit` to pass cleanly.

## Known Stubs

None.

## Self-Check: PASSED

- `app/(auth)/login/actions.ts` — verified modified (no reseedDemo import/call)
- `app/app/layout.tsx` — verified modified (no DemoResetBeacon import/mount)
- `app/api/demo/reset/route.ts` — verified deleted
- `components/layout/demo-reset-beacon.tsx` — verified deleted
- Commit `8387197` — exists in git log
- Task 2 — no commit (data-only, as required); `/tmp/oz_clear_demo.mjs` deleted after run
