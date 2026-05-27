---
quick_id: 260526-v0o
slug: stamp-integration-last-synced
date: 2026-05-26
status: complete
tags: [shopify, sync, integrations, health-badge]
key_files:
  modified:
    - lib/integrations/shopify/sync.ts
commits:
  - hash: 16bbed1
    message: "feat(quick-260526-v0o-01): stamp integrations.last_synced_at on shopify full sync (fixes stale connection badge)"
---

# Quick Task 260526-v0o — Stamp integrations.last_synced_at on Shopify full sync

**One-liner:** Added a single `serviceDb.update(integrations)` call at the end of `shopifyFullSyncForUser` to stamp `last_synced_at` and clear `last_error`, fixing the stale connection badge in Settings → Connections.

## What Was Done

In `lib/integrations/shopify/sync.ts`, at the end of `shopifyFullSyncForUser()` — right after the `shopifySyncState` upsert (the block that sets `last_full_sync_at` / `sync_status: "healthy"`) and before the final `full_sync_complete` console.log — added:

```ts
// Stamp the integration row so health (getIntegrationHealth) reads a fresh sync time.
await serviceDb
  .update(integrations)
  .set({ last_synced_at: now, last_error: null })
  .where(and(eq(integrations.user_id, userId), eq(integrations.provider, "shopify")));
```

All required identifiers (`serviceDb`, `integrations`, `eq`, `and`, `now`) were already imported/in-scope — no new imports needed.

## Verification

- `npx tsc --noEmit` — passed with zero errors/warnings.

## Deviations

None — plan executed exactly as written.

## Self-Check

- [x] `lib/integrations/shopify/sync.ts` modified — confirmed (6 insertions)
- [x] Commit `16bbed1` exists — confirmed
- [x] No product/order/page/redirect loops or `shopify_sync_state` update touched

## Self-Check: PASSED
