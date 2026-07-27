# Demo-Readiness Audit — Findings (input to plan)

Source: 3 parallel exploration agents + local pressure test + prod probing, 2026-07-27.
Baseline: typecheck ✓, 490 unit tests ✓, prod build ✓. Prod deploy is STALE (older UI copy, old seed with 3 threads).
User decisions (locked): switch LLM provider to **Google AI Studio (Gemini)** via `@ai-sdk/google` (new `MODEL_PROFILE=google`); full scope fix sweep; work routed through GSD quick task.

## WS1 — Seeded demo workflows call nonexistent tools (DEMO-FATAL)
- `lib/demo/seed.ts:620-704`: 6 demo workflows use step tools `seo_score`, `request_approval`, `compute`, `preview`, `read`, `anthropic_generate`, `shopify_update_status`, `shopify_update_product` — NONE exist in the registry (`lib/agent/tools/`). Only `shopify_list_products` is real.
- Same fake tools in the seeded chat `workflow_plan` block at `seed.ts:1557-1570`.
- Combined with WS3 (errors recorded as success), pressing **Run now** on a seeded workflow yields an all-green run where every dispatch returned `Unknown tool`.
- Fix: rewrite seeded workflow definitions using real registry tools (`shopify_list_products`, `shopify_optimize_product_description`, `shopify_optimize_meta`, `shopify_propose_restock`, `shopify_update_variant_inventory`, `gmail_list_threads`, `gmail_draft_reply`, etc.).

## WS2 — L2 approval ordering bug (engine correctness)
- `lib/agent/runtime.ts:133-186` `runWorkflowStep`: calls `dispatchTool` unconditionally (:155), computes `requiresApproval` AFTER (:165). `lib/inngest/functions/execute-workflow-run.ts` then waits for approval and on approve calls `runWorkflowStep` again (:501-511) with `automationLevel:"L3"` → L2 write steps hit Shopify BEFORE the human sees the card, and write twice total.
- Only `shopify_optimize_*`/`shopify_propose_restock` dodge it (internal propose/write branching).
- Fix: in the pre-approval pass, do NOT dispatch approval-gated write tools — produce the proposed action/preview only; dispatch on the post-approval pass only. Keep read tools dispatching normally. Preserve existing Inngest event contract (`approval.resolved`, CEL guards).

## WS3 — Tool errors recorded as success
- `runWorkflowStep` never inspects `toolResult.is_error`; `dispatchTool` never throws by design (`lib/agent/tools/index.ts:135-174`). Failed steps → `writeActivity(result:"success")` (`execute-workflow-run.ts:544`) → run `succeeded` (:557).
- Fix: propagate `is_error` → mark step failed, write activity with `result:"failure"` + error summary, finalize run `failed`. Also fix G8: if `runWorkflowStep` throws, run row stays `running` forever — add terminal failure write (Inngest `onFailure` or try/catch).

## WS4 — 8 stub write tools that lie (`lib/agent/tools/write/index.ts`)
Stubs returning `ok:true` with zero effect: `shopify_update_product_image_alt` (:180), `shopify_update_variant_price` (:253), `shopify_create_redirect` (:323), `shopify_update_page_content` (:354), `gmail_draft_reply` (:384), `gmail_send_email` (:415).
- Shopify ones: wire through `lib/integrations/shopify/mutations.ts` pattern — real API call for real tokens, mirror-table simulation for sentinel token (see `mutations.ts:170-229` updateProduct and `:422-465` updateInventory for the pattern, incl. `backfillAfterState`). Mirror tables: `shopify_products` (image alt / price via `shopify_product_variants`), `shopify_redirects`, `shopify_pages`.
- Gmail: implement real draft/send via googleapis (`lib/integrations/gmail/client.ts` has `createGmailClient`; add `createDraft`/`sendReply` functions with idempotency) AND a sentinel-token simulation branch that writes an outbound `gmail_messages` row (so the demo shows the drafted/sent reply in the mirror). Never return "sent" without one of those actually happening.
- Note: `GOOGLE_CLIENT_ID/SECRET` are not configured locally — real-token path must be code-complete but demo path is the sentinel simulation.

