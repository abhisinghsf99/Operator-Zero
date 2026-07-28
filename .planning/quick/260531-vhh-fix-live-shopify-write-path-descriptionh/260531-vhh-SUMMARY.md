---
phase: quick-260531-vhh
plan: "01"
subsystem: shopify-integration
tags: [bug-fix, shopify, mutations, inventory, product, graphql]
dependency_graph:
  requires: []
  provides: [correct-shopify-product-writes, correct-shopify-inventory-writes]
  affects: [lib/integrations/shopify/mutations.ts, shopify-write-path]
tech_stack:
  added: []
  patterns: [graphql-typed-responses, userErrors-fail-loud, pre-set-id-resolution]
key_files:
  modified:
    - lib/integrations/shopify/mutations.ts
    - tests/unit/shopify-mutations.test.ts
decisions:
  - "descriptionHtml is the correct Shopify ProductInput/Product field in ApiVersion.October24 (not bodyHtml); internal body_html column + ProductUpdateInput.body_html names preserved"
  - "Inventory ID resolution uses productVariant.inventoryItem.inventoryLevels(first:1).location.id — no read_locations scope required; no hardcoded location GID"
  - "Both tasks committed atomically in a single commit since they touch the same 2 files and both need to land together for the write path to be correct"
metrics:
  duration: "~18 minutes"
  completed: "2026-05-31"
  tasks_completed: 2
  files_modified: 2
---

# Quick 260531-vhh Plan 01: Fix Live Shopify Write Path (descriptionHtml + resolved inventory IDs) Summary

## One-liner

Fixed two confirmed live Shopify write bugs: `descriptionHtml` field rename in productUpdate mutation + re-read query, and `updateInventory` now resolves real `inventoryItemId`/`locationId` from `productVariant.inventoryItem.inventoryLevels` before setting on-hand quantity — both mutations now fail loud on `userErrors`.

## What Was Built

### Bug A — updateProduct (bodyHtml → descriptionHtml)

The GraphQL field `bodyHtml` does not exist on `ProductInput`/`Product` in `ApiVersion.October24`. Every product description and meta write was silently no-opping. Fixed:

- Mutation input: `bodyHtml: input.body_html` renamed to `descriptionHtml: input.body_html`
- Re-read result type: `bodyHtml?: string` renamed to `descriptionHtml?: string`
- Re-read query: `bodyHtml` renamed to `descriptionHtml`
- Mirror upsert (both `.values` and `onConflictDoUpdate.set`): `p.bodyHtml` renamed to `p.descriptionHtml`
- userErrors: typed `productUpdate` response; throw if `userErrors.length > 0`

### Bug B — updateInventory (resolved IDs, tracking-enable, fail-loud)

The set mutation was passing `inventoryItemId: input.variant_gid` (wrong — a variant GID, not inventory item GID) and `locationId: "gid://shopify/Location/1"` (hardcoded, wrong). Quantities never landed. Fixed:

1. GetVariantInventory resolution query added after `writeActivity`, before any mutation. Queries `productVariant(id).inventoryItem { id tracked inventoryLevels(first:1) { edges { node { location { id } } } } }`. Uses `inventoryItem.inventoryLevels...location.id` (no `read_locations` scope required).
2. Guard: throws `Error("could not resolve Shopify inventory item / location for variant ...")` if `inventoryItemId` or `locationId` is missing.
3. Tracking-enable: if `tracked === false`, calls `inventoryItemUpdate(id, input:{tracked:true})` before the set; throws on non-empty `userErrors`.
4. Set mutation: now uses resolved `inventoryItemId` + `locationId`; throws on non-empty `userErrors`.

### Preserved invariants

- `writeActivity` stays before all Shopify calls (observability-first ordering)
- `backfillAfterState` (quick-260528-sgu) still runs after successful re-read
- Idempotency key logic unchanged
- Public signatures `updateProduct(userId, ProductUpdateInput)` / `updateInventory(userId, InventoryUpdateInput)` unchanged
- `MutationResult` return shape unchanged
- Internal `body_html` column + `ProductUpdateInput.body_html` field names unchanged
- Multi-tenant `user_id` scoping unchanged

## Tests

23 tests passing (up from 14):

- 9 existing tests adapted: observability-order and after_state-backfill tests updated to use query-string-branching mocks for the multi-call `updateInventory` flow
- 4 new Bug A cases: `descriptionHtml` in mutation vars, `descriptionHtml` in re-read query, `body_html` mirror column from `descriptionHtml`, `userErrors` throw
- 5 new Bug B cases: resolved IDs in set vars, resolution-before-set ordering, `tracked:false` enable path, unresolvable variant throws, `userErrors` throw

## Verification Results

```
npx vitest run tests/unit/shopify-mutations.test.ts
  Test Files  1 passed (1)
       Tests  23 passed (23)
    Duration  458ms

npm run typecheck  (exit 0, no output)

grep -n bodyHtml lib/integrations/shopify/mutations.ts  → (nothing)
grep -n 'Location/1|inventoryItemId: input.variant_gid' lib/integrations/shopify/mutations.ts  → (nothing)
git status --porcelain  → only M mutations.ts, M shopify-mutations.test.ts
```

## Deviations from Plan

None — plan executed exactly as written. Both tasks committed atomically in a single commit (same 2 files, interdependent changes).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The changes narrow the attack surface by eliminating silent no-ops (T-vhh-02) and wrong-location inventory writes (T-vhh-01).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 + Task 2 | `8cb2052` | fix(260531-vhh): fix live Shopify write path — descriptionHtml + resolved inventory IDs |

## Self-Check: PASSED

- lib/integrations/shopify/mutations.ts: exists, modified
- tests/unit/shopify-mutations.test.ts: exists, modified
- Commit 8cb2052: verified in git log
- 23 tests passing, typecheck clean
- grep bodyHtml: nothing
- grep 'Location/1|inventoryItemId: input.variant_gid': nothing
