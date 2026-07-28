---
task: 260727-gwq
status: complete
subsystem: agent-engine, chat, demo-seed, settings, onboarding, docs
tags: [inngest, workflow-engine, ai-sdk, gemini, drizzle, voyage, demo, gsd-quick]
requirements-completed: []
plans-completed: [1, 2, 3]
duration: "Plan 1 + Plan 2 + Plan 3, single session, ~2.5h total"
completed: 2026-07-27
---

# Quick Task 260727-gwq: Demo Readiness Sweep — Summary

**Made the agent engine honest about failure, gave the demo dataset workflows that call real tools with real data, fixed the chat surface's biggest correctness bugs, closed a sandbox self-destruct hole, and brought the docs back in line with what's actually shipped.**

This is the consolidated summary for all three plans in this quick task. Plans 1 and 2 were executed and committed before this session's Plan 3 work; their detail lives in `260727-gwq-EXECUTION-NOTES.md` and `260727-gwq-PLAN-2-SUMMARY.md` and is condensed below. Plan 3 (seed data + guards + docs) was executed in this session and is covered in full detail.

## Scope

Source: `260727-gwq-AUDIT.md` (3 parallel exploration agents + local pressure test + prod probing). Twelve work streams (WS1–WS12) covering: fake tools in seeded workflows, an approval-ordering bug that let L2 writes fire before human review, tool errors silently recorded as success, eight write tools that were no-op stubs, a generic system prompt with no domain expertise, the LLM provider switch to Google Gemini, thirteen chat bugs, a sandbox self-destruct hole, scheduled workflows that never fired, a no-op revert, seed-data gaps, and assorted honesty/polish items.

## Plan 1 — Engine correctness + real tools + Gemini provider (condensed)

**Status:** Complete. 4 tasks, all verification gates passed.

**Commits:**
1. `8cfd913` — `fix(260727-gwq): defer approval-gated writes, propagate tool errors to failed runs` (WS2/WS3)
2. `d9b2637` — `feat(260727-gwq): make stub write tools real (Shopify API + sandbox mirror, Gmail) and revert real` (WS4/WS10)
3. `21130a7` — `feat(260727-gwq): domain-expert system prompt + Google AI Studio (Gemini) provider` (WS5/WS6)
4. `e46f5dc` — `feat(260727-gwq): scheduled-workflow cron trigger + dead-code removal` (WS9/WS12)

