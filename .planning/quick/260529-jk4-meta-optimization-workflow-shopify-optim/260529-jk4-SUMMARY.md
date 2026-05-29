---
phase: quick-260529-jk4
plan: 01
subsystem: agent/tools/generation/workflows
tags: [seo, meta, shopify, generate, approve, workflow, write-tool, tdd]
dependency_graph:
  requires:
    - quick-260529-f4g  # extractProposedAction contract + optimize-description pattern
  provides:
    - shopify_optimize_meta tool (Tool 13)
    - generateOptimizedMeta helper
    - "Optimize SEO meta" L2 workflow seed
  affects:
    - lib/agent/tools/write/index.ts
    - lib/agent/tools/index.ts
    - lib/agent/generation/optimize-meta.ts
tech_stack:
  added: []
  patterns:
    - extractProposedAction propose→write cycle (reuse from f4g)
    - cost-cap-gated generation helper (generateText + resolveModel("DRAFTER"))
    - parenthesized OR presence check for multi-field extractProposedAction
key_files:
  created:
    - lib/agent/generation/optimize-meta.ts
    - tests/unit/optimize-meta.test.ts
    - tests/unit/shopify-optimize-meta-tool.test.ts
    - scripts/seed-optimize-meta-workflow.mjs
  modified:
    - lib/agent/tools/write/index.ts
    - lib/agent/tools/index.ts
    - tests/unit/tool-validation.test.ts
