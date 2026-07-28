---
phase: quick-260529-jxq
verified: 2026-05-29T14:41:30Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the 'Low-stock restock proposals' workflow end-to-end in the app"
    expected: "Each approval card shows a proposed restock QUANTITY + RATIONALE (not just variant_gid); approving writes exactly that quantity to Shopify via updateInventory with no regeneration; Activity log shows populated before/after on inventory_qty"
    why_human: "Full L2 approval-card render + Shopify write + Activity log population cannot be verified without running the app against the live Shopify dev store"
  - test: "Run DATABASE_URL=<6543 pooler> node scripts/seed-restock-workflow.mjs against the dev store"
    expected: "Resolves user_id via user_profiles.shopify_shop='operator-zero.myshopify.com', prints user_id + workflow_id + N steps (inventory_qty <= 5 variants, expect ~6 OOS + any <=5), re-running is a no-op"
    why_human: "Idempotency, tenant-scoping, and row counts require a live DB connection; script cannot be exercised in CI"
---

# Quick Task 260529-jxq Verification Report

**Task Goal:** Build the "Low-stock restock proposals" workflow (#3), restock-to-target — scan low-stock/OOS variants, reason a target inventory quantity + rationale (LLM), and on approval write via updateInventory. Reuses the existing extractProposedAction contract; engine + runWorkflowStep FROZEN.
**Verified:** 2026-05-29T14:41:30Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `lib/agent/generation/propose-restock.ts` exists; gates on `checkCostCap` before the LLM; uses `generateText`/`resolveModel` (no raw Anthropic); returns `{target_qty, rationale}`; clamps `target_qty` to a positive integer (>current, ≤1000) | VERIFIED | File reads: cost-cap gate at line 179-185, `generateText` via AI SDK at line 192, `resolveModel("DRAFTER")` at line 191, `parseProposal` guard at lines 141-145. Test (b) confirms hard cap blocks LLM; tests (d)(e) confirm clamp and >current guard. All 15 propose-restock.test.ts cases pass. |
| 2 | `shopify_propose_restock` in `lib/agent/tools/write/index.ts`: propose phase reads variant (user_id-scoped) + generates + returns proposedAction `{variant_gid, inventory_qty}` WITHOUT calling `updateInventory`; `extractProposedAction` parses content→`{variant_gid, inventory_qty}` guarded by `typeof === 'number'` with input fallback; write phase (inventory_qty is a number) calls `updateInventory` and does NOT regenerate; registered → WRITE_TOOL_NAMES=14 | VERIFIED | Tool at lines 901-1058. Registration in `writeTools` array at line 1076. `WRITE_TOOL_NAMES` derived via `writeTools.map` in `lib/agent/tools/index.ts` (doc comment: "14 write tool names"). Tool-level tests (a) and (b) pass: propose does not call `updateInventory`; write calls it exactly once without generating. tool-validation.test.ts asserts `WRITE_TOOL_NAMES.length === 14`. |
| 3 | CRITICAL: the WRITE-vs-PROPOSE branch and `extractProposedAction` key on `typeof inventory_qty === 'number'` (not truthiness); a test asserts `inventory_qty:0` routes to `updateInventory` without regenerating | VERIFIED | Branch at line 925: `if (typeof inventory_qty === "number")`. `extractProposedAction` guard at line 1047: `typeof parsed.inventory_qty === "number"`. Test (b2) passes: `inventory_qty: 0` routes to WRITE, `generateRestockProposal` not called. Tests (e) confirm string `"50"` degrades to input fallback. |
| 4 | `scripts/seed-restock-workflow.mjs` resolves user via `SELECT user_id FROM user_profiles WHERE shopify_shop='operator-zero.myshopify.com'`, targets variants `inventory_qty<=5`, user_id-scoped, idempotent, fails loud on zero rows | VERIFIED | SQL at lines 59-64. Zero-row guard at lines 66-74 with `process.exit(1)`. Idempotency check at lines 80-94 exits 0 if workflow exists. Variant query at lines 100-108 with `inventory_qty <= 5`. Steps carry `params: { variant_gid: row.variant_gid }` only (line 129). `node --check` passes. |
| 5 | `lib/inngest/functions/execute-workflow-run.ts` AND `lib/agent/runtime.ts` are UNCHANGED (git diff against pre-task base — empty) | VERIFIED | `git diff HEAD~3 -- lib/inngest/functions/execute-workflow-run.ts lib/agent/runtime.ts` produced 0 bytes of diff. The three task commits touch only: `lib/agent/generation/propose-restock.ts`, `lib/agent/tools/write/index.ts`, `lib/agent/tools/index.ts` (doc-comment counts only), and `scripts/seed-restock-workflow.mjs` + test files. |
| 6 | Tests exist for: propose-returns-proposedAction-without-write, write-phase-no-regeneration, `inventory_qty:0` routes to write, cost-cap-before-LLM (helper), zod validation, `extractProposedAction` parse/type fallback, target clamp | VERIFIED | All 47 tests across 3 files pass (vitest run 14:41:09, 446ms). Tests named (a)-(i) in propose-restock.test.ts cover all helper behaviors; tests (a)-(f) + (b2) in shopify-propose-restock-tool.test.ts cover all tool branches; tool-validation.test.ts asserts count=14 and tool shape. |
| 7 | No debt markers (TBD/FIXME/XXX) in modified files | VERIFIED | `grep -n "TBD\|FIXME\|XXX"` across all 6 modified files returned NONE. |
| 8 | Key link: `lib/agent/tools/write/index.ts` → `lib/agent/generation/propose-restock.ts` via dynamic import of `generateRestockProposal` in the propose/L3 path | VERIFIED | Dynamic import at line 975: `const { generateRestockProposal } = await import("@/lib/agent/generation/propose-restock")`. |
| 9 | Key link: `lib/agent/tools/write/index.ts` → `lib/integrations/shopify/mutations.ts` via `updateInventory` in the write/L3 path | VERIFIED | Write branch import at line 926: `const { updateInventory } = await import("@/lib/integrations/shopify/mutations")`. L3 branch import at line 993. |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/agent/generation/propose-restock.ts` | generateRestockProposal helper — cost-cap-gated, provider-routed, target-qty-guarded | VERIFIED | 210 lines; substantive implementation; wired via dynamic import from tool |
| `lib/agent/tools/write/index.ts` | shopify_propose_restock ToolDefinition (propose/write/L3 + extractProposedAction) + registration (13→14) | VERIFIED | Tool at lines 901-1058; in writeTools array; WRITE_TOOL_NAMES derived at runtime = 14 |
| `tests/unit/propose-restock.test.ts` | Unit coverage for restock generation helper | VERIFIED | 15 tests, all pass; mocks LLM/cost layer only (separate from tool tests) |
| `tests/unit/shopify-propose-restock-tool.test.ts` | Tool-level coverage — propose/write/L3/zod/extractProposedAction | VERIFIED | 16 tests, all pass; in own file avoiding vitest mock collision with propose-restock.test.ts |
| `tests/unit/tool-validation.test.ts` | WRITE_TOOL_NAMES count 13→14; shopify_propose_restock shape assertion | VERIFIED | Count assertion at line 155: `expect(WRITE_TOOL_NAMES.length).toBe(14)`. Shape assertion at lines 177-184: `approvalRequired`, `inputSchema`, `extractProposedAction` all confirmed functions. |
| `scripts/seed-restock-workflow.mjs` | Idempotent seed script for 'Low-stock restock proposals' L2/manual workflow | VERIFIED | 219 lines; syntax valid (`node --check` passes); user_id resolved via user_profiles.shopify_shop; fails loud on zero rows; idempotency guard; steps carry params={variant_gid} only |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/agent/tools/write/index.ts` | `lib/agent/generation/propose-restock.ts` | dynamic import `generateRestockProposal` in propose/L3 path | WIRED | Line 975 |
| `lib/agent/tools/write/index.ts` | `lib/integrations/shopify/mutations.ts` | `updateInventory(userId, {variant_gid, inventory_qty})` in write/L3 path | WIRED | Lines 926-929 (write), 993-997 (L3) |
| `lib/agent/runtime.ts` (FROZEN) | `lib/agent/tools/write/index.ts` (`shopify_propose_restock.extractProposedAction`) | pre-existing `runWorkflowStep` contract calling `toolDef.extractProposedAction` | WIRED (pre-existing) | runtime.ts unchanged; contract already existed from f4g; only used here |
| `scripts/seed-restock-workflow.mjs` | `workflow_versions.definition.steps[].tool` | steps reference `shopify_propose_restock` with `params={variant_gid}` | WIRED | Line 127-130 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 47 unit tests pass | `npx vitest run tests/unit/propose-restock.test.ts tests/unit/shopify-propose-restock-tool.test.ts tests/unit/tool-validation.test.ts` | 3 files, 47 tests, 0 failures, 446ms | PASS |
| Seed script syntactically valid | `node --check scripts/seed-restock-workflow.mjs` | exit 0 | PASS |
| `inventory_qty: 0` routes to WRITE (typeof gate) | test (b2) in shopify-propose-restock-tool.test.ts | `updateInventory` called with `inventory_qty: 0`; `generateRestockProposal` not called | PASS |
| Frozen engine files unchanged | `git diff HEAD~3 -- lib/inngest/functions/execute-workflow-run.ts lib/agent/runtime.ts` | 0 bytes diff | PASS |

### Anti-Patterns Found

None. No TBD/FIXME/XXX markers. No empty handlers or placeholder returns in modified files. No raw Anthropic client instantiation (uses `generateText`/`resolveModel` via AI SDK). The write branch correctly uses `typeof === "number"` rather than truthiness.

### Human Verification Required

#### 1. End-to-end L2 workflow approval

**Test:** In the app, run the "Low-stock restock proposals" workflow (after seeding). Open each approval card.
**Expected:** Card shows a reasoned restock QUANTITY + RATIONALE for the variant — not just the raw `variant_gid`. Approve → the exact reviewed quantity is written to Shopify via `updateInventory` (no second LLM call, no quantity drift). Activity log entry shows populated `before_state` → `after_state` on `inventory_qty`.
**Why human:** Full approval-card rendering, Shopify write confirmation, and Activity log population require a running app + live Shopify dev store. Grep/static analysis confirms the code path exists but cannot execute it.

#### 2. Seed script live run + idempotency

**Test:** `DATABASE_URL=<6543 session pooler> node scripts/seed-restock-workflow.mjs`. Then run again.
**Expected:** First run: resolves `user_id` from `user_profiles.shopify_shop='operator-zero.myshopify.com'`, prints `user_id` + `workflow_id` + `version_id` + N steps (variants with `inventory_qty <= 5`). Second run: prints "Workflow already exists — skipping" and exits 0 (no DB writes).
**Why human:** Idempotency and tenant scoping require a live DB with the demo dataset; seed scripts are not run in CI.

---

_Verified: 2026-05-29T14:41:30Z_
_Verifier: Claude (gsd-verifier)_
