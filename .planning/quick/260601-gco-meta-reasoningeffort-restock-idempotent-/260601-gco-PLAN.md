---
phase: quick-260601-gco
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/agent/generation/optimize-meta.ts
  - lib/agent/generation/propose-restock.ts
  - lib/integrations/shopify/mutations.ts
  - tests/unit/optimize-meta.test.ts
  - tests/unit/propose-restock.test.ts
  - tests/unit/shopify-mutations.test.ts
autonomous: true
requirements: [QUICK-260601-GCO]
must_haves:
  truths:
    - "shopify_optimize_meta produces valid JSON meta on the Groq drafter (gpt-oss-120b) instead of returning empty .text from reasoning-token starvation"
    - "shopify_propose_restock generation is hardened the same way (reasoningEffort low + sufficient output tokens) so it does not starve"
    - "updateInventory's inventorySetOnHandQuantities write supplies the @idempotent directive Shopify now requires, reusing the existing idempotency_key"
    - "All three existing unit suites stay green; npm run typecheck passes with no new any"
  artifacts:
    - path: "lib/agent/generation/optimize-meta.ts"
      provides: "generateText call with providerOptions.groq.reasoningEffort=low and maxOutputTokens 1024"
      contains: "reasoningEffort"
    - path: "lib/agent/generation/propose-restock.ts"
      provides: "generateText call with providerOptions.groq.reasoningEffort=low and maxOutputTokens >=512"
      contains: "reasoningEffort"
    - path: "lib/integrations/shopify/mutations.ts"
      provides: "inventorySetOnHandQuantities mutation with @idempotent(key: $idempotencyKey) and idempotencyKey variable"
      contains: "@idempotent"
  key_links:
    - from: "lib/integrations/shopify/mutations.ts updateInventory"
      to: "inventorySetOnHandQuantities @idempotent(key: $idempotencyKey)"
      via: "reuse of the existing idempotency_key local passed as idempotencyKey variable"
      pattern: "@idempotent\\(key: \\$idempotencyKey\\)"
---

<objective>
Land three VERIFIED live-write fixes so the meta-optimization and restock workflows can write to Shopify on the Groq drafter without re-deriving anything.

