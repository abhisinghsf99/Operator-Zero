---
phase: quick-260529-jxq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/agent/generation/propose-restock.ts
  - lib/agent/tools/write/index.ts
  - lib/agent/tools/index.ts
  - tests/unit/propose-restock.test.ts
  - tests/unit/shopify-propose-restock-tool.test.ts
  - tests/unit/tool-validation.test.ts
  - scripts/seed-restock-workflow.mjs
autonomous: false
requirements:
  - QUICK-jxq-01  # restock generation helper (cost-cap-gated, provider-routed, target-qty-guarded)
  - QUICK-jxq-02  # shopify_propose_restock smart tool (propose/write/L3) registered beside write tools (13→14)
  - QUICK-jxq-03  # live "Low-stock restock proposals" L2 workflow for the connected store

must_haves:
  truths:
    - "A new tool shopify_propose_restock appears in getToolDefinitions() and in WRITE_TOOL_NAMES (count goes 13→14) alongside the existing write tools"
    - "PROPOSE via runWorkflowStep returns proposedAction = {variant_gid, inventory_qty} (NOT the bare input), so the engine's approval card shows the reasoned restock quantity + rationale; updateInventory is NOT called during propose"
    - "WRITE phase (input HAS inventory_qty as a number — the L2 approval re-dispatch or direct L3-with-qty) calls updateInventory and does NOT regenerate (no second LLM call, no quantity drift)"
    - "When automationLevel is L3 and no inventory_qty is supplied, the tool reasons a target THEN writes in a single dispatch"
    - "generateRestockProposal consults checkCostCap(userId) BEFORE the LLM call; a 'hard' cap fails cleanly without generating or writing; recordCost is called after a successful generate"
    - "target_qty is guarded to a positive integer within 1..1000 AND strictly greater than the variant's current inventory_qty (clamped/validated); rationale is short plain text"
    - "Tool input is zod-validated (bad input returns a correctable tool_result error, never throws)"
    - "A 'Low-stock restock proposals' L2 / manual workflow exists for the connected-store user (resolved via user_profiles.shopify_shop = 'operator-zero.myshopify.com' → user_profiles.user_id) with a workflow_versions definition whose steps reference shopify_propose_restock with params={variant_gid} only (one step per low-stock variant where inventory_qty <= 5)"
    - "The durable engine (lib/inngest/functions/execute-workflow-run.ts) and runWorkflowStep (lib/agent/runtime.ts) are UNCHANGED — the extractProposedAction contract already exists and is only USED here"
  artifacts:
    - path: "lib/agent/generation/propose-restock.ts"
      provides: "generateRestockProposal helper — cost-cap-gated, provider-routed (generateText/resolveModel DRAFTER), returns { target_qty, rationale } with positive-integer + >current guards (1..1000)"
      contains: "checkCostCap"
    - path: "lib/agent/tools/write/index.ts"
      provides: "shopify_propose_restock ToolDefinition (propose/write/L3 branching + extractProposedAction) + registration in writeTools (13→14)"
      contains: "shopify_propose_restock"
    - path: "tests/unit/propose-restock.test.ts"
      provides: "Unit coverage for the restock generation helper — generate, cost-cap gate (hard blocks LLM), recordCost, target_qty clamp to positive integer > current"
      contains: "generateRestockProposal"
    - path: "tests/unit/shopify-propose-restock-tool.test.ts"
      provides: "Tool-level coverage — propose (no Shopify write) + extractProposedAction surfacing {variant_gid, inventory_qty}, write (no regenerate), L3, zod validation, parse fallback"
      contains: "shopify_propose_restock"
    - path: "tests/unit/tool-validation.test.ts"
      provides: "WRITE_TOOL_NAMES count assertion updated 13→14; assertion that shopify_propose_restock exposes approvalRequired + inputSchema + extractProposedAction"
      contains: "shopify_propose_restock"
    - path: "scripts/seed-restock-workflow.mjs"
      provides: "Idempotent, user_id-scoped setup script creating the 'Low-stock restock proposals' workflow + workflow_versions over DATABASE_URL; user_id resolved via user_profiles.shopify_shop; one step per variant with inventory_qty <= 5"
      contains: "Low-stock restock proposals"
  key_links:
    - from: "lib/agent/tools/write/index.ts"
      to: "lib/agent/generation/propose-restock.ts"
      via: "dynamic import of generateRestockProposal in the propose/L3 path"
      pattern: "propose-restock"
    - from: "lib/agent/tools/write/index.ts"
      to: "lib/integrations/shopify/mutations.ts"
      via: "updateInventory(userId, { variant_gid, inventory_qty }) in the write/L3 path (the single Shopify inventory write boundary)"
      pattern: "updateInventory"
    - from: "lib/agent/runtime.ts (UNCHANGED)"
      to: "lib/agent/tools/write/index.ts (shopify_propose_restock.extractProposedAction)"
      via: "runWorkflowStep already calls toolDef.extractProposedAction(toolResult, input, ctx) — contract pre-exists from f4g"
      pattern: "extractProposedAction"
    - from: "scripts/seed-restock-workflow.mjs"
      to: "workflow_versions.definition.steps[].tool"
      via: "steps reference shopify_propose_restock with params={variant_gid}"
      pattern: "shopify_propose_restock"
---

