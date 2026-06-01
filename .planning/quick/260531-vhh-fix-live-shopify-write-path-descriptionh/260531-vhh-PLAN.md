---
phase: quick-260531-vhh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/integrations/shopify/mutations.ts
  - tests/unit/shopify-mutations.test.ts
autonomous: true
requirements: [INTEG-07]

must_haves:
  truths:
    - "updateProduct sends descriptionHtml (not bodyHtml) to Shopify and the re-read query asks for descriptionHtml; mirror body_html column is still populated from the re-read."
    - "updateInventory resolves the real inventoryItemId and locationId from the variant before setting on-hand quantity — never variant_gid, never the hardcoded gid://shopify/Location/1."
    - "updateInventory enables inventory tracking (inventoryItemUpdate tracked:true) for variants where inventoryItem.tracked === false before the set."
    - "Any non-empty userErrors from productUpdate, inventoryItemUpdate, or inventorySetOnHandQuantities throws a descriptive Error (no silent no-ops)."
    - "Observability-first writeActivity ordering and the backfillAfterState re-read are preserved; public signatures and MutationResult shape are unchanged."
  artifacts:
    - path: "lib/integrations/shopify/mutations.ts"
      provides: "Corrected updateProduct (descriptionHtml) + updateInventory (resolved IDs, tracking-enable, userErrors fail-loud)"
      contains: "descriptionHtml"
    - path: "tests/unit/shopify-mutations.test.ts"
      provides: "New cases for descriptionHtml field, resolved-ID set, tracked:false enable path, and userErrors throw — plus existing after_state/observability tests still green"
      contains: "descriptionHtml"
  key_links:
    - from: "lib/integrations/shopify/mutations.ts updateInventory"
      to: "productVariant.inventoryItem.inventoryLevels.edges[0].node.location.id"
      via: "GetVariantInventory resolution query before inventorySetOnHandQuantities"
      pattern: "inventoryLevels"
    - from: "lib/integrations/shopify/mutations.ts updateProduct"
      to: "Shopify ProductInput.descriptionHtml"
      via: "productUpdate mutation input + GetProduct re-read"
      pattern: "descriptionHtml"
---

<objective>
Fix two confirmed live-Shopify-write bugs in `lib/integrations/shopify/mutations.ts`:

- **Bug A (updateProduct):** the GraphQL field `bodyHtml` does not exist on `ProductInput`/`Product` in `ApiVersion.October24` — the correct field is `descriptionHtml`. This breaks every description and meta write because the re-read query also uses `bodyHtml`.
- **Bug B (updateInventory):** the set mutation passes `inventoryItemId: input.variant_gid` (a variant gid, not an inventory-item gid) and a hardcoded `locationId: "gid://shopify/Location/1"`. Both are wrong; quantities never land. The correct IDs must be resolved from the variant. The integration lacks `read_locations` scope, so the top-level `locations` query is forbidden — but `inventoryItem.inventoryLevels(...).location.id` is readable.

Both functions must also fail loud on non-empty `userErrors` so silent no-ops can't recur.

Purpose: live product-description, meta, and inventory writes actually persist to Shopify instead of silently no-opping.
Output: corrected `mutations.ts` + updated unit tests proving the fixes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@lib/integrations/shopify/mutations.ts
@tests/unit/shopify-mutations.test.ts

<interfaces>
<!-- Adapter contract the executor builds against. Do NOT change this file. -->

From lib/integrations/shopify/client.ts:
```typescript
// shopifyGraphQL returns the GraphQL `data` object (response.data), typed as T.
// Top-level GraphQL/transport errors already throw inside the adapter.
// userErrors live INSIDE data (e.g. data.productUpdate.userErrors) and must be
// checked by the caller — the adapter does NOT inspect them.
class ShopifyAdapter {
  constructor(userId: string);
  shopifyGraphQL<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
}
```

Mirror columns (UNCHANGED — internal names stay):
- `shopify_products.body_html` (Drizzle column — keep the name; only the Shopify field changes)
- `ProductUpdateInput.body_html` (internal input field — keep)