## WS5 — Generic prompt; no domain expertise
- `lib/agent/prompt.ts:105-123` — 18-line generic role section. No SEO conventions, no support-email policy, no inventory math, no few-shot. `buildToolsSection()` (:157-169) is a stale hand-written list omitting `shopify_optimize_product_description`, `shopify_optimize_meta`, `shopify_propose_restock`.
- README claims an Orchestrator routing to 4 specialist agents — no routing exists (`threads.agent_context` always 'orchestrator').
- Fix: rewrite the system role as an orchestrator with four embedded domain-expert playbooks (Catalog: merchandising copy rules, brand-voice adherence; SEO: ≤60 char titles / ≤160 char metas, keyword placement, redirect hygiene; Q&A: tone policy, escalation rules, never invent order data, always check order + inventory before answering; Inventory: velocity-based restock reasoning, safety stock). Add guardrails: never fabricate data, on tool `is_error` explain + stop, PII care, no internals. Generate the TOOLS section from the registry (import tool names/descriptions from `lib/agent/tools`) instead of the hand list. Keep total prompt within CHAT_TOKEN_BUDGET (3500 tokens) — Gemini has generous limits but budget discipline stays; consider raising budget to ~6000 now that Groq's 8k TPM cap no longer applies (verify `route.ts` maxOutputTokens interplay).
- README.md: fix the four-specialist claim to match reality (orchestrator + domain playbooks) and the LLM stack (Gemini primary).

## WS6 — LLM provider switch → Google AI Studio (Gemini) [USER DECISION]
- Add `@ai-sdk/google` dep. Extend `lib/agent/llm/models.ts`: `Provider = "anthropic" | "groq" | "google"`, new profile `google`: ORCHESTRATOR `gemini-2.5-pro` (or `gemini-2.5-flash` — pick flash for latency/free-tier headroom on all roles; document choice), CLASSIFIER `gemini-2.5-flash-lite`, AUDIT/DRAFTER `gemini-2.5-flash`. Key env: `GOOGLE_GENERATIVE_AI_API_KEY` (the @ai-sdk/google default). Update `resolveModel` + `parseRoleOverride` provider whitelist.
- `lib/agent/llm/pricing.ts`: add real Gemini rates; Groq rates are placeholders (:26-36) — fix or label.
- `.env.local.example`: document `GOOGLE_GENERATIVE_AI_API_KEY`, `MODEL_PROFILE=google`, also missing `NEXT_PUBLIC_APP_URL`, `DEMO_*` (separate finding).
- `app/api/chat/[threadId]/send/route.ts:313-321`: `providerOptions.groq.reasoningEffort` — make provider-conditional. maxOutputTokens min(4096,1536) was a Groq cap — can raise for Gemini.
- Chat history `.slice(-8)` was a Groq token-cap concession — safe to raise (e.g. 20) under Gemini.
- KEY NOT YET AVAILABLE: user will supply `GOOGLE_GENERATIVE_AI_API_KEY` later. Code must fall back gracefully; keep `MODEL_PROFILE` env-driven. Executor should NOT set MODEL_PROFILE=google in .env.local (leave groq until key arrives; orchestrator flips it after key delivery).

## WS7 — Chat bugs
1. `app/api/chat/[threadId]/send/route.ts:144-158`: history query has NO `orderBy` → scrambled context. Add `orderBy(messages.created_at)`.
2. Save-as-workflow UUID failure: optimistic assistant id `asst-${Date.now()}` (`components/chat/message-stream.tsx:186`) reaches `saveWorkflowFromPlan` → Zod UUID fail. Fix: route returns the real assistant message UUID in the SSE stream (e.g. initial `data:{message_id}` event); client replaces optimistic id.
3. Thread auto-naming: `thread-sidebar.tsx:45` hardcodes "New conversation"; nothing renames after first message. Fix: after first user message in a thread titled "New conversation", set title from first ~40 chars (server-side in send route or action) + `router.refresh()`.
4. No auto-scroll during streaming (`message-stream.tsx:137-139` deps miss content growth). Honor `prefersReducedMotion` (:131-134).
5. Queue flush self-abort: `message-stream.tsx:322-329` fires all queued messages in a loop; each `sendMessage` aborts the prior (:203). Fix: dequeue one at a time on stream completion.
6. Error banner leaks raw provider errors: `route.ts:442` sends `String(err)`; client renders verbatim (:249). Fix: generic user-facing message + server-side log.
7. Client abort should cancel server work: pass `req.signal` → abort streamText (nice-to-have).
8. `SuggestionPill` (:811-846) has no onClick — wire the 4 empty-state prompts to send.
9. Interrupted streams leave `status='streaming'` rows forever; empty bubble on reload. Add reaper: on thread load, mark stale streaming rows (>2 min old) `errored`, render gracefully.
10. Realtime channel subscribed with zero handlers (`message-stream.tsx:146-168`) — dead code; remove or implement.
11. Approval card after reload: `message-stream.tsx:712-730` hardcodes `initialStatus="pending"`, `reasoning=""` — pass real approval status/reasoning from the payload so resolved approvals don't show live buttons.
12. `workflow-visualizer.tsx`: LevelToggle state never sent to save action (automation level chosen in UI silently discarded — pass it through to `saveWorkflowFromPlan`); "Edit in chat" button (:331-333) dead — remove or wire.
13. Chat route hardcodes `automationLevel:"L2"` (`route.ts:283-287`) and dispatchTool never checks approval on chat path — write tools execute without approval from chat. Minimal fix for demo: only expose auto-approvable/propose-style write tools in chat (`includeWriteTools` filter), or route write intents through propose_workflow_plan; document choice.