<objective>
Build the "Low-stock restock proposals" workflow (#3) as a near-clone of the shipped "Optimize SEO meta" (#1, quick-260529-jk4) / "Optimized product descriptions" (#2, quick-260529-f4g) smart-tool pattern — but for INVENTORY. One new generation helper (returns a reasoned restock-to-target QUANTITY + short RATIONALE, not copy), one new "smart" write tool `shopify_propose_restock` (propose/write/L3, mirroring `shopify_optimize_meta`), and one live L2/manual workflow for the connected Shopify dev store.

USER DECISION (locked): behavior is RESTOCK-TO-TARGET. The agent flags low-stock / OOS variants (inventory_qty <= 5), reasons a TARGET inventory quantity + a short rationale, and on approval writes it via `updateInventory` (a REAL tool — not the stubbed price/flash-sale write, not alert-only).

Purpose: Reuse the proven generate→approve→write→activity-log pattern for inventory. The L2 approval card must show the REASONED restock quantity + rationale before anything is written, and approving must write exactly that quantity (no regeneration, no quantity drift, no double LLM cost). The contract that makes this work — `ToolDefinition.extractProposedAction` surfaced by `runWorkflowStep` — ALREADY EXISTS (added in f4g, reused in jk4). This plan only USES it. The durable engine (lib/inngest/functions/execute-workflow-run.ts) and runWorkflowStep (lib/agent/runtime.ts) are FROZEN and receive NO edits.

Output:
- lib/agent/generation/propose-restock.ts — generation helper returning { target_qty: number, rationale: string } (cost-cap-gated, provider-routed, positive-integer + >current guards, 1..1000)
- shopify_propose_restock tool in lib/agent/tools/write/index.ts (registered in writeTools, implements extractProposedAction) — WRITE_TOOL_NAMES 13→14
- Updated tool-validation test (count 13→14 + tool-shape assertion)
- tests/unit/propose-restock.test.ts — generation-helper coverage (generate/cost-cap/clamp)
- tests/unit/shopify-propose-restock-tool.test.ts — tool-level coverage (propose/write/L3/zod/extractProposedAction) in its OWN file to avoid vitest mock collision
- scripts/seed-restock-workflow.mjs — idempotent live workflow setup
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

<interfaces>
<!-- Contracts extracted from the codebase. Use these directly — no exploration needed. -->

ToolDefinition + AgentContext + ToolResult (from lib/agent/tools/index.ts) — extractProposedAction ALREADY EXISTS on the contract (added in f4g):
```typescript
interface AgentContext { userId: string; automationLevel: "L1"|"L2"|"L3"; threadId?: string; workflowRunId?: string; }
interface ToolResult { type: "tool_result"; content: string; is_error?: boolean; }  // content is a STRING
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute(input: unknown, ctx: AgentContext): Promise<ToolResult>;
  approvalRequired?: (input: unknown, ctx: AgentContext) => boolean;
  extractProposedAction?: (result: ToolResult, input: unknown, ctx: AgentContext) => unknown;  // PRE-EXISTS
}
```

ENGINE ↔ TOOL CONTRACT (verified, FROZEN — do NOT edit runtime.ts or execute-workflow-run.ts):
- runWorkflowStep already builds `proposedAction = requiresApproval ? (toolDef.extractProposedAction ? toolDef.extractProposedAction(toolResult, input, ctx) : input) : undefined`.
- The engine reads `stepResult.proposedAction ?? workflowStep.params` as BOTH the approval preview AND the input it re-dispatches the SAME tool with (at L3) on approval.
- THEREFORE: if `proposedAction` carries the reasoned `{variant_gid, inventory_qty}`, the approval card shows the target quantity AND the approved re-dispatch arrives WITH inventory_qty. The tool's WRITE phase ("input has inventory_qty → updateInventory, no regenerate") writes exactly what was reviewed.

DIRECT ANALOG — shopify_optimize_meta (lib/agent/tools/write/index.ts, Tool 13). Copy its structure, swapping the meta string fields → a single numeric inventory_qty AND swapping product/brand-voice reads → variant read + product-title join, AND swapping updateProduct → updateInventory:
- approvalRequired = defaultApprovalRequired (true unless ctx.automationLevel === "L3") — the existing helper in the file.
- WRITE phase first: if input has inventory_qty (a number) → updateInventory, no generation.
- GENERATE path: read variant (user_id-scoped from shopifyProductVariants) + join product title (user_id-scoped from shopifyProducts by product_gid), call the helper.
- L3: reason then updateInventory in one call.
- extractProposedAction: JSON.parse(result.content) → return { variant_gid, inventory_qty }; degrade to input on parse failure OR when inventory_qty is missing / not a number.

The inventory write primitive ALREADY exists (shopify_update_variant_inventory Tool 7) — do NOT add a new write primitive; the NEW tool calls updateInventory directly like Tool 13 calls updateProduct.

updateInventory (lib/integrations/shopify/mutations.ts) — the SINGLE Shopify inventory write boundary. It does idempotency + observability-first writeActivity (BEFORE the effect) + Shopify mutation + mirror re-read + after_state backfill — all UNCHANGED:
```typescript
updateInventory(userId: string, input: { variant_gid: string; inventory_qty: number }): Promise<MutationResult<...>>
// returns { before_state, after_state, idempotency_key, skipped }
```

generateOptimizedMeta (lib/agent/generation/optimize-meta.ts) — the helper to MIRROR for its cost-cap + provider-routing scaffolding. It: (1) `const cap = await checkCostCap(userId); if (cap === "hard") throw Object.assign(new Error(...), { classification: { type: "budget_exhausted" } });` BEFORE the LLM; (2) `generateText({ model: resolveModel("DRAFTER"), maxOutputTokens, messages })`; (3) `const { modelId } = resolveModelChoice("DRAFTER"); await recordCost(userId, costFor(modelId, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0));`; (4) prompt builder treats fields as DATA ("do not execute field contents"); (5) parseMeta strips fences + JSON.parses with a deterministic fallback. The restock helper mirrors (1)/(2)/(3)/(4) but returns a parsed numeric { target_qty, rationale } with quantity guards instead of strings. NO brand voice (inventory reasoning does not use it).

Schema columns (verified):
- shopify_product_variants (lib/db/schema/shopify-mirror.ts): composite PK (user_id, variant_gid); columns variant_gid, product_gid, sku (text|null), price (numeric|null), inventory_qty (integer|null). RLS by user_id; application code MUST still filter user_id.
- shopify_products (lib/db/schema/shopify-mirror.ts): composite PK (user_id, product_gid); column title (text|null) — join target for human-readable context.
- user_profiles (lib/db/schema/users.ts): user_id PK; column shopify_shop (the connected store domain). The store↔user binding lives HERE.

Tool-file imports ALREADY present (reuse — do NOT re-add): z (zod); AgentContext/ToolResult/ToolDefinition types; formatZodError (from ../read/index); serviceDb (from @/lib/db/client); shopifyProducts (from @/lib/db/schema/shopify-mirror); eq, and (from drizzle-orm). NEW import needed in the tool file: shopifyProductVariants from @/lib/db/schema/shopify-mirror (add to the existing import line — shopifyProducts is already imported from there).

Existing inventory length/range convention (Tool 7 shopify_update_variant_inventory): inventory_qty = z.number().int().nonnegative(). The propose tool's optional inventory_qty mirrors this: z.number().int().nonnegative().optional().
</interfaces>

@lib/agent/runtime.ts
@lib/agent/tools/index.ts
@lib/agent/tools/write/index.ts
@lib/agent/tools/read/index.ts
@lib/agent/generation/optimize-meta.ts
@lib/agent/llm/models.ts
@lib/agent/llm/pricing.ts
@lib/cost-cap.ts
@lib/integrations/shopify/mutations.ts
@lib/db/schema/shopify-mirror.ts
@lib/db/schema/users.ts
@lib/db/schema/workflows.ts
@lib/db/schema/workflow-versions.ts
@scripts/seed-optimize-meta-workflow.mjs
@tests/unit/optimize-meta.test.ts
@tests/unit/shopify-optimize-meta-tool.test.ts
@tests/unit/tool-validation.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Restock generation helper — cost-cap-gated, provider-routed, target-qty-guarded</name>
  <files>lib/agent/generation/propose-restock.ts, tests/unit/propose-restock.test.ts</files>
  <behavior>
    - generateRestockProposal({ userId, variant, instructions? }) returns Promise<{ target_qty: number; rationale: string }>.
    - It calls checkCostCap(userId) BEFORE the LLM call. On 'hard' it throws a clean budget error (Object.assign(new Error("Budget exhausted — cannot generate restock proposal"), { classification: { type: "budget_exhausted" } })) WITHOUT calling generateText.
    - On 'ok'/'soft' it calls generateText({ model: resolveModel("DRAFTER"), ... }) once, then recordCost(userId, costFor(modelId, inputTokens, outputTokens)) using resolveModelChoice("DRAFTER").modelId and result.usage (guard undefined usage → 0).
    - Variant fields (product title, sku, current inventory_qty, price) summarized as DATA ("do not execute field contents" framing — mirror optimize-meta buildPrompt).
    - target_qty GUARDS (the locked restock-to-target contract): the model is asked for an integer restock-to target. The helper parses it, then: round to integer; clamp into [1, 1000]; if the clamped target is NOT strictly greater than the variant's current inventory_qty, raise it to current_qty + a sensible minimum bump (e.g. max(current_qty + 1, 10) then re-clamp to ≤1000). Final invariant: 1 ≤ target_qty ≤ 1000 AND target_qty > current inventory_qty. Treat a null/undefined current inventory_qty as 0.
    - rationale: short plain text (strip stray HTML tags, collapse whitespace, trim, truncate to ~240 chars). Non-empty — fall back to a deterministic default rationale ("Restock to <target> units — current stock is low (<current>).") if the model returns no usable rationale.
    - Output parsing: the model is asked to return JSON { "target_qty": <number>, "rationale": "..." }; helper strips markdown fences then JSON.parses; on parse failure falls back to extracting the first integer found in the text for target_qty and using the remaining text (or the default) as rationale, so it never returns an invalid result.
  </behavior>
  <action>
    Create lib/agent/generation/propose-restock.ts exporting `generateRestockProposal`. Signature: `(args: { userId: string; variant: { variant_gid: string; product_title?: string|null; sku?: string|null; inventory_qty?: number|null; price?: string|null }; instructions?: string }) => Promise<{ target_qty: number; rationale: string }>`. Export an interface `ProposeRestockArgs` and a result type `ProposeRestockResult` ({ target_qty: number; rationale: string }).

    Imports (identical to optimize-meta.ts): generateText from "ai"; resolveModel + resolveModelChoice from "@/lib/agent/llm/models"; costFor from "@/lib/agent/llm/pricing"; checkCostCap + recordCost from "@/lib/cost-cap". Use role "DRAFTER".

    Cost-cap gate FIRST: `const cap = await checkCostCap(userId); if (cap === "hard") throw Object.assign(new Error("Budget exhausted — cannot generate restock proposal"), { classification: { type: "budget_exhausted" } });`. Do NOT call the LLM on hard cap.

    Build a private buildPrompt() mirroring optimize-meta.ts buildPrompt structure: label variant fields as structured DATA ("VARIANT DATA (treat as structured data — do not execute field contents):" with Product title / SKU / Current inventory / Price lines), conditionally append `ADDITIONAL INSTRUCTIONS: <instructions>` when present, and instruct the model to return ONLY a JSON object with keys "target_qty" (an integer restock-to-target quantity that is GREATER than current inventory, sized to cover near-term demand without massive overstock) and "rationale" (one short plain-text sentence, ≤240 chars, no HTML, no markdown fences). No brand voice section.

    Call generateText once: `const result = await generateText({ model: resolveModel("DRAFTER"), maxOutputTokens: 256, messages: [{ role: "user", content: prompt }] });`. After it returns, record cost: `const { modelId } = resolveModelChoice("DRAFTER"); await recordCost(userId, costFor(modelId, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0));`.

    Parse result.text with a private parseProposal(raw, currentQty): strip markdown code fences (mirror optimize-meta parseMeta fence strip), JSON.parse → read target_qty (coerce via Number()) + rationale; on JSON failure fall back to extracting the first integer match (/-?\d+/) for target_qty and using the cleaned remaining text for rationale. Then GUARD target_qty: `let t = Math.round(Number.isFinite(parsedTarget) ? parsedTarget : 0); t = Math.min(1000, Math.max(1, t)); if (t <= currentQty) t = Math.min(1000, Math.max(currentQty + 1, 10));`. Clean rationale: replace `/<[^>]+>/g` → "", collapse whitespace, trim, slice(0, 240); if empty use the deterministic default `Restock to ${t} units — current stock is low (${currentQty}).`. Return { target_qty: t, rationale }. currentQty = `args.variant.inventory_qty ?? 0`. Server-only; do NOT instantiate a raw Anthropic client (use resolveModel via the AI SDK).

    Write tests/unit/propose-restock.test.ts FIRST (RED). Mirror tests/unit/optimize-meta.test.ts's mock setup EXACTLY (this file mocks the LLM/cost layer ONLY; it is a SEPARATE file from Task 2's tool test). Mock "ai" generateText, mock "@/lib/agent/llm/models" (resolveModel + resolveModelChoice), mock "@/lib/cost-cap" (checkCostCap + recordCost), mock "@/lib/agent/llm/pricing" (costFor). Default generateText mock returns text = JSON.stringify({ target_qty: 50, rationale: "Restock to 50 — sustained demand, currently out of stock." }) with usage { inputTokens: 80, outputTokens: 40 }. Default variant: { variant_gid: "gid://shopify/ProductVariant/1", product_title: "Test Mug", sku: "MUG-01", inventory_qty: 0, price: "12.00" }. Cases:
    (a) returns { target_qty: 50, rationale } parsed from the JSON output (target_qty is a number, rationale non-empty);
    (b) calls checkCostCap before generateText and on 'hard' throws budget error WITHOUT calling generateText (assert the generateText mock was not called);
    (c) calls recordCost after a successful generate with costFor(modelId, inputTokens, outputTokens);
    (d) clamps an over-bound target (mock returns target_qty: 99999 → assert result.target_qty === 1000) and a non-positive target (mock returns target_qty: -5 with current inventory_qty: 0 → assert result.target_qty ≥ 1 and > 0);
    (e) enforces target_qty > current: mock returns target_qty: 3 but variant inventory_qty: 8 → assert result.target_qty > 8;
    (f) resolveModel called with "DRAFTER"; (g) handles undefined usage gracefully; (h) malformed (non-JSON) model output ("I think 40 units") still yields target_qty: 40 (first-integer fallback) with a non-empty rationale; (i) null current inventory_qty treated as 0 (target_qty > 0).
    Import the module AFTER the mocks.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/propose-restock.test.ts</automated>
  </verify>
  <done>propose-restock.test.ts passes; helper gates on cost cap before LLM, records cost after, parses { target_qty, rationale }, guards target_qty to a positive integer in 1..1000 strictly greater than current inventory_qty, handles malformed output + null current qty. No raw Anthropic client.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: shopify_propose_restock tool — propose/write/L3 + extractProposedAction + registration (13→14)</name>
  <files>lib/agent/tools/write/index.ts, lib/agent/tools/index.ts, tests/unit/shopify-propose-restock-tool.test.ts, tests/unit/tool-validation.test.ts</files>
  <behavior>
    - New ToolDefinition `shopify_propose_restock` with inputSchema: `{ variant_gid: string (min 1); inventory_qty?: number (int, nonnegative); instructions?: string }`.
    - approvalRequired = defaultApprovalRequired (true unless ctx.automationLevel === "L3") — reuse the existing helper.
    - WRITE phase FIRST (input HAS inventory_qty as a number): call updateInventory(ctx.userId, { variant_gid, inventory_qty }); MUST NOT call generateRestockProposal. Return JSON ok + idempotency_key + phase:"write". This is the path the L2 approval re-dispatch lands on (extractProposedAction put inventory_qty into proposedAction → engine re-dispatches it as input).
    - PROPOSE phase (input has variant_gid, NO inventory_qty, automationLevel !== "L3"): read the variant from shopifyProductVariants scoped by ctx.userId (NOT from input); read the parent product title from shopifyProducts (user_id + variant.product_gid) for context; call generateRestockProposal; return ToolResult is_error=false, content = JSON.stringify({ ok: true, phase: "propose", variant_gid, inventory_qty: <target_qty>, rationale, preview }). MUST NOT call updateInventory.
    - extractProposedAction(result, input): JSON.parse(result.content); if typeof parsed.inventory_qty === "number" return { variant_gid: parsed.variant_gid, inventory_qty: parsed.inventory_qty }; on parse failure OR missing/non-number inventory_qty return input (fallback).
    - L3 single dispatch (NO inventory_qty AND automationLevel === "L3"): reason a target THEN updateInventory in one call; return JSON ok + idempotency_key + phase:"l3".
    - Zod safeParse on entry; bad input → correctable tool_result error (never throws). Errors in generate/write → caught, returned as is_error tool_result.
    - Registered in the `writeTools` array → appears in getToolDefinitions() and WRITE_TOOL_NAMES (count 13→14).
  </behavior>
  <action>
    First, extend the existing import in lib/agent/tools/write/index.ts: change `import { shopifyProducts } from "@/lib/db/schema/shopify-mirror";` to also import `shopifyProductVariants` from the same module (`import { shopifyProducts, shopifyProductVariants } from "@/lib/db/schema/shopify-mirror";`).

    In lib/agent/tools/write/index.ts add a new tool (Tool 14) after shopifyOptimizeMeta (Tool 13), before the `writeTools` export. Mirror the structure of shopifyOptimizeMeta EXACTLY, swapping the meta string fields → a single numeric inventory_qty, the product read → variant read + product-title join, and updateProduct → updateInventory.

    Define `const proposeRestockSchema = z.object({ variant_gid: z.string().min(1, "variant_gid is required"), inventory_qty: z.number().int().nonnegative("inventory_qty must be a non-negative integer").optional(), instructions: z.string().optional() });`.

    Export `shopifyProposeRestock: ToolDefinition` with name "shopify_propose_restock", description ("Reason a restock-to-target inventory quantity for a low-stock or out-of-stock variant; proposes the target qty + rationale for approval (L1/L2) or writes directly (L3)."), inputSchema = the schema above, approvalRequired = defaultApprovalRequired.

    execute(input, ctx):
    1. safeParse → on failure return formatZodError tool_result (mirror Tool 13).
    2. try { ... } catch → return is_error tool_result `Failed to propose restock: ${String(err)}`.
    3. WRITE phase FIRST: `const { variant_gid, inventory_qty, instructions } = parsed.data;` — if `typeof inventory_qty === "number"`: `const { updateInventory } = await import("@/lib/integrations/shopify/mutations"); const result = await updateInventory(ctx.userId, { variant_gid, inventory_qty }); return JSON({ ok:true, phase:"write", idempotency_key: result.idempotency_key });` — NO generation here.
    4. Otherwise GENERATE: read the variant from the mirror (serviceDb select from shopifyProductVariants where user_id = ctx.userId AND variant_gid = variant_gid, limit 1). If no row → return is_error tool_result `Variant not found: ${variant_gid}`. Then read the parent product title: `const [productRow] = await serviceDb.select().from(shopifyProducts).where(and(eq(shopifyProducts.user_id, ctx.userId), eq(shopifyProducts.product_gid, variantRow.product_gid))).limit(1);` (productRow may be undefined → title null). Call `const { generateRestockProposal } = await import("@/lib/agent/generation/propose-restock"); const { target_qty, rationale } = await generateRestockProposal({ userId: ctx.userId, variant: { variant_gid: variantRow.variant_gid, product_title: productRow?.title ?? null, sku: variantRow.sku, inventory_qty: variantRow.inventory_qty, price: variantRow.price }, instructions });`.
    5. If ctx.automationLevel === "L3": import updateInventory, `const result = await updateInventory(ctx.userId, { variant_gid, inventory_qty: target_qty }); return JSON({ ok:true, phase:"l3", idempotency_key: result.idempotency_key });`.
    6. Else (propose, L1/L2): return JSON({ ok:true, phase:"propose", variant_gid, inventory_qty: target_qty, rationale, preview: `Restock to ${target_qty} — ${rationale}`.slice(0, 200) }) with is_error:false. NO updateInventory call.

    Add `extractProposedAction(result, _input)`: `try { const parsed = JSON.parse(result.content); if (parsed && typeof parsed.inventory_qty === "number") { return { variant_gid: parsed.variant_gid, inventory_qty: parsed.inventory_qty }; } } catch { /* fall through — T-jxq-00 */ } return _input;`. Single numeric field — simpler than meta's parenthesized OR; still guard `typeof === "number"`. Degrades to input on parse failure or when inventory_qty is missing / not a number.

    COST-CAP NOTE: this tool does NOT call checkCostCap directly — cost-cap enforcement is DELEGATED to generateRestockProposal (gated + covered by Task 1 tests). The WRITE phase makes no LLM call, so no cap check is needed there. (Same architectural delegation as shopify_optimize_meta.)

    Add `shopifyProposeRestock` to the `writeTools` array export and update the file header count/comment (13 → 14 write tools; add line "14. shopify_propose_restock — reason restock-to-target + propose/write/L3").

    In lib/agent/tools/index.ts update the doc-comment counts: line ~3 "11 read + 13 write + 5 meta" → "11 read + 14 write + 5 meta"; line ~9 "WRITE_TOOL_NAMES — array of 13 write tool names" → 14; line ~107 "The exact 13 write tool names" → 14 — no logic change (getToolDefinitions spreads writeTools; WRITE_TOOL_NAMES is derived via writeTools.map).

    Update tests/unit/tool-validation.test.ts: change the "all 13 write tools" describe/it title + `expect(WRITE_TOOL_NAMES.length).toBe(13)` to 14. Add an `it(...)` asserting `getToolDefinitions()["shopify_propose_restock"]` is defined and exposes `approvalRequired` (function), `inputSchema`, and `extractProposedAction` (function). Leave the existing shopify_optimize_meta + shopify_optimize_product_description assertions intact.

    Create a NEW, SEPARATE test file tests/unit/shopify-propose-restock-tool.test.ts (distinct from Task 1's propose-restock.test.ts — this avoids a vitest mock collision: Task 1 mocks `ai`/generateText + cost-cap; this file mocks the higher-level helper + DB + Shopify). MIRROR tests/unit/shopify-optimize-meta-tool.test.ts exactly, swapping the helper + fields + write boundary. Mock "@/lib/agent/generation/propose-restock" (generateRestockProposal → resolves { target_qty: 50, rationale: "Out of stock; restock to cover demand." }), mock "@/lib/integrations/shopify/mutations" (updateInventory → { idempotency_key, before_state:null, after_state:null, skipped:false }), mock "@/lib/db/client" (serviceDb returning a variant row then a product row via the alternating-callCount pattern from shopify-optimize-meta-tool.test.ts — first select = variant { variant_gid, product_gid, sku, price, inventory_qty: 0 }, second select = product { title }). Import shopifyProposeRestock AFTER the mocks. Cases:
    (a) PROPOSE — execute({ variant_gid }, L2): generateRestockProposal called once, updateInventory NOT called, result content includes inventory_qty (=50) + rationale and phase=propose; AND shopifyProposeRestock.extractProposedAction(result, { variant_gid }) returns { variant_gid, inventory_qty: 50 } (NOT the bare input);
    (b) WRITE — execute({ variant_gid, inventory_qty: 50 }, L3): updateInventory called once with { variant_gid, inventory_qty: 50 }, generateRestockProposal NOT called (no regeneration), phase=write;
    (b2) WRITE with inventory_qty: 0 supplied (a valid number — covers OOS→intentional zero edge, must still take the WRITE path because typeof === "number") → updateInventory called with inventory_qty: 0, generateRestockProposal NOT called;
    (c) L3 reason+write — execute({ variant_gid }, L3): generateRestockProposal called AND updateInventory called with inventory_qty: 50; phase=l3;
    (d) zod — execute({}, ctx): is_error tool_result, neither generate nor updateInventory called; AND execute({ variant_gid: "g", inventory_qty: "not-a-number" }, ctx) → is_error;
    (e) extractProposedAction fallback — content non-JSON → returns input unchanged; AND content JSON with no inventory_qty → returns input; AND content JSON with inventory_qty: "50" (string, not number) → returns input;
    (f) variant not found (variantQueryResult = []) → is_error tool_result, generateRestockProposal NOT called;
    plus the smoke tests from the analog (tool defined, correct name, approvalRequired true for L2 / false for L3).
    IMPORTANT for case (b2): the WRITE-phase branch MUST key on `typeof inventory_qty === "number"` (NOT a truthiness check) so that inventory_qty: 0 still routes to WRITE — verify this in the test.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/shopify-propose-restock-tool.test.ts tests/unit/tool-validation.test.ts &amp;&amp; npm run typecheck</automated>
  </verify>
  <done>Tool present in getToolDefinitions()/WRITE_TOOL_NAMES (length 14); propose reasons a target without writing AND extractProposedAction surfaces { variant_gid, inventory_qty }; write phase writes the supplied qty without regenerating (incl. qty 0 via typeof-number gate); L3 reasons+writes; zod-validated; extractProposedAction degrades to input on parse failure / missing-or-non-number inventory_qty; tool-level tests live in their own file (no mock collision with Task 1); tool-validation count is 14; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 3: Idempotent live "Low-stock restock proposals" workflow setup script</name>
  <files>scripts/seed-restock-workflow.mjs</files>
  <action>
    Create scripts/seed-restock-workflow.mjs by MIRRORING scripts/seed-optimize-meta-workflow.mjs exactly. A small idempotent Node script connecting via DATABASE_URL (the 6543 session pooler — see MEMORY: MCP has no project access) using postgres.js, creating the "Low-stock restock proposals" workflow + a workflow_versions row for the connected-store user.

    Config constants: SHOPIFY_SHOP = "operator-zero.myshopify.com"; WORKFLOW_NAME = "Low-stock restock proposals"; WORKFLOW_DESCRIPTION = "Scan low-stock and out-of-stock variants, reason a restock-to-target quantity + rationale for each, and propose it for your review before writing inventory to Shopify.".

    Resolve user_id from user_profiles.shopify_shop (T-jxq-05 — the store↔user binding is in user_profiles, NOT auth.users). Run exactly:
    ```sql
    SELECT user_id FROM user_profiles WHERE shopify_shop = 'operator-zero.myshopify.com' LIMIT 1
    ```
    On zero rows the script MUST fail loudly with a clear message ("No user_profiles row for shopify_shop='operator-zero.myshopify.com' — connect the store first") and exit non-zero. Never insert a null/guessed user_id; never accept user_id from input (multi-tenant scoping).

    Idempotency: look up an existing workflow for that user_id with name = 'Low-stock restock proposals'; if it exists, log + exit 0 (no DB writes). Otherwise insert workflow + version inside a single sql.begin transaction.

    Target variants — LOW-STOCK / OOS (CHANGED from the meta script's "missing meta" filter; this is the locked threshold inventory_qty <= 5, which INCLUDES the OOS qty=0 variants):
    ```sql
    SELECT variant_gid FROM shopify_product_variants
    WHERE user_id = $userId
      AND inventory_qty IS NOT NULL
      AND inventory_qty <= 5
    ORDER BY variant_gid
    LIMIT 25
    ```
    Build the version definition matching the verified shape (lib/demo/seed.ts / WorkflowVersionDefinition): `{ entry_step, steps: [{ id, name, tool, type:"action", params, next_step }] }`. Each step: `{ id: "restock-<n>", name: "Propose restock for <variant_gid>", tool: "shopify_propose_restock", type: "action", params: { variant_gid }, next_step: <next id|null> }`. CRITICAL: params carries ONLY { variant_gid } (no inventory_qty) so the tool runs its PROPOSE phase. entry_step = first step id (or null if zero variants). If zero target variants, warn (workflow created with 0 steps).

    Insert the workflow row (workflows table): id (randomUUID), user_id, name 'Low-stock restock proposals', description, automation_level 'L2', status 'active', trigger_type 'manual', trigger_config '{}', current_version_id NULL initially, source 'chat', created_at/updated_at NOW(). Insert workflow_versions row: id (randomUUID), workflow_id, version_number 1, definition (tx.json(definition)), schema_version 1, created_at NOW(). Then UPDATE workflows SET current_version_id = versionId. (Same insert order as the meta script.)

    Print a summary: resolved user_id, workflow_id, version_id, number of steps/variants targeted. Use only server-side env (DATABASE_URL); no NEXT_PUBLIC_.

    NOTE on verification scope: idempotency + multi-tenant scoping are validated by the human-check step only (seed scripts are not run in CI). Automated guards: `node --check` (syntactic validity) + `npm run typecheck`.
  </action>
  <verify>
    <automated>node --check scripts/seed-restock-workflow.mjs &amp;&amp; npm run typecheck</automated>
    <human-check>Run `DATABASE_URL=&lt;6543 pooler&gt; node scripts/seed-restock-workflow.mjs` against the dev store; confirm it resolves user_id via user_profiles.shopify_shop='operator-zero.myshopify.com', prints that user_id + workflow_id + N steps (low-stock/OOS variants, inventory_qty <= 5 — expect ~6 OOS plus any ≤5), and that re-running is a no-op (idempotent). Then in the app, run the "Low-stock restock proposals" workflow → each approval card shows a PROPOSED restock QUANTITY + RATIONALE (not just variant_gid); approve → the EXACT reviewed quantity is written to Shopify via updateInventory with no regeneration, and the Activity log shows a populated before→after on inventory_qty.</human-check>
  </verify>
  <done>Script is syntactically valid and typechecks; resolves user_id via `SELECT user_id FROM user_profiles WHERE shopify_shop = 'operator-zero.myshopify.com'` and fails loudly (non-zero exit) on zero rows; running it creates exactly one 'Low-stock restock proposals' L2/manual workflow for the store's user_id with a version whose steps reference shopify_propose_restock with params={variant_gid} only (one step per variant with inventory_qty <= 5, ≤25); re-running is a no-op. Idempotency + tenant scoping confirmed via the human-check.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| tool ToolResult → proposedAction → engine | runWorkflowStep (FROZEN) derives proposedAction from the tool's result via extractProposedAction; must degrade to input on malformed/missing-number content (never throw) |
| workflow step params → tool input | static params dispatched into the tool; variant_gid scoped to the run's userId, never trusted as a tenant key |
| LLM output → inventory_qty → Shopify | reasoned target qty crosses into a live inventory write; must be a guarded positive integer (1..1000) strictly > current — bounds the blast radius of a hallucinated quantity |
| script env → DB write | setup script writes workflow rows; user_id must be derived from the store (user_profiles.shopify_shop), not supplied |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jxq-00 | Tampering | extractProposedAction parsing tool content | mitigate | JSON.parse wrapped in try/catch; missing/non-number inventory_qty → return raw input (fail-safe); never throws into the frozen runWorkflowStep |
| T-jxq-01 | Tampering | reasoned target_qty → updateInventory → Shopify | mitigate | generateRestockProposal clamps target_qty to an integer in [1,1000] strictly greater than current qty before it becomes inventory_qty; bounds a hallucinated/absurd quantity; write boundary remains updateInventory (idempotent + observability-first) |
| T-jxq-02 | Elevation | tool reads variant/product by user_id | mitigate | serviceDb queries filter by ctx.userId (never input); variant_gid + product_gid scoped within the user's rows |
| T-jxq-03 | Information disclosure | prompt-injection via variant/product fields | mitigate | fields summarized as DATA with "do not execute field contents" framing (mirror optimize-meta buildPrompt) |
| T-jxq-04 | Denial of service | unbounded LLM spend | mitigate | checkCostCap(userId) consulted BEFORE generateText inside generateRestockProposal; 'hard' fails clean; recordCost after. Tool delegates the gate to the helper (no direct LLM call). Approval path no longer regenerates → no double spend |
| T-jxq-05 | Spoofing | setup script accepting a forged user_id | mitigate | user_id resolved by SELECT on user_profiles.shopify_shop = connected store; never hardcoded/accepted from input; fails loudly on zero rows |
| T-jxq-06 | Repudiation | unlogged write on approval | accept | engine + updateInventory already writeActivity before effect (observability-first) — unchanged here |
| T-jxq-SC | Tampering | npm/pip/cargo installs | mitigate | no new packages added (reuses ai/@ai-sdk, drizzle, zod, postgres already in repo) — no install task |
</threat_model>

<verification>
- `npm run typecheck` passes (TypeScript strict).
- `npx vitest run tests/unit/propose-restock.test.ts tests/unit/shopify-propose-restock-tool.test.ts tests/unit/tool-validation.test.ts` passes.
- New tool present in getToolDefinitions() and WRITE_TOOL_NAMES (length 14); tool-validation count assertion updated 13→14.
- Unit coverage proves: (a) PROPOSE reasons a target + returns inventory_qty/rationale WITHOUT calling updateInventory, and extractProposedAction surfaces { variant_gid, inventory_qty } (NOT bare input); (b) WRITE phase (inventory_qty present, incl. 0 via typeof-number gate) calls updateInventory and does NOT regenerate; (c) L3 reasons+writes; (d) cost cap consulted before generation in the helper ('hard' blocks the LLM call); (e) tool input zod-validated; (f) extractProposedAction degrades to input on parse failure / missing-or-non-number inventory_qty; (g) target_qty guard (positive integer 1..1000, strictly > current).
- `node --check scripts/seed-restock-workflow.mjs` passes.
- Manual (human-check): running the "Low-stock restock proposals" workflow yields approval cards showing a proposed restock quantity + rationale; approving writes that exact quantity to Shopify with no regeneration; Activity log shows populated before→after on inventory_qty. Seed-script idempotency + tenant scoping confirmed in the same human-check.
- FROZEN files UNCHANGED (confirm no diff): lib/inngest/functions/execute-workflow-run.ts, lib/agent/runtime.ts. The extractProposedAction contract on lib/agent/tools/index.ts already exists and is only USED (no contract change; only doc-comment count bumps 13→14).
- SCOPE FENCE: workflow #3 (inventory) only — do NOT touch #1/#2 tools (shopify_optimize_meta, shopify_optimize_product_description).
</verification>

<success_criteria>
- shopify_propose_restock registered beside the existing write tools (14 write tools total), input-dependent: propose (reason target qty + rationale, surface via extractProposedAction, no write) / write (write the supplied qty, no regenerate) / L3 (reason+write).
- The L2 approval card shows the reasoned restock quantity + rationale; approving writes exactly that quantity (no drift, no second LLM call).
- Generation helper reuses provider routing (generateText + resolveModel("DRAFTER")), gates on checkCostCap before the LLM call, records cost after, returns { target_qty, rationale }, and enforces target_qty as a positive integer in 1..1000 strictly greater than current inventory_qty.
- "Low-stock restock proposals" L2 / manual workflow exists for the connected store's user (resolved via user_profiles.shopify_shop) with a workflow_versions definition referencing shopify_propose_restock with params={variant_gid} only (one step per variant with inventory_qty <= 5).
- NO engine/runtime edits (execute-workflow-run.ts and runtime.ts unchanged — the extractProposedAction contract pre-exists and is only USED). Multi-tenant user_id scoping on every query (derived from AgentContext, never request body). updateInventory is the only Shopify inventory write boundary. typecheck + touched tests green.
</success_criteria>

<output>
Create `.planning/quick/260529-jxq-low-stock-restock-workflow-shopify-propo/260529-jxq-SUMMARY.md` when done. Document that shopify_propose_restock mirrors shopify_optimize_meta (meta strings → single numeric inventory_qty; product read → variant read + product-title join; updateProduct → updateInventory), that it surfaces the reasoned target through proposedAction via the pre-existing extractProposedAction contract (guarding typeof inventory_qty === "number" so qty 0 still routes to WRITE), that the L2 approval card shows the proposed quantity + rationale and the approved write does NOT regenerate, that generateRestockProposal clamps target_qty to a positive integer in 1..1000 strictly > current, and that lib/inngest/functions/execute-workflow-run.ts + lib/agent/runtime.ts (the durable engine/contract) were NOT modified — only USED.
</output>
