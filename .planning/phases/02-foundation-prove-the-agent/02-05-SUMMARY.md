---
phase: "02-foundation-prove-the-agent"
plan: "05"
subsystem: "agent-runtime"
tags: ["agent", "prompt", "memory", "tools", "cost-cap", "pgvector", "zod", "upstash"]
dependency_graph:
  requires: ["02-02", "02-03"]
  provides: ["02-06", "02-07"]
  affects: ["lib/agent/runtime.ts", "lib/agent/prompt.ts", "lib/agent/memory.ts", "lib/agent/tools/", "lib/cost-cap.ts"]
tech_stack:
  added: []
  patterns:
    - "buildSystemPrompt: 6-section assembly with token-budget truncation (oldest dropped first)"
    - "pgvector cosineDistance via Drizzle for semantic memory recall (HNSW index)"
    - "dispatchTool: Zod safeParse as the only entry point to tool execute() — never throws"
    - "checkCostCap + recordCost: Upstash Redis incrbyfloat with 25h TTL (oz:cost:{userId}:{YYYY-MM-DD})"
    - "classifyAgentError: Anthropic.APIError status → auth_error/transient/budget_exhausted; unknown rethrown"
key_files:
  created:
    - "lib/agent/prompt.ts"
    - "lib/agent/memory.ts"
    - "lib/agent/tools/index.ts"
    - "lib/agent/tools/read/index.ts"
    - "lib/agent/tools/write/index.ts"
    - "lib/agent/tools/meta.ts"
    - "lib/cost-cap.ts"
    - "lib/agent/runtime.ts"
  modified:
    - "tests/unit/prompt-builder.test.ts"
    - "tests/unit/agent-memory.test.ts"
    - "tests/unit/tool-validation.test.ts"
    - "tests/unit/agent-errors.test.ts"
    - "tests/unit/cost-cap.test.ts"
decisions:
  - "[02-05] Anthropic.APIStatusError does not exist in SDK v0.97.1 — use Anthropic.APIError (base class) with .status property"
  - "[02-05] vi.hoisted() used for cost-cap mock functions (not top-level const) to avoid vi.mock factory hoisting race"
  - "[02-05] assemblePrompt is a pure function accepting PromptContext — buildSystemPrompt is the async pipeline wrapper; this keeps snapshot tests LLM-free"
  - "[02-05] dispatchTool does NOT check approvalRequired — that gate is the workflow engine's (02-07) responsibility"
  - "[02-05] recallMemory joins memoryEmbeddings to memoryItems for soft-delete filtering; T-2-05-04 user_id filter on both tables"
metrics:
  duration: "14 minutes"
  completed_date: "2026-05-22"
  tasks: 3
  files: 13
---

# Phase 02 Plan 05: Shared Agent Runtime Summary

**One-liner:** JWT-authenticated agent runtime with 6-section prompt assembly (15k/20k token budget), 22-tool Zod-validated catalog (11 read + 11 write + 5 meta), pgvector semantic memory recall, Anthropic error classification, and per-user daily cost cap via Upstash Redis.

## What Was Built

### Task 1: Prompt Construction + Memory (AGENT-01, AGENT-05)

**lib/agent/prompt.ts**
- `assemblePrompt(ctx, opts?)` — pure function: 6 ordered sections (SYSTEM ROLE, STORE CONTEXT, BRAND VOICE, MEMORY, SEMANTIC RECALL, TOOLS), budget enforcement
- `buildSystemPrompt(userId, query?, opts?)` — async pipeline: loads all sections in parallel, calls `recallMemory` for semantic context
- Token budget: `CHAT_TOKEN_BUDGET = 15,000` / `WORKFLOW_TOKEN_BUDGET = 20,000`
- Truncation order: oldest memory items dropped first, then lowest-similarity recalls; system role + brand voice never dropped
- `estimateTokens(text)` — char/4 heuristic for budget enforcement