GROUNDED FACTS (verified live, do not re-derive):
- `ProductInput`/`Product` use `descriptionHtml`, never `bodyHtml`.
- Real inventoryItemId = `productVariant(id).inventoryItem.id`.
- Real locationId = `productVariant(id).inventoryItem.inventoryLevels(first:1).edges[0].node.location.id`.
- No `read_locations` scope → top-level `locations` query and `location.name`/`isActive` are access-denied; `inventoryItem.inventoryLevels...location.id` IS readable.
- Some variants have `inventoryItem.tracked === false`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix updateProduct (bodyHtml → descriptionHtml) + fail-loud userErrors</name>
  <files>lib/integrations/shopify/mutations.ts, tests/unit/shopify-mutations.test.ts</files>
  <behavior>
    - updateProduct's productUpdate mutation variables include `descriptionHtml: input.body_html` (NOT `bodyHtml`) when body_html is provided.
    - The GetProduct re-read query string contains `descriptionHtml` and does NOT contain `bodyHtml`.
    - The re-read TS result type field is `descriptionHtml?: string` and the mirror upsert maps `body_html: p.descriptionHtml ?? null` in both the insert `.values` and the `onConflictDoUpdate` `.set`.
    - When productUpdate returns a non-empty `userErrors` array, updateProduct throws a descriptive Error.
    - Existing tests (idempotency keys, writeActivity-before-write order, CR-01 workflow_run_id=null, before_state capture, after_state backfill) stay green.
  </behavior>
  <action>
In `updateProduct` (~L164-251), make ONLY these Shopify-field renames; keep the internal `body_html` input field and `shopify_products.body_html` column names unchanged:
- Mutation input (~L177): change `{ bodyHtml: input.body_html }` to `{ descriptionHtml: input.body_html }`.
- Type the productUpdate mutation response so userErrors is readable: type `shopifyGraphQL` with `<{ productUpdate: { userErrors: Array<{ field: string[] | null; message: string }> } }>`. After the call, if `data.productUpdate.userErrors.length > 0`, throw `new Error(...)` including the joined messages. Add `userErrors { field message }` to the selection set if missing (it is already present).
- Re-read result type (~L198): rename `bodyHtml?: string` to `descriptionHtml?: string`.
- Re-read query (~L210): change the selected field `bodyHtml` to `descriptionHtml`.
- Mirror insert `.values` (~L226) and `onConflictDoUpdate.set` (~L241): change `body_html: p.bodyHtml ?? null` to `body_html: p.descriptionHtml ?? null`.
Do NOT touch the writeActivity call (stays before the Shopify write), the backfillAfterState call, the idempotency key logic, the public signature, or the MutationResult return shape. No `any` — type the GraphQL responses.

In the test file, add a `describe` block for the description-write fix:
- Mock ShopifyAdapter.prototype.shopifyGraphQL with a spy that records the variables it receives for the `mutation` call and returns the same productVariant/product re-read shapes the existing tests use (re-read returns `{ product: { id, title, descriptionHtml: "<p>new</p>" } }`). Assert the productUpdate variables for an input with `body_html` contain `descriptionHtml` and do NOT contain a `bodyHtml` key.
- Assert (string check) that the query passed to the re-read call contains `descriptionHtml` and not `bodyHtml`.
- Assert the mirror insert `.values`/`onConflictDoUpdate` receives `body_html` populated from the re-read `descriptionHtml` (capture via an insert/values spy, like the existing after_state pattern).
- Add a case: when the mutation response is `{ productUpdate: { userErrors: [{ field: ["descriptionHtml"], message: "bad" }] } }`, expect `updateProduct(...)` to reject (throw).
Reuse the existing vi.doMock scaffolding (activity, client, db/client, shopify-mirror, schema) so the suite stays self-contained.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx vitest run tests/unit/shopify-mutations.test.ts && npm run typecheck</automated>
  </verify>
  <done>vitest passes (existing observability/after_state tests + new descriptionHtml + userErrors-throw cases); typecheck clean; `grep -n bodyHtml lib/integrations/shopify/mutations.ts` returns nothing.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fix updateInventory (resolve real IDs, enable tracking, fail-loud userErrors)</name>
  <files>lib/integrations/shopify/mutations.ts, tests/unit/shopify-mutations.test.ts</files>
  <behavior>
    - updateInventory runs a GetVariantInventory resolution query (productVariant → inventoryItem.id, tracked, inventoryLevels location.id) BEFORE the inventorySetOnHandQuantities mutation.
    - inventorySetOnHandQuantities is called with the RESOLVED inventoryItemId and the RESOLVED locationId — not `input.variant_gid`, not `"gid://shopify/Location/1"`.
    - When inventoryItem.id or the resolved location.id is missing, updateInventory throws a clear Error mentioning the variant gid (no fallback to the top-level locations query, no hardcoded location).
    - When `inventoryItem.tracked === false`, updateInventory calls inventoryItemUpdate(tracked:true) before the set; if that mutation returns non-empty userErrors it throws.
    - A non-empty userErrors array from inventorySetOnHandQuantities throws a descriptive Error.
    - writeActivity stays before any Shopify call; the existing re-read (inventoryQuantity/price/sku/product) + backfillAfterState + mirror upsert + MutationResult shape are unchanged.
  </behavior>
  <action>