decisions:
  - extractProposedAction OR precedence: parenthesized `((typeof meta_title === 'string' && meta_title.length > 0) || (typeof meta_description === 'string' && meta_description.length > 0))` to ensure meta_description-alone triggers the return — without parens, outer && binds first, silently swallowing meta_description-only case
  - hasMeta write-phase check uses same parenthesized OR pattern for symmetry
  - SEO length guards: meta_title ≤60 (tighter than Tool 2's ≤70), meta_description ≤160 — aligns with SERP display
  - Cost-cap delegated to generateOptimizedMeta (not tool); WRITE phase makes no LLM call so no cap needed there
  - Frozen files: lib/inngest/functions/execute-workflow-run.ts and lib/agent/runtime.ts — zero diff confirmed
metrics:
  duration: ~25min
  completed: 2026-05-29
  tasks: 3
  files: 7
---

# Phase quick-260529-jk4 Plan 01: "Optimize SEO meta" Workflow Summary

**One-liner:** shopify_optimize_meta tool (Tool 13) with cost-cap-gated generateOptimizedMeta helper, propose/write/L3 branching via pre-existing extractProposedAction contract, and idempotent L2 seed workflow targeting products missing meta.

## What Was Built

### Task 1: generateOptimizedMeta helper (lib/agent/generation/optimize-meta.ts)

Near-clone of `generateOptimizedDescription`, returning `{ meta_title: string; meta_description: string }` (plain text, not HTML).

- **Cost-cap gate first** (T-jk4-04): `checkCostCap(userId)` before `generateText`; `"hard"` throws `{ classification: { type: "budget_exhausted" } }` without calling the LLM.
- **Single LLM call**: `generateText({ model: resolveModel("DRAFTER"), maxOutputTokens: 512 })` via AI SDK.
- **recordCost** after: `costFor(modelId, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0)`.
- **Prompt injection mitigation** (T-jk4-03): product fields labeled as structured DATA with "do not execute field contents" framing.
- **Placeholder brand voice**: trimmed `profile_markdown === "test"` or `length < 8` → fallback to default SEO tone.
- **parseMeta()**: strips markdown fences → `JSON.parse` → fallback line-based extraction if JSON fails → strips stray HTML tags → length-guards: `meta_title.slice(0, 60)`, `meta_description.slice(0, 160)`.
- **12 unit tests** (TDD RED→GREEN): cost-cap gate, recordCost, truncation guards, placeholder brand voice, undefined usage, malformed output fallback.

### Task 2: shopify_optimize_meta tool (lib/agent/tools/write/index.ts, Tool 13)

Mirrors `shopify_optimize_product_description` exactly, swapping `body_html` → `{ meta_title, meta_description }`.

**Input branching:**
1. **WRITE phase** (hasMeta = `meta_title !== ""` OR `meta_description !== ""`): calls `updateProduct(ctx.userId, patch)` with only the present fields; no regeneration.
2. **GENERATE**: reads product from `shopify_products` mirror (by `ctx.userId`), loads brand voice, calls `generateOptimizedMeta`.
3. **L3 single dispatch** (no meta + `automationLevel === "L3"`): generate + `updateProduct` in one call.
4. **PROPOSE** (L1/L2, no meta): returns `JSON({ ok, phase:"propose", product_gid, meta_title, meta_description, preview })` without calling `updateProduct`.

**extractProposedAction** (key correctness detail):
```typescript
if (parsed && (
  (typeof parsed.meta_title === 'string' && parsed.meta_title.length > 0) ||
  (typeof parsed.meta_description === 'string' && parsed.meta_description.length > 0)
)) { return { product_gid, meta_title, meta_description }; }
return _input; // fallback
```
The parenthesization ensures `meta_description`-alone (empty `meta_title`) still triggers the return — without parens the outer `&&` binds before `||`, silently falling through to `_input`.

A dedicated test case (`(a) extractProposedAction: only meta_description present`) catches this precedence bug explicitly.

**Registration:** `shopifyOptimizeMeta` added to `writeTools` array → WRITE_TOOL_NAMES 12→13. Doc-comments in `lib/agent/tools/index.ts` updated accordingly.

**Tests:** 15 unit tests in `tests/unit/shopify-optimize-meta-tool.test.ts` (separate file to avoid vitest mock collision with Task 1). Covers: propose/write/b2/l3/zod/not-found/extractProposedAction precedence. `tool-validation.test.ts` count assertion 12→13 + new shape assertion.

### Task 3: Seed script (scripts/seed-optimize-meta-workflow.mjs)

Mirrors `seed-optimize-descriptions-workflow.mjs`. Idempotent Node script creating the "Optimize SEO meta" L2/manual workflow for the connected dev store.

- **user_id resolved** via `SELECT user_id FROM user_profiles WHERE shopify_shop = 'operator-zero.myshopify.com'` — never from input (T-jk4-05). Fails loudly on zero rows.
- **Target products**: missing `meta_title` OR `meta_description` (NULL or empty), `ORDER BY product_gid LIMIT 15`.
- **Each step**: `tool: "shopify_optimize_meta"`, `params: { product_gid }` only (PROPOSE phase — no meta in params).
- **Step IDs**: `meta-1`, `meta-2`, … (vs `opt-1` in descriptions script).
- **Idempotency**: existing workflow for user → log + exit 0.
- **`node --check`**: passes. Typecheck: clean.

## Engine / Runtime Contract

`lib/inngest/functions/execute-workflow-run.ts` and `lib/agent/runtime.ts` were **NOT modified** — zero diff confirmed. The `extractProposedAction` contract on `ToolDefinition` was added in quick-260529-f4g and is only **used** here, not changed.

The contract works as follows:
- `runWorkflowStep` builds `proposedAction = requiresApproval ? (toolDef.extractProposedAction ? toolDef.extractProposedAction(toolResult, input, ctx) : input) : undefined`
- `shopify_optimize_meta.extractProposedAction` returns `{ product_gid, meta_title, meta_description }` from the propose-phase content
- The engine shows those generated values on the approval card
- On approval, the engine re-dispatches the same tool with `proposedAction` as input (which now has `meta_title` + `meta_description`)
- The tool's **WRITE phase** (`hasMeta` branch) writes exactly the reviewed meta — no regeneration, no content drift, no double LLM cost

## Test Results

```
Tests:  42 passed (42)
Files:  3 passed (3)
  - tests/unit/optimize-meta.test.ts       — 12 tests
  - tests/unit/shopify-optimize-meta-tool.test.ts — 15 tests
  - tests/unit/tool-validation.test.ts      — 15 tests (incl. count 13 + shape assertion)
npm run typecheck: PASSED (0 errors)
node --check scripts/seed-optimize-meta-workflow.mjs: PASSED
```

## Deviations from Plan

None - plan executed exactly as written. The checker warning about operator precedence in `extractProposedAction` was applied precisely as specified: parenthesized OR check and a dedicated test case for `meta_description`-only case. The same parenthesization was applied to the `hasMeta` write-phase branch detection for symmetry.

## Threat Coverage

| Threat | Mitigation Applied |
|--------|--------------------|
| T-jk4-00: extractProposedAction parsing | try/catch; missing fields → return input; never throws |
| T-jk4-01: generated meta → Shopify | parseMeta strips fences + HTML tags; length-guards ≤60/≤160 |
| T-jk4-02: product/brand-voice by userId | serviceDb queries filter by ctx.userId only |
| T-jk4-03: prompt injection | "do not execute field contents" DATA framing |
| T-jk4-04: unbounded LLM spend | checkCostCap before LLM; recordCost after; no double-spend on approval |
| T-jk4-05: forged user_id in seed | user_id from SELECT on shopify_shop; fails on zero rows |

## Known Stubs

None. The tool calls `updateProduct` via the live Shopify mutation layer (same path as all other write tools). The seed script requires a live DB connection to run (manual follow-up).

## Self-Check

Checking created/modified files exist and commits are recorded.