**lib/agent/memory.ts**
- `storeMemoryItem(userId, content, category)` — inserts memory_items + memory_embeddings with Voyage `voyage-4` embedding (1024 dims, inputType="document")
- `updateMemoryItem(userId, id, content)` — updates content + re-embeds in both tables (user-scoped, T-2-05-04)
- `softDeleteMemoryItem(userId, id)` — sets `soft_deleted_at` timestamp; row excluded from recall; hard deletion via nightly job
- `recallMemory(userId, query, topK=5)` — embeds query (inputType="query"), queries memory_embeddings HNSW via Drizzle `cosineDistance`, joins to memory_items to filter soft-deleted, returns items ordered by similarity (1 - cosineDistance)

### Task 2: Tool Catalog (AGENT-02, AGENT-03, AGENT-04)

**lib/agent/tools/read/index.ts** — 11 always-safe read tools:
`shopify_list_products`, `shopify_get_product`, `shopify_list_orders`, `shopify_get_inventory`, `shopify_list_pages`, `shopify_list_redirects`, `gmail_list_threads`, `gmail_get_thread`, `recall_memory`, `search_activity`, `get_brand_voice`

**lib/agent/tools/write/index.ts** — 11 write tools with `approvalRequired` gate:
`shopify_update_product_description`, `shopify_update_meta_title`, `shopify_update_meta_description`, `shopify_update_product_image_alt`, `shopify_update_product_status`, `shopify_update_variant_price`, `shopify_update_variant_inventory`, `shopify_create_redirect`, `shopify_update_page_content`, `gmail_draft_reply`, `gmail_send_email`

**lib/agent/tools/meta.ts** — 5 meta tools:
`record_memory_item`, `update_memory_item`, `soft_delete_memory_item`, `propose_workflow_plan`, `ask_user_clarification`

**lib/agent/tools/index.ts**
- `getToolDefinitions()` — lazily-built registry (name → ToolDefinition)
- `dispatchTool(name, input, ctx)` — Zod safeParse before execute; returns correctable tool_result error on failure; never throws (T-2-05-01)
- `getAnthropicToolDefinitions(includeWriteTools)` — Anthropic-format tool shapes; write tools omitted on hard cap
- `READ_TOOL_NAMES`, `WRITE_TOOL_NAMES`, `META_TOOL_NAMES` — exported arrays

### Task 3: Runtime Error Classification + Cost Cap (AGENT-06, AUTH-07)

**lib/cost-cap.ts**
- `checkCostCap(userId)` → `'ok' | 'soft' | 'hard'` (read-only Redis query)
- `recordCost(userId, costUsd)` — atomic Redis `incrbyfloat` + 25h TTL on first write
- Key format: `oz:cost:{userId}:{YYYY-MM-DD}`
- `SOFT_CAP_USD` / `HARD_CAP_USD` — env-overridable, default $5 ([ASSUMED] placeholder, RESEARCH.md A4)