In `updateInventory` (~L329-353), insert ID resolution and tracking-enable BEFORE the set mutation. The writeActivity call (~L317) must remain before all of this — it is the observability baseline.
1. Resolution query (after writeActivity, before any mutation): call `shopifyGraphQL<{ productVariant: { inventoryItem: { id: string; tracked: boolean; inventoryLevels: { edges: Array<{ node: { location: { id: string } } }> } } | null } | null }>` with `query GetVariantInventory($id: ID!) { productVariant(id: $id) { inventoryItem { id tracked inventoryLevels(first: 1) { edges { node { location { id } } } } } } }`, variables `{ id: input.variant_gid }`.
   - `const inventoryItemId = data.productVariant?.inventoryItem?.id;`
   - `const locationId = data.productVariant?.inventoryItem?.inventoryLevels?.edges?.[0]?.node.location.id;`
   - `const tracked = data.productVariant?.inventoryItem?.tracked;`
   - If `!inventoryItemId || !locationId`, throw `new Error("could not resolve Shopify inventory item / location for variant " + input.variant_gid)`. Do NOT query top-level `locations` and do NOT use a hardcoded location.
2. If `tracked === false`: call `shopifyGraphQL<{ inventoryItemUpdate: { userErrors: Array<{ field: string[] | null; message: string }> } }>` with `mutation EnableTracking($id: ID!) { inventoryItemUpdate(id: $id, input: { tracked: true }) { inventoryItem { id tracked } userErrors { field message } } }`, variables `{ id: inventoryItemId }`. If `data.inventoryItemUpdate.userErrors.length > 0`, throw with the joined messages.
3. Set mutation: type the response `<{ inventorySetOnHandQuantities: { userErrors: Array<{ field: string[] | null; message: string }> } }>`. Replace the input so `setQuantities[0]` is `{ inventoryItemId, locationId, quantity: input.inventory_qty }` (resolved values — remove `inventoryItemId: input.variant_gid` and `locationId: "gid://shopify/Location/1"`; keep `reason: "correction"`). After the call, if `data.inventorySetOnHandQuantities.userErrors.length > 0`, throw with the joined messages. Ensure `userErrors { field message }` is in the selection set (it is).
4. Leave the existing GetVariant re-read (inventoryQuantity/price/sku/product{id}), the mirror upsert, backfillAfterState, idempotency key, public signature, and MutationResult shape exactly as-is. No `any`.