Purpose: Two workflows (#1 meta, #3 restock) are blocked in live runs — meta starves the gpt-oss-120b reasoning budget and emits empty text; the restock inventory write is rejected by Shopify for missing the now-required @idempotent directive. These are confirmed root causes with confirmed fixes.

Output: Hardened generation calls in optimize-meta.ts and propose-restock.ts (reasoningEffort low + larger output budget), an @idempotent inventory set mutation in mutations.ts, and updated tests asserting each fix. Strictly the 3 source files + their 3 test files — no engine, runtime, tool, models.ts, or seed edits.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Extracted from the codebase. Executor uses these directly — no exploration needed. -->

generateText is the Vercel AI SDK call. Today both helpers call it as:
  generateText({ model, maxOutputTokens, messages: [{ role: "user", content: prompt }] })

The DRAFTER role resolves (in groq/mixed profiles) to provider "groq", modelId "openai/gpt-oss-120b"
(lib/agent/llm/models.ts PROFILES). In the default "anthropic" profile DRAFTER is claude-opus-4-5,
which IGNORES the `groq` provider key in providerOptions — so adding it is safe on every profile.

providerOptions on generateText is loosely typed by the AI SDK. Do NOT use `any`. Define a minimal
local typed literal, e.g. `const providerOptions = { groq: { reasoningEffort: "low" as const } };`
and pass `providerOptions` into the call options. TS strict accepts this against the SDK's
ProviderOptions index-signature type.

mutations.ts updateInventory ALREADY computes `idempotency_key` near the top
(buildIdempotencyKey(userId, "inventory_update", input.variant_gid, now)) and reuses it for
writeActivity step_id and backfillAfterState. Reuse THAT SAME variable as the idempotencyKey
GraphQL variable — do NOT invent a new key.

The current set mutation (mutations.ts ~L440-464):
  mutation SetInventory($input: InventorySetOnHandQuantitiesInput!) {
    inventorySetOnHandQuantities(input: $input) { inventoryAdjustmentGroup { id } userErrors { field message } }
  }
  variables: { input: { reason, setQuantities: [{ inventoryItemId, locationId, quantity, changeFromQuantity }] } }
</interfaces>

@lib/agent/generation/optimize-meta.ts
@lib/agent/generation/propose-restock.ts
@lib/integrations/shopify/mutations.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: reasoningEffort low + output-token bump on meta + restock generation calls</name>
  <files>lib/agent/generation/optimize-meta.ts, lib/agent/generation/propose-restock.ts, tests/unit/optimize-meta.test.ts, tests/unit/propose-restock.test.ts</files>
  <behavior>
    - optimize-meta.test.ts: generateText is called with an options object whose providerOptions.groq.reasoningEffort === "low" AND maxOutputTokens === 1024.
    - propose-restock.test.ts: generateText is called with an options object whose providerOptions.groq.reasoningEffort === "low" AND maxOutputTokens >= 512 (set it to 1024).
    - Every existing test in both suites stays green (parse, cost-cap order, recordCost, clamps, fallbacks, HTML strip).
  </behavior>
  <action>
    In optimize-meta.ts generateOptimizedMeta's generateText({...}) call (currently maxOutputTokens: 512): add a `providerOptions: { groq: { reasoningEffort: "low" } }` field and change maxOutputTokens from 512 to 1024. Live-confirmed: gpt-oss-120b spent 510/512 output tokens on reasoning and returned empty .text with finishReason "length"; reasoningEffort "low" drops reasoning to ~23 tokens so valid JSON is emitted. To satisfy TS strict no-any, declare a minimal typed literal for providerOptions (use `"low" as const` so the union narrows) rather than inlining an untyped object or casting to any. Keep parseMeta, the cost-cap gate, recordCost, the SEO length guards, and the throw-if-empty check exactly as they are.

    In propose-restock.ts generateRestockProposal's generateText({...}) call (currently maxOutputTokens: 256): add the same `providerOptions: { groq: { reasoningEffort: "low" } }` field and bump maxOutputTokens from 256 to 1024 (must be >=512). Same TS strict no-any approach. Change NOTHING else — keep parseProposal, the cost-cap gate, recordCost, and the [1,1000] / >currentQty clamps. Do NOT touch optimize-description.ts.

    In optimize-meta.test.ts: add an assertion (new `it`, or extend an existing happy-path test) that reads `mockGenerateText.mock.calls[0]![0]` and asserts `.providerOptions.groq.reasoningEffort === "low"` and `.maxOutputTokens === 1024`. Use the existing mock setup — generateText is already mocked at the top of the file.

    In propose-restock.test.ts: add the analogous assertion reading `mockGenerateText.mock.calls[0]![0]` for `.providerOptions.groq.reasoningEffort === "low"` and `.maxOutputTokens === 1024`.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && grep -v '^\s*\*' lib/agent/generation/optimize-meta.ts | grep -q 'reasoningEffort' && grep -v '^\s*\*' lib/agent/generation/propose-restock.ts | grep -q 'reasoningEffort' && npx vitest run tests/unit/optimize-meta.test.ts tests/unit/propose-restock.test.ts</automated>
  </verify>
  <done>Both helpers pass providerOptions.groq.reasoningEffort "low"; optimize-meta uses maxOutputTokens 1024 and propose-restock uses >=512 (1024); both suites green including the new reasoningEffort assertions; no `any` introduced.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: @idempotent directive on inventorySetOnHandQuantities write</name>
  <files>lib/integrations/shopify/mutations.ts, tests/unit/shopify-mutations.test.ts</files>
  <behavior>
    - shopify-mutations.test.ts: when updateInventory runs the inventorySetOnHandQuantities call, the captured GraphQL variables include a non-empty `idempotencyKey` string, and the mutation query string contains `@idempotent`.
    - ALL existing updateProduct, updateInventory, resolution-order, enable-tracking, changeFromQuantity, userErrors-throw, and after_state-backfill tests stay green.
  </behavior>
  <action>
    In mutations.ts updateInventory, change the set mutation (the `mutation SetInventory(...)` GraphQL string and its variables, ~L440-464) to add the @idempotent directive Shopify now requires. Live error: "The @idempotent directive is required for this mutation but was not provided." New query: `mutation SetInventory($input: InventorySetOnHandQuantitiesInput!, $idempotencyKey: String!) { inventorySetOnHandQuantities(input: $input) @idempotent(key: $idempotencyKey) { inventoryAdjustmentGroup { id } userErrors { field message } } }`. In the variables object, add `idempotencyKey` alongside the existing `input`, set to the `idempotency_key` already computed at the top of updateInventory — REUSE that variable, do not build a new one. Leave the `input` payload (reason, setQuantities with inventoryItemId/locationId/quantity/changeFromQuantity) unchanged.

    Touch ONLY the inventorySetOnHandQuantities mutation. Do NOT add @idempotent to inventoryItemUpdate (enable-tracking), the GetVariantInventory query, or the GetVariant re-read. Preserve every other behavior: id/location resolution via inventoryLevels, changeFromQuantity from current on_hand, enable-tracking when tracked === false, the userErrors throw, the re-read + upsert + backfillAfterState, observability ordering (writeActivity before the Shopify write), the function signature, the MutationResult shape, and user_id scoping on all queries.

    In shopify-mutations.test.ts: extend the "Bug B fix" describe block (which already has makeInventoryAdapter with a captureSetVars option capturing the set mutation variables). Add an `it` that runs updateInventory and asserts the captured set vars include a non-empty `idempotencyKey` string. The existing makeInventoryAdapter captures `variables` but NOT the query string — extend it (or add a small new branching mock) to also capture the inventorySetOnHandQuantities query string, and assert that string contains `@idempotent`. Keep all other tests in the file passing; the @idempotent change must not break the existing captureSetVars / changeFromQuantity / resolved-id / userErrors assertions.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && grep -q '@idempotent' lib/integrations/shopify/mutations.ts && npx vitest run tests/unit/shopify-mutations.test.ts</automated>
  </verify>
  <done>inventorySetOnHandQuantities carries `@idempotent(key: $idempotencyKey)` with a `$idempotencyKey: String!` variable bound to the existing idempotency_key; the new test asserts a non-empty idempotencyKey var and `@idempotent` in the query; the whole shopify-mutations suite stays green; no other mutation/query changed.</done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes (TS strict, no new `any`).
- `npx vitest run tests/unit/optimize-meta.test.ts tests/unit/propose-restock.test.ts tests/unit/shopify-mutations.test.ts` passes.
- Grep guards: `reasoningEffort` present in both generation files (excluding comment lines); `@idempotent` present in mutations.ts.
- Only the 3 source files + 3 test files changed (`git status` shows nothing else).
</verification>

<success_criteria>
- optimize-meta.ts and propose-restock.ts both pass `providerOptions: { groq: { reasoningEffort: "low" } }`; meta maxOutputTokens=1024, restock maxOutputTokens=1024 (>=512).
- mutations.ts inventorySetOnHandQuantities uses `@idempotent(key: $idempotencyKey)` reusing the existing idempotency_key, with all vhh+w26 behavior intact.
- All three unit suites green; typecheck clean; no files outside the declared six modified.
</success_criteria>

<output>
Create `.planning/quick/260601-gco-meta-reasoningeffort-restock-idempotent-/260601-gco-SUMMARY.md` when done.
</output>