**lib/agent/runtime.ts**
- `classifyAgentError(err)` → `{ type: 'auth_error' | 'transient' }` or rethrow
  - 401 → auth_error; 529/503/429/5xx → transient; unknown → rethrow
  - Uses `Anthropic.APIError` (not `APIStatusError` — that class doesn't exist in SDK v0.97.1)
- `streamChat(ctx)` — checks cost cap → builds prompt (injects warning on soft) → strips write tools on hard → streams via `anthropic.messages.stream` → records cost
- `runWorkflowStep(ctx)` — single tool dispatch; throws budget error on hard cap

## Test Results

| File | Tests | Status |
|------|-------|--------|
| tests/unit/prompt-builder.test.ts | 9 | PASS |
| tests/unit/agent-memory.test.ts | 9 | PASS |
| tests/unit/tool-validation.test.ts | 13 | PASS |
| tests/unit/agent-errors.test.ts | 9 | PASS |
| tests/unit/cost-cap.test.ts | 11 | PASS |
| Full suite (`npx vitest run`) | 204 | PASS (0 failures) |

`npx tsc --noEmit` — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Anthropic.APIStatusError does not exist in SDK v0.97.1**
- **Found during:** Task 3 test execution
- **Issue:** Test scaffold used `Anthropic.APIStatusError` constructor which does not exist. SDK exports `Anthropic.APIError` (base class) with a `.status` property.
- **Fix:** Updated both `classifyAgentError` in runtime.ts and test helper to use `Anthropic.APIError`. Updated type annotation to `InstanceType<typeof Anthropic.APIError>`.
- **Files modified:** `lib/agent/runtime.ts`, `tests/unit/agent-errors.test.ts`
- **Commit:** c917e71

**2. [Rule 1 - Bug] vi.mock hoisting race in cost-cap.test.ts**
- **Found during:** Task 3 test execution
- **Issue:** Top-level `const mockGet = vi.fn()` referenced inside `vi.mock()` factory, which is hoisted above the declaration, causing `ReferenceError: Cannot access 'mockGet' before initialization`.
- **Fix:** Used `vi.hoisted()` to declare mock functions before the factory runs.
- **Files modified:** `tests/unit/cost-cap.test.ts`
- **Commit:** c917e71

**3. [Rule 1 - Bug] Prompt truncation test referenced wrong content prefix**
- **Found during:** Task 1 test execution
- **Issue:** Test asserted `"LargeMemoryContentItem 0"` but the content template is `"LargeMemoryContentItem item 0: ..."`.
- **Fix:** Updated assertion to `"LargeMemoryContentItem item 0:"`.
- **Files modified:** `tests/unit/prompt-builder.test.ts`
- **Commit:** ee56c27

**4. [Rule 1 - Bug] Tool validation tests expected is_error=false for empty-DB product lookup**
- **Found during:** Task 2 test execution
- **Issue:** Tests asserted `result.is_error` is falsy for `shopify_get_product` with valid input, but the mock DB returns `[]` so the tool correctly returns "Product not found" error.
- **Fix:** Updated tests to distinguish Zod validation errors from "not found" execution errors.
- **Files modified:** `tests/unit/tool-validation.test.ts`
- **Commit:** 1232608

## Known Stubs

The following items are intentional stubs awaiting downstream wiring:

| Stub | File | Reason |
|------|------|--------|
| `shopify_update_product_image_alt` execute() returns a "queued" response | lib/agent/tools/write/index.ts | Requires `productImageUpdate` Shopify mutation not in mutations.ts (02-07 work) |
| `shopify_update_variant_price` execute() returns a "queued" response | lib/agent/tools/write/index.ts | Requires `productVariantUpdate` Shopify mutation |
| `shopify_create_redirect` execute() returns a "queued" response | lib/agent/tools/write/index.ts | Requires `urlRedirectCreate` Shopify mutation |
| `shopify_update_page_content` execute() returns a "queued" response | lib/agent/tools/write/index.ts | Requires `pageUpdate` Shopify mutation |
| `gmail_draft_reply` / `gmail_send_email` execute() returns a "queued" response | lib/agent/tools/write/index.ts | Gmail write client not yet implemented (02-06/02-07) |
| `loadStoreContext` in prompt.ts uses placeholder shopDomain | lib/agent/prompt.ts | Integrations table query not wired; 02-06 will inject real domain via ChatContext |
| `runWorkflowStep` records a fixed $0.0001 cost | lib/agent/runtime.ts | Actual LLM call cost tracking wired in 02-07 when the full workflow engine is built |

These stubs do not prevent the plan's goal (isolated runtime works in tests). 02-06 and 02-07 complete the wiring.

## Threat Surface Scan

No new security surface beyond what the plan's threat model covers:
- T-2-05-01 (Zod safeParse): implemented in dispatchTool
- T-2-05-02 (cost cap before LLM): implemented in streamChat + runWorkflowStep
- T-2-05-03 (prompt injection): store context is summarized data, not raw HTML
- T-2-05-04 (cross-user recall): all queries include explicit user_id WHERE clause
- T-2-05-05 (write approval gate): approvalRequired exposed on all write tools; enforced by caller

## Self-Check: PASSED

All 8 created files found on disk. All 3 task commits verified in git log:
- ee56c27: feat(02-05): Task 1 — prompt construction + memory
- 1232608: feat(02-05): Task 2 — tool catalog
- c917e71: feat(02-05): Task 3 — runtime error classification + cost cap
