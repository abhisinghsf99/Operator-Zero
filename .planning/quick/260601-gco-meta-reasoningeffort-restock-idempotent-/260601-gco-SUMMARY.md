---
phase: quick-260601-gco
plan: "01"
subsystem: agent-generation, shopify-integration
tags: [groq, reasoningEffort, providerOptions, idempotency, shopify-graphql]
dependency_graph:
  requires: []
  provides: [groq-reasoning-hardened-generation, shopify-idempotent-inventory-write]
  affects: [lib/agent/generation/optimize-meta.ts, lib/agent/generation/propose-restock.ts, lib/integrations/shopify/mutations.ts]
tech_stack:
  added: []
  patterns: [providerOptions-groq-reasoningEffort, graphql-directive-idempotent]
key_files:
  created: []
  modified:
    - lib/agent/generation/optimize-meta.ts
    - lib/agent/generation/propose-restock.ts
    - lib/integrations/shopify/mutations.ts
    - tests/unit/optimize-meta.test.ts
    - tests/unit/propose-restock.test.ts
    - tests/unit/shopify-mutations.test.ts
decisions:
  - "Reuse existing idempotency_key var (not a new key) as the GraphQL idempotencyKey variable — avoids 15-min bucket drift between the activity write and the Shopify write"
  - "Use `low as const` typed literal for providerOptions instead of `any` — satisfies TS strict while narrowing the union"
metrics:
  duration: "~12 min"
  completed: "2026-06-01"
  tasks_completed: 2
  files_changed: 6
---

# Quick 260601-GCO: Meta reasoningEffort + restock idempotent write Summary

Hardened two generation calls (meta SEO, restock proposal) against Groq gpt-oss-120b reasoning-token starvation via `providerOptions.groq.reasoningEffort="low"` + raised output budgets, and added the `@idempotent(key: $idempotencyKey)` directive Shopify now requires on `inventorySetOnHandQuantities`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | reasoningEffort low + output-token bump on meta + restock | `6b00a01` | optimize-meta.ts, propose-restock.ts, 2 test files |
| 2 | @idempotent directive on inventorySetOnHandQuantities | `226beaa` | mutations.ts, shopify-mutations.test.ts |

## What Was Built

**Fix 1 — optimize-meta.ts:**
- Added `const providerOptions = { groq: { reasoningEffort: "low" as const } }` typed literal
- Raised `maxOutputTokens` from 512 → 1024
- Passed `providerOptions` into `generateText({...})` call
- New test `(provider-opts)` asserts `reasoningEffort === "low"` and `maxOutputTokens === 1024`

**Fix 2 — propose-restock.ts:**
- Same `providerOptions` pattern as optimize-meta.ts
- Raised `maxOutputTokens` from 256 → 1024
- New test `(provider-opts)` asserts same constraints

**Fix 3 — mutations.ts:**
- Changed `SetInventory` mutation signature to add `$idempotencyKey: String!` variable
- Added `@idempotent(key: $idempotencyKey)` on `inventorySetOnHandQuantities`
- Passed existing `idempotency_key` variable as `idempotencyKey` in GraphQL variables object
- Extended `makeInventoryAdapter` in test with optional `captureSetQuery` option
- New test `(@idempotent)` asserts non-empty `idempotencyKey` in captured vars and `@idempotent` in captured query string

## Verification Results

```
npm run typecheck: PASS (tsc --noEmit exits 0, no new any)
npx vitest run tests/unit/optimize-meta.test.ts tests/unit/propose-restock.test.ts tests/unit/shopify-mutations.test.ts:
  Test Files  6 passed (6)
  Tests  117 passed (117)
```

Grep guards:
- `reasoningEffort` present in optimize-meta.ts (non-comment): PASS
- `reasoningEffort` present in propose-restock.ts (non-comment): PASS
- `@idempotent` present in mutations.ts: PASS

## Deviations from Plan

**[Rule 3 - Blocking] Worktree path drift — two filesystem locations**

The project was renamed/moved from `/Users/abhisingh/my-os/dev/Operator-Zero/` to `/Users/abhisingh/my-os/dev/100x Capstone Project/Operator-Zero/`. The registered git worktree lives at the old path `/Users/abhisingh/my-os/dev/Operator-Zero/.claude/worktrees/agent-a5349d8f4bc32b66a/`. The vitest config at the main project root picks up an ADDITIONAL copy of the worktree at `.claude/worktrees/agent-a5349d8f4bc32b66a/` (the main project's `.claude/` subdir). Both sets of 6 files were edited identically: the registered worktree (for git commit) and the main project's worktree subdir (for vitest source resolution via `@/` alias and test file pickup).

## Known Stubs

None — no placeholder data, hardcoded empties, or "coming soon" text introduced.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. The `@idempotent` directive is a GraphQL mutation directive passed to the existing Shopify API endpoint.

## Self-Check: PASSED

- `lib/agent/generation/optimize-meta.ts` exists with `reasoningEffort` and `maxOutputTokens: 1024` — FOUND
- `lib/agent/generation/propose-restock.ts` exists with `reasoningEffort` and `maxOutputTokens: 1024` — FOUND
- `lib/integrations/shopify/mutations.ts` exists with `@idempotent(key: $idempotencyKey)` — FOUND
- Commit `6b00a01` exists — FOUND
- Commit `226beaa` exists — FOUND
- All 117 tests pass — CONFIRMED
- Typecheck clean — CONFIRMED
