---
phase: quick-260529-f4g
verified: 2026-05-29T11:26:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the seed script against the dev store, then trigger the workflow in the app UI"
    expected: "Script resolves user_id via user_profiles.shopify_shop='operator-zero.myshopify.com', prints user_id + workflow_id + N steps (~15); re-running is a no-op. In the app the workflow approval card shows the GENERATED copy (not just the raw product_gid); approving writes that exact copy to Shopify with no regeneration; Activity log shows populated before/after."
    why_human: "Requires a live DATABASE_URL connection to the 6543 pooler and a running app connected to the dev store; cannot verify idempotency, tenant scoping, or the approval-card UX programmatically."
---

# Quick Task 260529-f4g: Optimized Product Descriptions Workflow — Verification Report

**Task Goal:** Build the "Optimized product descriptions" workflow end-to-end — a run-time LLM generation capability wired into the existing workflow engine (generate→approve→write→activity-log). The generated copy MUST flow into the engine's proposedAction so the L2 approval card shows it and the approved re-dispatch writes it WITHOUT regenerating. The durable engine file lib/inngest/functions/execute-workflow-run.ts MUST be unchanged.

**Verified:** 2026-05-29T11:26:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ToolDefinition exposes an OPTIONAL `extractProposedAction(result, input, ctx)` method; runWorkflowStep prefers it when present and falls back to the raw input (backward-compatible) | VERIFIED | `lib/agent/tools/index.ts` lines 64–77: method fully documented and typed. `lib/agent/runtime.ts` lines 174–178: ternary prefers `toolDef.extractProposedAction(...)` when present, else `input`. |
| 2 | A new tool `shopify_optimize_product_description` appears in `getToolDefinitions()` and in `WRITE_TOOL_NAMES` alongside the existing write tools | VERIFIED | `lib/agent/tools/write/index.ts` lines 636–649: `shopifyOptimizeProductDescription` in the `writeTools` array. `lib/agent/tools/index.ts` line 107: `WRITE_TOOL_NAMES` derived from `writeTools.map(t => t.name)`. Header comment (line 17) confirms count as 12. |
| 3 | PROPOSE via `runWorkflowStep` returns `proposedAction = {product_gid, body_html: <generated>}` (NOT the bare input), so the engine's approval card shows the generated copy; `updateProduct` is NOT called during propose | VERIFIED | `extractProposedAction` in `write/index.ts` lines 614–631 JSON-parses the tool result and returns `{product_gid, body_html}`. The PROPOSE branch (lines 581–597) never calls `updateProduct`. `shopify-optimize-tool.test.ts` test "(a) PROPOSE: extractProposedAction returns { product_gid, body_html } — NOT bare input" passes. |
| 4 | WRITE phase (input HAS body_html) calls `updateProduct` and does NOT regenerate (no second LLM call) | VERIFIED | `write/index.ts` lines 495–509: WRITE branch triggers on `body_html !== undefined && body_html !== ""`, calls `updateProduct`, returns immediately — `generateOptimizedDescription` is never reached. Test "(b) WRITE: updateProduct called; generateOptimizedDescription NOT called" passes. |
| 5 | When `automationLevel` is L3 and no `body_html` is supplied, the tool generates then writes in a single dispatch | VERIFIED | `write/index.ts` lines 564–579: L3 path calls `generateOptimizedDescription` then `updateProduct`, returns `phase:"l3"`. Test "(c) L3 generate+write: both called" passes. |
| 6 | Existing write tools (e.g. `shopify_update_product_description`) still return `proposedAction === input` via `runWorkflowStep` — backward-compat unchanged | VERIFIED | `runtime.ts` ternary falls to `input` when `toolDef.extractProposedAction` is absent (all 11 existing tools lack it). `run-workflow-step.test.ts` test "(b) backward-compat: no extractProposedAction → proposedAction === raw input" passes. |
| 7 | `checkCostCap(userId)` is consulted before the LLM call; a 'hard' cap fails cleanly without generating or writing | VERIFIED | `optimize-description.ts` lines 191–197: cost cap checked first; throws `{ classification: { type: "budget_exhausted" } }` on 'hard' before any `generateText` call. Test "(b) on hard cap, throws budget error WITHOUT calling generateText" passes (asserts `mockGenerateText` not called). |
| 8 | Tool input is zod-validated (bad input returns a correctable `tool_result` error, never throws) | VERIFIED | `write/index.ts` lines 482–489: `optimizeProductDescriptionSchema.safeParse(input)` on every entry; returns `is_error: true` with formatted message on failure. Tests "(d) Zod: execute({}) → is_error tool_result" pass. `tool-validation.test.ts` confirms count 12 and `extractProposedAction` presence. |
| 9 | An "Optimized product descriptions" L2/manual workflow seed script exists, resolves `user_id` via `user_profiles.shopify_shop = 'operator-zero.myshopify.com'`, is user_id-scoped and idempotent, fails loudly on zero rows | VERIFIED (static) | `scripts/seed-optimize-descriptions-workflow.mjs` lines 55–69: `SELECT user_id FROM user_profiles WHERE shopify_shop = 'operator-zero.myshopify.com' LIMIT 1`; exits non-zero with clear error on zero rows. Lines 76–90: idempotency check (SELECT for existing workflow; exits 0 if found). Lines 113–124: step params carry only `{product_gid}`. `node --check` passes. Runtime confirmation requires human check (see below). |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/agent/tools/index.ts` | `extractProposedAction` added to ToolDefinition contract (optional, documented) | VERIFIED | Lines 64–77: optional method with full JSDoc explaining runtime preference and fail-safe contract. |
| `lib/agent/runtime.ts` | `runWorkflowStep` prefers `toolDef.extractProposedAction` over raw input | VERIFIED | Lines 169–178: explicit comment + ternary implementation. No new imports added. `toolResult` already typed as `ToolResult` — no cast added. |
| `lib/agent/generation/optimize-description.ts` | Generation helper — cost-cap-gated, provider-routed (`generateText`), HTML-sanitized | VERIFIED | Full implementation: `checkCostCap` before LLM (line 191), `generateText` via `resolveModel("DRAFTER")` (lines 203–208), `recordCost` after (lines 211–217), `sanitizeHtml` strips script/style/iframe/on*/javascript (lines 149–172). No raw Anthropic client — uses AI SDK. |
| `lib/agent/tools/write/index.ts` | `shopify_optimize_product_description` with propose/write/L3 branching + `extractProposedAction` + registration in `writeTools` | VERIFIED | Tool defined lines 437–649. All three branches implemented. `extractProposedAction` at lines 614–631. Added to `writeTools` array at line 648. |
| `tests/unit/optimize-description.test.ts` | Unit coverage for generation helper | VERIFIED | 8 tests covering: return sanitized HTML, hard-cap blocks LLM, `recordCost` called, `<script>` stripped, placeholder brand voice fallback, soft cap proceeds, `resolveModel('DRAFTER')`, undefined usage guard. All pass (51/51 total). |
| `tests/unit/shopify-optimize-tool.test.ts` | Tool-level coverage — propose/write/L3/zod/`extractProposedAction` | VERIFIED | 12 tests covering all specified cases. Separate mock layer from `optimize-description.test.ts` (avoids vitest mock collision). All pass. |
| `tests/unit/run-workflow-step.test.ts` | `runWorkflowStep` surfaces `extractProposedAction` output + backward-compat guard | VERIFIED | 4 tests: (a) extracted proposedAction matches `{product_gid, body_html}`, (b) no `extractProposedAction` → proposedAction equals raw input, (c) no approval → proposedAction undefined, (d) ToolResult from `dispatchTool` is passed as first arg. All pass. |
| `scripts/seed-optimize-descriptions-workflow.mjs` | Idempotent, user_id-scoped setup script | VERIFIED (static) | Syntactically valid (`node --check` passes). User_id resolution, idempotency, step definition, and transaction structure all confirmed by code inspection. Runtime validation deferred to human check. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/agent/runtime.ts` | `lib/agent/tools/index.ts (ToolDefinition.extractProposedAction)` | `runWorkflowStep` calls `toolDef.extractProposedAction(toolResult, input, agentCtx)` when present | WIRED | `runtime.ts` line 176: `toolDef.extractProposedAction(toolResult, input, agentCtx)` — matches contract exactly. |
| `lib/agent/tools/write/index.ts` | `lib/agent/generation/optimize-description.ts` | dynamic import of `generateOptimizedDescription` in the propose/L3 path | WIRED | `write/index.ts` line 542: `await import("@/lib/agent/generation/optimize-description")` — propose and L3 paths both use it. |
| `lib/agent/tools/write/index.ts` | `lib/integrations/shopify/mutations.ts` | `updateProduct` in the write/L3 path | WIRED | Lines 496–499 (WRITE), 568–569 (L3): `await import("@/lib/integrations/shopify/mutations")` → `updateProduct`. |
| `lib/agent/tools/index.ts` | `lib/agent/tools/write/index.ts` | `writeTools` spread into `getToolDefinitions` registry | WIRED | `tools/index.ts` line 22: `import { writeTools } from "./write/index"`. Line 95: spread into `allTools`. |
| `scripts/seed-optimize-descriptions-workflow.mjs` | `workflow_versions.definition.steps[].tool` | steps reference `shopify_optimize_product_description` with `params={product_gid}` | WIRED | `seed script` line 119: `tool: "shopify_optimize_product_description"`, line 121: `params: { product_gid: row.product_gid }`. No `body_html` in params (ensures PROPOSE phase, not WRITE). |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `write/index.ts` (PROPOSE) | `bodyHtml` | `generateOptimizedDescription` → `generateText` via AI SDK | Yes (LLM output, sanitized) | FLOWING — body_html surfaces through `extractProposedAction` into `proposedAction` in `runWorkflowStep` |
| `write/index.ts` (WRITE) | `result.idempotency_key` | `updateProduct` → Shopify mutation | Yes (real Shopify write) | FLOWING — write branch uses supplied `body_html` without regeneration |
| `runtime.ts` | `proposedAction` | `toolDef.extractProposedAction(toolResult, input, agentCtx)` | Yes — parsed from LLM output in propose phase | FLOWING — engine reads `stepResult.proposedAction` for approval preview AND approved re-dispatch |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All touched tests pass | `npx vitest run tests/unit/run-workflow-step.test.ts tests/unit/optimize-description.test.ts tests/unit/shopify-optimize-tool.test.ts tests/unit/tool-validation.test.ts tests/unit/agent-errors.test.ts` | 5 test files, 51 tests, all passed | PASS |
| TypeScript strict mode passes | `npx tsc --noEmit` | Exit 0, no errors | PASS |
| Seed script syntactically valid | `node --check scripts/seed-optimize-descriptions-workflow.mjs` | Exit 0 | PASS |
| Engine file unchanged | `git diff 27c732f HEAD -- lib/inngest/functions/execute-workflow-run.ts` | Empty diff (0 lines) | PASS |