In the test file, add a `describe` block for the inventory-resolution fix. Because shopifyGraphQL is now called 4x for the happy path (resolution, [optional enable], set, re-read), update the inventory mocks to branch on the query string:
- query contains `GetVariantInventory` → return resolution shape `{ productVariant: { inventoryItem: { id: "gid://shopify/InventoryItem/55", tracked: true, inventoryLevels: { edges: [{ node: { location: { id: "gid://shopify/Location/112" } } }] } } } }`.
- query contains `inventorySetOnHandQuantities` → record the variables, return `{ inventorySetOnHandQuantities: { userErrors: [] } }`.
- query contains `inventoryItemUpdate` → record it was called, return `{ inventoryItemUpdate: { userErrors: [] } }`.
- otherwise (GetVariant re-read) → return the existing `{ productVariant: { id, inventoryQuantity, price, sku, product:{id} } }` shape.
Cases:
- Set called with resolved IDs: assert the inventorySetOnHandQuantities variables' `setQuantities[0].inventoryItemId === "gid://shopify/InventoryItem/55"` and `.locationId === "gid://shopify/Location/112"`, and NOT equal to `input.variant_gid` or `"gid://shopify/Location/1"`.
- Resolution runs first: assert the query-string call order has `GetVariantInventory` recorded before `inventorySetOnHandQuantities`.
- tracked:false path: with resolution returning `tracked: false`, assert an `inventoryItemUpdate` call happened before the set.
- Unresolvable: with resolution returning `{ productVariant: null }` (or inventoryItem null), expect `updateInventory(...)` to reject.
- userErrors throw: with the set returning `{ inventorySetOnHandQuantities: { userErrors: [{ field: null, message: "nope" }] } }`, expect reject.
Keep the existing updateInventory observability-order and after_state-backfill tests green — update their inventory mock to the query-string-branching form above so the new resolution call doesn't break them.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx vitest run tests/unit/shopify-mutations.test.ts && npm run typecheck</automated>
  </verify>
  <done>vitest passes (existing tests adapted to query-branching mocks + new resolution/tracking/userErrors cases all green); typecheck clean; `grep -n 'Location/1\|inventoryItemId: input.variant_gid' lib/integrations/shopify/mutations.ts` returns nothing.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| mutations.ts → Shopify Admin GraphQL | external write; retries are inevitable, double-writes unacceptable |
| serviceDb writes | bypass RLS — must stay user_id-scoped |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vhh-01 | Tampering | inventorySetOnHandQuantities with wrong locationId | mitigate | resolve real inventoryItemId + locationId from the variant; throw if unresolvable — never hardcode Location/1 |
| T-vhh-02 | Repudiation | silent Shopify no-op (userErrors ignored) | mitigate | read userErrors on productUpdate, inventoryItemUpdate, inventorySetOnHandQuantities; throw descriptive Error if non-empty |
| T-vhh-03 | Information disclosure | cross-tenant mirror write | accept | preserved existing user_id scoping + backfillAfterState user_id WHERE clause (no change in this plan) |
| T-vhh-SC | Tampering | npm/pip/cargo installs | mitigate | none — no new dependencies added |
</threat_model>

<verification>
- `npm run typecheck` passes (no `any`; GraphQL responses typed).
- `npx vitest run tests/unit/shopify-mutations.test.ts` passes — existing idempotency, observability-order (writeActivity before write), CR-01, before_state, and after_state-backfill tests stay green, plus all new cases.
- `grep -n bodyHtml lib/integrations/shopify/mutations.ts` returns nothing.
- `grep -n 'Location/1\|inventoryItemId: input.variant_gid' lib/integrations/shopify/mutations.ts` returns nothing.
- No files outside `lib/integrations/shopify/mutations.ts` and `tests/unit/shopify-mutations.test.ts` modified (`git status --porcelain` shows only these two).
</verification>

<success_criteria>
- updateProduct sends `descriptionHtml` to Shopify; re-read query uses `descriptionHtml`; mirror `body_html` column still populated.
- updateInventory resolves real inventoryItemId + locationId from the variant, enables tracking when needed, and sets on-hand quantity with the resolved IDs.
- All three mutations throw on non-empty userErrors.
- Observability-first writeActivity ordering, backfillAfterState, idempotency, public signatures, and MutationResult shape all preserved.
</success_criteria>

<output>
Create `.planning/quick/260531-vhh-fix-live-shopify-write-path-descriptionh/260531-vhh-SUMMARY.md` when done.
</output>
