---
phase: quick-260526-tl5
plan: "01"
subsystem: auth/demo
tags: [demo, shopify, integration, env-flag]
key-files:
  modified:
    - lib/auth/demo.ts
    - app/app/settings/actions.ts
    - app/api/integrations/shopify/connect/route.ts
    - components/layout/demo-banner.tsx
decisions:
  - "Default behavior (env unset) is UNLOCKED so the live portfolio demo can exercise the full connect/disconnect flow immediately"
  - "Freeze is a pure config + redeploy — no code change — via DEMO_SHOPIFY_LOCKED=true"
  - "Only disconnectIntegration and the connect route are conditioned on the flag; the five other demo guards (updateEmail, updatePassword, revokeSession, signOutEverywhere, requestAccountDeletion) remain always-blocking regardless of the flag"
metrics:
  completed: "2026-05-26"
  tasks: 1
  files_changed: 4
  commits: 1
---

# Quick Task 260526-tl5: Demo Shopify Connection Lock Flag (Unlocked) + Banner Copy

**One-liner:** Env-driven `isDemoConnectionLocked()` flag gates demo Shopify connect/disconnect; unset = unlocked now, `DEMO_SHOPIFY_LOCKED=true` + redeploy = frozen later; banner updated to reflect real store.

## What Was Done

Four edits across four files to add a config-only freeze mechanism for the demo account's Shopify connection:

| File | Change |
|------|--------|
| `lib/auth/demo.ts` | Added `isDemoConnectionLocked(): boolean` — returns `process.env.DEMO_SHOPIFY_LOCKED === "true"`, default UNLOCKED |
| `app/app/settings/actions.ts` | Updated import + changed `disconnectIntegration` demo guard from `isDemoUser(userId)` to `isDemoUser(userId) && isDemoConnectionLocked()` |
| `app/api/integrations/shopify/connect/route.ts` | Added import + inserted guard after `const userId` that redirects demo user to `/app/settings` only when flag is set |
| `components/layout/demo-banner.tsx` | Replaced copy with "Demo — a live portfolio demo of Operator Zero, connected to a real Shopify store." |

## Freeze Procedure (for future use)

To **freeze** the demo Shopify connection (prevent visitors from disconnecting or re-connecting):

1. In the Vercel project dashboard (or `vercel env add`), set:
   ```
   DEMO_SHOPIFY_LOCKED=true
   ```
2. For local development, add to `.env.local`:
   ```
   DEMO_SHOPIFY_LOCKED=true
   ```
3. Redeploy (Vercel will pick up the new env var automatically on next deploy, or trigger a manual redeploy).

No code change is required. To unfreeze, remove or unset the variable and redeploy.

## Verification

**TypeScript:** `npx tsc --noEmit` — passes (exit 0, no output).

**Other isDemoUser guards confirmed unchanged (5 always-blocking):**

| Line | Function | Form |
|------|----------|------|
| 635 | `updateEmail` | `isDemoUser(userId)` (always blocks) |
| 675 | `updatePassword` | `isDemoUser(userId)` (always blocks) |
| 802 | `revokeSession` | `isDemoUser(userId)` (always blocks) |
| 830 | `signOutEverywhere` | `isDemoUser(userId)` (always blocks) |
| 981 | `requestAccountDeletion` | `isDemoUser(userId)` (always blocks) |

**disconnectIntegration (line 189):** `isDemoUser(userId) && isDemoConnectionLocked()` — flag-gated.

## Commits

| Hash | Message |
|------|---------|
| c5d2d74 | feat(quick-260526-tl5-01): demo shopify connection lock flag (unlocked) + banner copy |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `lib/auth/demo.ts` — FOUND, `isDemoConnectionLocked` exported at line 66
- `app/app/settings/actions.ts` — FOUND, flag-gated guard at line 189, 5 unchanged guards at lines 635/675/802/830/981
- `app/api/integrations/shopify/connect/route.ts` — FOUND, guard inserted at line 44
- `components/layout/demo-banner.tsx` — FOUND, new copy at line 28
- Commit c5d2d74 — FOUND in git log
- `npx tsc --noEmit` — PASSED