---

### Probe Execution

No probes declared. Step 7c: SKIPPED.

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| QUICK-f4g-00 | extractProposedAction tool contract + runWorkflowStep surfaces it (backward-compatible) | SATISFIED | `tools/index.ts` contract + `runtime.ts` ternary + `run-workflow-step.test.ts` backward-compat guard |
| QUICK-f4g-01 | Generation helper (cost-cap-gated, provider-routed) | SATISFIED | `optimize-description.ts` full implementation + 8 tests |
| QUICK-f4g-02 | Smart optimize tool (propose/write/L3) registered beside write tools | SATISFIED | `write/index.ts` Tool 12 + registered in `writeTools` + 12 tool-level tests |
| QUICK-f4g-03 | Live "Optimized product descriptions" L2 workflow for connected store | SATISFIED (static) | Seed script creates it with correct schema; runtime confirmation is human-check |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/agent/tools/write/index.ts` | 189–199 | `shopify_update_product_image_alt` returns `note: "Image alt update queued"` — pre-existing stub | Info (pre-existing) | Unrelated to this task; exists since before phase start |
| `lib/agent/tools/write/index.ts` | 262–273 | `shopify_update_variant_price` returns `note: "Price update queued"` — pre-existing stub | Info (pre-existing) | Unrelated to this task; exists since before phase start |

No TBD/FIXME/XXX markers in any files modified by this task. No debt markers, no blockers.

---

### Human Verification Required

#### 1. Seed Script Runtime + End-to-End Workflow Approval Flow

**Test:** Run `DATABASE_URL=<6543 session pooler> node scripts/seed-optimize-descriptions-workflow.mjs` against the dev store. Then in the app, navigate to Workflows, find "Optimized product descriptions", and run it.

**Expected:**
- Script prints resolved `user_id` (matching the `operator-zero.myshopify.com` store owner), a `workflow_id`, a `version_id`, and ~15 steps (one per empty-body_html product).
- Re-running the script immediately is a no-op: prints "Workflow already exists — skipping" and exits 0.
- In the app, the workflow run shows an approval card for each product step where the card body displays the **generated HTML copy** (not just `{product_gid: "..."}` raw input).
- Approving a step writes **exactly the reviewed copy** to Shopify — the Activity log shows a populated `before` (old description) and `after` (the generated copy). No regeneration occurs on approval.

**Why human:** Requires a live `DATABASE_URL` connected to the 6543 session pooler, a running app authenticated as the store owner, and visual inspection of the approval card and Activity log. Cannot verify multi-tenant user_id resolution, idempotency, or the approval card UX programmatically.

---

### Gaps Summary

No gaps. All 9 must-have truths are verified by code inspection and automated test results. The only open item is the human verification of the live end-to-end flow (seed + approval card + Activity log), which is standard for workflow features that touch external services.

---

_Verified: 2026-05-29T11:26:00Z_
_Verifier: Claude (gsd-verifier)_