## WS8 — Sandbox self-destruct guard
- `app/app/settings/actions.ts:190` `disconnectIntegration` guards with `isDemoUser(...)` instead of `isSandboxClaims` (all other destructive actions use it: :635, :675, :802, :830, :981). Sandbox visitor can disconnect → `clearShopifyMirror()` wipes demo, reconnect blocked. Fix guard.

## WS9 — Scheduled workflows never fire
- Seeded workflows have `trigger:"schedule"`, `trigger_config.cron` (`seed.ts:735-737`); `schedule-picker.tsx` UI writes the column; NOTHING consumes it. Only crons: shopify-poll, gmail-poll, sandbox-sweep (`app/api/inngest/route.ts:30-42`).
- Fix: add Inngest cron function (e.g. every 15 min) scanning active scheduled workflows whose cron is due (store `next_run_at` or compute from cron string — keep simple: support the seeded patterns) → send `workflow.run_requested`. Register in route. Exclude sandbox/demo users from auto-fire if runs would pile up (decide: exclude anonymous sandbox users).

## WS10 — Revert is a no-op
- `lib/workflows/revert.ts:168-187` `executeRevertEffect` is console.log stub; UI shows "Reverted ✓" while nothing changes.
- Fix: apply `before_state` back through the same write path used by the tools (adapter with sentinel simulation → mirror tables update for demo; real API call for real tokens). Cover at least product description/meta/status/inventory (the fields the real tools touch).

## WS11 — Seed data gaps (then reseed prod demo user)
- `shopify_orders` EMPTY but `shopify_list_orders` tool exists and seeded inbox asks about order `#WB-48217` (`seed.ts:186`). Seed ~15-20 orders over 30 days referencing real seeded products/variants (incl. #WB-48217 matching the email), feeding inventory-velocity story.
- `memory_embeddings` EMPTY → semantic recall dead. Seed embeddings for the 6 memory items (Voyage API available; degrade gracefully on 429 — 3 RPM free tier, add delay/retry).
- Approvals/activity reference product GIDs `100000201/202/203` that don't exist (`seed.ts:999-1003, 1134`) — point at real seeded GIDs.
- Archived thread D has 0 messages (`seed.ts:1660`) — add 2-3 messages.
- `shopify_sync_state`/`gmail_sync_state` seeded? (shopify yes :146ish, gmail_sync_state EMPTY — add row so health checks look right).
- `wipeUserData` (`seed.ts:70-93`) doesn't delete orders/pages/redirects/sync_state/telemetry — extend so reseed is clean.
- Model ids in seeded messages say `claude-opus-4-7` (`seed.ts:1485-1530`) — update to the Gemini model id for honesty.
- Fix `reseedDemo()` dead code note: leave function, it becomes usable.
- Onboarding starter workflows have empty `steps: []` (`app/onboarding/actions.ts:313`) — give them real minimal steps (real tools).
- Catalog audit hang: `lib/inngest/functions/catalog-audit.ts:229-236` returns [] for non-empty store and onboarding never re-polls (`app/onboarding/page.tsx:72-74`) → real-store onboarding spins forever. Minimal fix: compute suggestions synchronously from mirror data (no LLM needed for the deterministic checks: missing meta description, short description, missing alt) instead of returning [].

## WS12 — Misc honesty/polish
- `lib/integrations/adapter.ts:9-21` stale docblock ("compile-only skeletons") — update.
- `lib/agent/anthropic.ts` dead module (smoke test only) — remove or leave; if kept, note legacy.
- `getAnthropicToolDefinitions`/`zodToJsonSchemaShape` (`lib/agent/tools/index.ts:182-215`) dead + wrong — remove.
- `ask_user_clarification` output swallowed by route (only `workflow_plan` handled, `send/route.ts:344`) — either handle the block type in stream + render, or remove the tool from the chat toolset.
- `gmail client.ts:99` `provider_account_id: userId` placeholder — store email when available.
- README.md + CLAUDE.md stack claims: update LLM section to Gemini primary.
- `vercel.json` exists at root (untracked). Check contents; ensure function maxDuration supports the chat loop.

## Sequencing constraints
- Engine fixes (WS2/WS3) before seed reseed testing.
- Provider switch (WS6) is code-complete without the key; orchestrator flips `MODEL_PROFILE` after user supplies `GOOGLE_GENERATIVE_AI_API_KEY`.
- Prod reseed + deploy + Playwright prod smoke happen AFTER all code fixes merge (orchestrator handles; not executor scope).
- All existing 490 unit tests must stay green; add/adjust tests where behavior intentionally changed (approval ordering, error propagation, seed validation against registry).