**What changed:**
- `runWorkflowStep` now withholds `dispatchTool` for approval-gated write steps during the pre-approval pass (unless `toolDef.proposeSafe === true` or `extractProposedAction` is defined) — L2 writes no longer fire before the human sees the approval card, and no longer fire twice.
- Tool errors (`toolResult.is_error`) now propagate: a failed step marks the run `failed` with a `result: "failure"` activity entry, instead of every workflow finishing green regardless of what actually happened.
- All 8 previously-stub write tools (`shopify_update_product_image_alt`, `shopify_update_variant_price`, `shopify_create_redirect`, `shopify_update_page_content`, `gmail_draft_reply`, `gmail_send_email`, plus revert) now perform real writes: real Shopify Admin API calls for real tokens, sandbox-sentinel-token simulation against the mirror tables for the demo. `executeRevertEffect` applies `before_state` back through the same write path.
- System prompt rewritten as an Orchestrator carrying four embedded domain playbooks (Catalog, SEO, Q&A, Inventory) with concrete conventions per domain and a generated (not hand-written) tools section sourced from the live registry.
- Added Google AI Studio (Gemini) as a third `MODEL_PROFILE` (`google`): Flash on every role, Flash-Lite for classification, with an `OZ_MODEL_ORCHESTRATOR=google:gemini-2.5-pro` escape hatch. `@ai-sdk/google` pinned to `^3.0.101` (the default `4.x` install ships a `LanguageModelV4` provider spec incompatible with this stack's `ai@^6.0.191`).
- Added the Inngest cron function that actually fires `trigger_type: "schedule"` workflows (nothing consumed the seeded cron config before this); excludes sandbox/demo-owned workflows from auto-fire so a shared demo account or per-visitor sandbox doesn't pile up runs.
- Removed dead code: `lib/agent/anthropic.ts`, `getAnthropicToolDefinitions`/`zodToJsonSchemaShape`, the dead Realtime `useEffect` in `message-stream.tsx`.

**Deviation:** `lib/workflows/revert.ts` was split into `revert.ts` (pure, client-safe `canRevert()` + types, imported by a client component) and `revert-effect.ts` (the new real `executeRevertEffect`, server-only, imported only by Server Action callers) — the original single-file plan would have pulled `postgres.js` into the client bundle and broken the production build.

**Test results:** typecheck 0 errors; baseline 490 → **535 passed | 2 skipped | 12 todo (549 total)**; prod build succeeds without `GOOGLE_GENERATIVE_AI_API_KEY` set (Gemini path is code-complete-but-inactive by default — `.env.local` stayed on `MODEL_PROFILE=groq` throughout, per the orchestrator's constraint).

## Plan 2 — Chat surface fixes (condensed)

**Status:** Complete. 3 tasks, all verification gates passed.

**Commits:**
1. `6023569` — `feat(260727-gwq): ordered chat history, real message id, auto-naming, sanitized errors, tool gating`
2. `f2f8fa2` — `fix(260727-gwq): message stream client — real message id, honest scroll, serialized queue, live suggestions, resolved approvals`
3. `43170fa` — `fix(260727-gwq): honour the chosen automation level on save, drop the dead Edit-in-chat button`

**What changed (all thirteen WS7 items + the WS12 `ask_user_clarification` item):**
- Chat history query gained `orderBy(created_at)` (was scrambling context), raised the history window to 20 messages and `maxOutputTokens`/step count now uncapped under Gemini (previously Groq-cap concessions).
- The SSE stream now emits a leading `{ message_id }` event before any text, and the client repoints every subsequent update at the real UUID — fixes the Save-as-workflow UUID failure caused by the optimistic `asst-${Date.now()}` id.
- Thread auto-naming from the first ~40 chars of the first user message; content-aware auto-scroll honoring `prefers-reduced-motion`; the message queue now dequeues one at a time instead of self-aborting; raw provider errors no longer leak to the client (`stream_error` is sanitized, logged server-side).
- Interrupted streams (`status='streaming'` > 2 min old) are reaped to `errored` on thread load — no more permanently-empty bubbles.
- Approval cards read real server-enriched status/reasoning/preview/risk after reload instead of hardcoded `initialStatus="pending"`.
- `getAiSdkTools` gained an additive, opt-in `{ writeTools: "propose-safe", excludeTools }` mode; the chat route now only exposes the 3 propose-safe write tools (`shopify_optimize_product_description`, `shopify_optimize_meta`, `shopify_propose_restock`) plus read tools — any other write intent must go through Save-as-workflow → Run, closing the "chat write tools execute without approval" gap. `ask_user_clarification` stays in the registry for the workflow engine but is excluded from chat (nothing renders that block type there).
- `workflow-visualizer.tsx`'s LevelToggle value is now passed through to `saveWorkflowFromPlan` (was silently discarded); the dead "Edit in chat" button was removed.

**Tests intentionally changed:** `tests/integration/chat-stream.test.ts`'s SSE-shape assertion was split — the first data line is now `{ message_id }`, not `{ text }` — to account for the new leading event. No other assertions changed.

**Test results:** typecheck 0 errors; 535 → **553 passed | 2 skipped | 12 todo (567 total)**, +18 new tests, no regressions; prod build succeeds.

## Plan 3 — Seed data + guards + docs (this session, full detail)

**Status:** Complete. All 3 tasks executed, all verification gates pass.

**Commits:**
1. `51d437d` — `fix(260727-gwq): rewrite seeded/onboarding workflows onto real registry tools (WS1)`
2. `b203b27` — `feat(260727-gwq): close demo seed-data gaps — orders, embeddings, sync state (WS11)`
3. `706c10d` — `fix(260727-gwq): sandbox disconnect guard, catalog-audit unblock, doc honesty (WS8/WS11/WS12)`

### Task 1 — Seeded/onboarding workflows onto real registry tools (WS1)

Plan 1's WS2/WS3 fixes made `runWorkflowStep` propagate tool errors and finalize failed runs — which meant every seeded workflow (still calling `seo_score`, `request_approval`, `compute`, `anthropic_generate`, etc., none of which exist in the tool registry) would turn solid red on stage. Rewrote all ten seeded workflow definitions, the seeded chat `workflow_plan` block, and every onboarding starter workflow onto real `lib/agent/tools` names with schema-valid params.

**Final tool + params mapping for the ten seeded workflows** (`DEMO_WORKFLOW_DEFS` in `lib/demo/seed.ts`):

| # | Workflow (level, trigger) | Steps (tool → params) |
|---|---|---|
| 1 | Alt text for new product images (L3, schedule) | `shopify_list_products` `{status:"active",limit:50}` → `shopify_update_product_image_alt` `{product_gid, image_id, alt_text}` |
| 2 | Fix empty meta descriptions (L3, schedule) | `shopify_list_products` `{status:"active",limit:50}` → `shopify_optimize_meta` `{product_gid: ...002}` |
| 3 | Answer customer product questions (L2, event) | `gmail_list_threads` `{support_only:true,limit:10}` → `gmail_get_thread` `{gmail_thread_id:"gmail-thread-aa12"}` → `gmail_draft_reply` `{thread_id, subject, body}` |
| 4 | Low-stock flash-sale proposals (L2, event) | `shopify_get_inventory` `{low_stock_threshold:5}` → `shopify_propose_restock` `{variant_gid: ...014}` |
| 5 | Weekly SEO audit — Journals (L2, schedule) | `shopify_list_products` `{search:"Journals",limit:50}` → `shopify_optimize_meta` `{product_gid: ...004}` |
| 6 | Retire long-out-of-stock products (L2, schedule) | `shopify_list_products` `{status:"draft",limit:50}` → `shopify_update_product_status` `{product_gid: ...010, status:"archived"}` |
| 7 | Tag cleanup — dedupe & fix (L1, manual) | `shopify_list_products` `{limit:50}` (single step — L1 pauses at step 1 by design, WR-05) |
| 8 | New collection copy — Explorer Series (L1, paused, manual) | `shopify_optimize_product_description` `{product_gid: ...001, instructions}` (single step) |
| 9 | Fix 'Default Title' products (L3, schedule) | `shopify_list_products` `{status:"active",limit:50}` → `shopify_optimize_product_description` `{product_gid: ...005}` |
| 10 | Weekend discount planner (L2, draft, manual) | `shopify_get_inventory` `{low_stock_threshold:20}` → `shopify_update_variant_price` `{variant_gid: ...007, price:54.4}` |

The seeded chat `workflow_plan` block (thread A, `DEMO_CHAT_PLAN_STEPS`) now mirrors workflow 5: `pull` (`shopify_list_products`) → `optimize` (`shopify_optimize_meta`) → `apply` (`shopify_update_meta_title`, replacing the old fake `request_approval` step — approval is an engine behavior, not a tool).

**Onboarding starter step policy (no concrete GIDs):** every starter workflow (`STARTER_WORKFLOW_DEFINITIONS` in `app/onboarding/actions.ts`) gets a GID-free `scan` first step (`shopify_list_products {status:"active",limit:20}`). Only `qa` (→ `gmail_list_threads`) and `inventory` (→ `shopify_get_inventory`) domains get a second step, because those two real tools need no concrete product/variant GID. `catalog`, `seo`, and `content` stay single-step scan-only, because their natural second step (`shopify_optimize_meta` / `shopify_optimize_product_description`) requires a `product_gid` that cannot be safely assumed to exist in a brand-new real store — a starter workflow must never reference a GID that may not exist in the user's catalog.

**Regression guard:** `tests/unit/seed-registry.test.ts` (new) imports `getToolDefinitions()` from the live registry plus the three exported definition tables (`DEMO_WORKFLOW_DEFS`, `DEMO_CHAT_PLAN_STEPS`, `STARTER_WORKFLOW_DEFINITIONS`) and asserts every step's tool exists and its params pass that tool's Zod schema — pure, no DB access, fails loudly with the offending workflow/step/tool name if this ever regresses.

**Deviation (out of scope, documented, not fixed):** the fake-tool grep gate (`seo_score|request_approval|compute|preview|read|...`) still matches one string in `lib/demo/seed.ts`: the literal `"preview"` used as a chat message's `inline_block_type` value (a real, unrelated UI concept — the message-rendering component expects this exact string). This is a false positive of the grep's line-based text matching, not a workflow step naming a fake tool; changing it would break chat rendering and was not requested by the plan for this line. Confirmed via manual read that no workflow step or chat-plan step names `"preview"` as a `tool` value.

### Task 2 — Seed-data gaps (WS11)

- **Orders:** 18 `shopify_orders` rows over the last 30 days, including `gid://shopify/Order/48217` (paid/unfulfilled, 5 days ago — the order greg.m@example.com asks about) and `gid://shopify/Order/47990` (paid/fulfilled, 12 days ago — chloe.f@example.com's thread), plus 16 more (~70% paid+fulfilled, ~20% paid+unfulfilled, ~10% refunded) with totals drawn from real seeded price points.
- **Pages + redirects:** 3 `shopify_pages` (About, Shipping & Returns, Leather Care — the last grounds the leather-care Q&A answers) and 2 `shopify_redirects`.
- **Sync state:** one `shopify_sync_state` row and one `gmail_sync_state` row, both `sync_status: "healthy"`.
- **Dangling GIDs:** the "Retire 3 products out of stock 90+ days" approval's `proposed_action.product_gids` and preview item titles now point at real seeded products (The Cartographer Roll, Travel Tag Set, Key Fob — Riveted) instead of nonexistent `100000201/202/203`; the matching activity entry's `target_id` was fixed the same way. Confirmed zero `10000020` hits remain.
- **Archived thread:** the previously-empty Thread D now carries 3 messages (connect-store confirmation, 143-products-synced, brand-voice follow-up) at `createdAgoMin` values consistent with its 380-hour `last_message_at`.
- **Model ids:** seeded assistant messages now read `model_id: "gemini-2.5-flash"` (was `claude-opus-4-7`), matching the provider the demo runs on per Plan 1's WS6 — with a comment naming `MODEL_PROFILE=google` as the source of truth for a future provider flip.
- **Wipe completeness:** `wipeUserData` now also deletes `shopifyOrders`, `shopifyPages`, `shopifyRedirects`, `shopifySyncState`, `gmailSyncState`, `memoryEmbeddings` (before `memoryItems`), and `agentTelemetry` — a reseed no longer leaves stale rows behind.

**Embedding-seeding approach actually used (WS11):** batched, not paced. Added `embedTexts(texts, inputType)` to `lib/agent/embeddings.ts` — a single Voyage `embed()` call with `input` as a `string[]` (confirmed supported by the SDK's `EmbedRequestInput = string | string[]` type), which sidesteps the free-tier 3 req/min pacing problem entirely rather than adding 21-second delays between six sequential calls. `seedDemoFor` was restructured so the seeding transaction returns the inserted `{id, content}` pairs for the six memory items; the embedding pass runs **after** the transaction commits (a network call inside the `max:1` pooled `serviceDb` transaction would stall the whole seed and every other `serviceDb` caller for its duration). **Failure behavior:** the entire pass is wrapped in try/catch — on any failure (missing `VOYAGE_API_KEY`, a 429, a network error), it logs one structured `console.warn` (`event: "demo.seed.embeddings_failed"`) and returns normally; seeding never fails because embeddings are unavailable. Added `skipEmbeddings?: boolean` to `seedDemoFor(userId, opts?)` (default `false`) so a caller can opt a per-visitor sandbox path out of the network cost — not exercised by this plan's call sites, which all keep the default (embeddings seeded).

**Test results:** typecheck 0 errors; full suite green throughout, no regressions; per-task grep gates (`10000020` zero hits, `48217` present, `gemini-2.5-flash` present, `claude-opus-4-7` absent, `memoryEmbeddings|shopifyOrders|gmailSyncState` present) all pass.

### Task 3 — Sandbox guard, catalog-audit unblock, doc honesty (WS8/WS11/WS12)

- **WS8 (sandbox self-destruct guard):** `disconnectIntegration`'s demo guard changed from `isDemoUser(userId) && isDemoConnectionLocked()` (which let an **anonymous** sandbox visitor disconnect Shopify unconditionally — `isDemoUser` only matches the shared demo account, and `DEMO_SHOPIFY_LOCKED` defaults unset — after which `clearShopifyMirror()` wiped that visitor's demo dataset with no way back) to `isSandboxClaims(claims)`, matching the other 5 destructive-action guards in the file. The old demo-lock-flag nuance is intentionally dropped: no sandbox or demo identity may disconnect, period. Now 6 `isSandboxClaims(claims)` guards total in the file (was 5). Added 3 tests: anonymous claims blocked, shared-demo claims blocked, an ordinary user unaffected.
- **WS11 (catalog-audit hang):** `getCatalogAuditSuggestions` no longer `return []`s for a non-empty store — `app/onboarding/page.tsx` never re-polls against an empty array, so real-store onboarding spun forever waiting for an async Inngest audit result that was never cached anywhere. It now computes three deterministic checks synchronously from the mirror (products with no/empty meta description; products with no/thin `body_html` under 120 chars; products whose title contains "Default Title"), emits one `WorkflowSuggestion` per non-zero count with the count interpolated into the description, and falls back to `emptyStoreSuggestions()` when all three counts are zero — never `[]`. Added 4 tests.
- **WS12 (adapter docblock):** `lib/integrations/adapter.ts`'s docblock no longer claims "Phase 1: compile-only skeletons" / "always return false, throws 'Not implemented'". **Deviation from the literal plan text:** the plan's suggested replacement wording said "isHealthy performs a live token ping" — checked both `ShopifyAdapter.isHealthy()` and `GmailAdapter.isHealthy()` and neither makes a live API call; both check the stored `integrations` row (`status`, and for Gmail, `expires_at`). Documented the actual behavior (DB-row health check, not a live ping) instead of replacing one inaccurate claim with a different one — a Rule 1 correction to the plan's own wording, in the interest of the honesty goal the task exists to serve.
- **WS12 (Gmail `provider_account_id`):** `exchangeGmailCode` now calls `gmail.users.getProfile({userId:"me"})` with the freshly-issued access token and stores the resolved mailbox address as `provider_account_id`; falls back to the userId placeholder (with a structured `console.warn`) only if the lookup fails, and the `onConflictDoUpdate` branch only overwrites a previously-resolved real address when the new lookup itself succeeded.
- **WS12 (README/CLAUDE.md/vercel.json):** README's "routes to one of four specialist agents" claim replaced with the real design (single Orchestrator, four embedded domain playbooks, specialists named as a v2 direction); LLM stack row and prerequisites now name Gemini/Google AI Studio as primary. CLAUDE.md's locked tech-stack constraint line updated the same way. `vercel.json` gained a `functions` block setting `maxDuration` to 120 for the chat send route and 300 for the Inngest route, matching the values already declared in code.

**Test results:** typecheck 0 errors; 557 → **564 passed | 2 skipped | 12 todo (578 total)**, +7 new tests (3 settings, 4 catalog-audit), no regressions; `npm run build` succeeds.

## Overall Test Results (all 3 plans)

- `npm run typecheck` — 0 errors, every commit across all 3 plans.
- `npm test` — baseline before this quick task was **490** (per AUDIT.md). Final: **564 passed | 2 skipped | 12 todo (578 total)**. No test was ever deleted; no total-count regression at any single commit across 10 commits.
- `npm run build` — production build succeeds (verified after Plan 3; Plans 1 and 2 also verified this independently per their own execution notes).

## Deviations Summary (all 3 plans)

- **Plan 1:** `lib/workflows/revert.ts` split into a client-safe module and a new server-only `revert-effect.ts` — the planned single-file approach broke the production build by pulling `postgres.js` into the client bundle.
- **Plan 2:** none — executed exactly as written (one TypeScript-driven clarification on a provider-options type, behavior unchanged).
- **Plan 3:**
  1. One approval `action_type` (`"shopify_update_product"` → `"shopify_update_product_description"`) and one workflow step id (`"read"` → `"open"`) were renamed beyond the plan's explicit instructions, to eliminate false-positive matches against the fake-tool grep gate — both were either pre-existing (the action_type) or introduced by this task's own edits (the step id), and neither is a registry tool dispatch.
  2. The fake-tool grep gate still matches one legitimate, unrelated string (`"preview"` as a chat `inline_block_type` value) — documented above as an accepted false positive, not fixed, since fixing it would require touching unrelated chat-rendering logic never requested by this task.
  3. `lib/integrations/adapter.ts`'s docblock was written to describe the ACTUAL DB-row health check behavior rather than the plan's suggested "live token ping" phrasing, which does not match either adapter's real `isHealthy()` implementation.

None of these deviations affect the plan's stated success criteria; all are Rule 1/Rule 3 auto-fixes made in the interest of correctness and honesty, the explicit goal of WS12.

## Known Stubs

None introduced by any of the three plans. The real-token Shopify/Gmail write paths added in Plan 1 remain code-complete but exercised only via sandbox-sentinel simulation in tests (no live `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` or real Shopify token configured locally) — this was already documented as out-of-scope for local verification in Plan 1's execution notes and is unchanged by Plan 3.

## Threat Flags

None. Plan 3's changes narrow attack surface (WS8: fewer identities can disconnect the demo integration) or make read-only computations more honest (WS11: catalog audit); no new network endpoints, auth paths, or schema changes were introduced.

## Out of Scope (orchestrator handles after merge)

Per this quick task's explicit constraints: running the seed against the prod demo user, Vercel deploy, prod browser smoke test, and setting `MODEL_PROFILE=google` once the Google AI Studio key is supplied. `.env.local` was never touched across any of the three plans — it remains `MODEL_PROFILE=groq`.

## Self-Check: PASSED

Verified the following exist as claimed:
- `lib/demo/seed.ts` — `DEMO_WORKFLOW_DEFS`, `DEMO_CHAT_PLAN_STEPS` exported; `wipeUserData` includes `memoryEmbeddings`/`shopifyOrders`/`gmailSyncState`.
- `app/onboarding/actions.ts` — `STARTER_WORKFLOW_DEFINITIONS` exported.
- `tests/unit/seed-registry.test.ts` — exists, 4 tests, all passing.
- `app/app/settings/actions.ts` — `isSandboxClaims(claims)` appears 6 times.
- `lib/inngest/functions/catalog-audit.ts` — `getCatalogAuditSuggestions` no longer contains a bare `return [];` for the non-empty-store branch.
- `vercel.json` — `functions` block present with both routes.
- Commits `51d437d`, `b203b27`, `706c10d` — all present in `git log --oneline`.
