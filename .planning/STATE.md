---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed quick task 260526-mfp — Gmail mirror seed (23/23/9)
last_updated: "2026-05-29T21:19:15.811Z"
last_activity: "2026-05-29 - Completed quick task 260529-f4g: "Optimized product descriptions" workflow (run-time LLM generation via extractProposedAction contract, engine frozen) — pending live end-to-end check"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 22
  completed_plans: 22
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-21)

**Core value:** Sarah builds workflows in plain language and trusts the agent to run them — most operator work happens without her in the loop, and she reviews only what genuinely needs her judgment.
**Current focus:** Milestone complete

## Current Position

Phase: 04
Plan: Not started
Status: Milestone complete
Last activity: 2026-05-31 - Live smoke test of 3 workflows surfaced + fixed Shopify write bugs (260531-vhh descriptionHtml + inventory IDs; 260531-w26 meta JSON-fence parse + changeFromQuantity). Descriptions (#2) verified writing live. Meta (#1) blocked on Groq gpt-oss reasoning-token starvation (fix identified: reasoningEffort:low). Restock (#3) inventory write blocked on Shopify @idempotent directive requirement (next in the inventory-API chain).

Progress: [██████████] 95%

## Performance Metrics

**Velocity:**

- Total plans completed: 23
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 4 | - | - |
| 02 | 8 | - | - |
| 03 | 4 | - | - |
| 04 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
| Phase 02-foundation-prove-the-agent P01 | 35 | 3 tasks | 13 files |
| Phase 02-foundation-prove-the-agent P02 | 18 | 4 tasks | 37 files |
| Phase 02-foundation-prove-the-agent P03 | 8 minutes | 4 tasks | 17 files |
| Phase 02-foundation-prove-the-agent P04 | 67 | 3 tasks | 11 files |
| Phase 02 P05 | 14 | 3 tasks | 13 files |
| Phase 02-foundation-prove-the-agent P06 | 7 minutes | 3 tasks | 11 files |
| Phase 02-foundation-prove-the-agent P07 | 13 minutes | 3 tasks | 10 files |
| Phase 02 P08 | 16 minutes | 3 tasks | 22 files |
| Phase 03 P01 | ~50min | 3 tasks | 14 files |
| Phase 03 P02 | ~25min | 2 tasks | 7 files |
| Phase 03 P04 | 45 | 3 tasks | 11 files |
| Phase 03 P03 | ~30min | 2 tasks | 9 files |
| Phase 04 P01 | 130min | 4 tasks | 19 files |
| Phase 04 P04 | 55 | 3 tasks | 9 files |
| Phase 04 P05 | 8 | 3 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap mirrors PRD phasing (Week 0 → Phase 1 → 2 → 3) — phases ladder up trust and ship value incrementally
- Existing docs (PRD/IA/systems/data/tech) are the locked source of truth — planning does not re-litigate stack, IA, or phasing
- Build scope = v1 MVP only — v1 proves the wedge; v2/v3 expand the moat afterward
- [01-04] getClaims() returns {data: {claims}|null} not {data: {claims}} — destructure data first; RESEARCH.md pattern corrected in implementation
- [01-04] validateNextParam rejects absolute and protocol-relative next params in OAuth callback — open-redirect guard (T-1-04-04)
- [01-04] vitest.config.mts must exclude tests/e2e/** — Playwright test() conflicts with Vitest globals
- [Phase ?]: [02-01] shadcn CLI bypassed — components written manually to shadcn v4 data-slot spec; identical output, avoids interactive TTY requirement
- [Phase ?]: [02-01] @radix-ui/react-dialog added as Rule 3 (blocking) dependency for shadcn Dialog primitive
- [Phase ?]: [02-01] Fonts via next/font/google (self-hosted at build) not CDN link — aligns with T-2-01-01 accept disposition, no user data in font requests
- [Phase ?]: [02-01] Lucide icon mapping: GitBranch=Workflows, MessageSquare=Chat, Inbox=Approvals, Activity=Activity, Settings=Settings
- [Phase ?]: [02-02] voyage-4 vector dimension is 1024 not 1536
- [Phase ?]: [02-02] workflow_versions: no RLS; isolation via workflows FK cascade
- [Phase ?]: [02-02] activity_entries: idempotency constraint is partial index (NULL-safe) not full UNIQUE
- [Phase 02-03]: shopify.auth.begin() bypassed — manual URL construction avoids Next.js Request adapter incompatibility
- [Phase 02-03]: nonce stored as 'nonce:<hex>' prefix in access_token_encrypted — avoids extra DB column for OAuth state
- [Phase 02-03]: maxRuntime '4m' / maxDuration 300 — required for Shopify full-sync of large stores
- [Phase ?]: [02-04] Gmail OAuth uses same nonce-in-DB CSRF pattern as Shopify (nonce: prefix in access_token_encrypted)
- [Phase ?]: [02-04] classifySupport uses claude-haiku-4-5 not Opus — fast-path YES/NO needs low latency
- [Phase ?]: [02-04] historyId expiry triggers full re-sync fallback rather than erroring
- [Phase ?]: [02-05] Anthropic.APIStatusError does not exist in SDK v0.97.1 — use Anthropic.APIError base class
- [Phase ?]: [02-05] assemblePrompt is pure/snapshot-testable; buildSystemPrompt is the async pipeline
- [Phase ?]: [02-05] dispatchTool does not check approvalRequired — workflow engine (02-07) enforces the gate
- [Phase ?]: [02-07] CEL if: async.data.approvalId NOT event.data — async=awaited event, event=original trigger (Pitfall 1)
- [Phase ?]: [02-07] Module-level _testState bypasses vi.doMock closure isolation for cross-boundary tracking in Vitest
- [02-06] SSE route is a Route Handler (not Inngest) — streaming requires force-dynamic ReadableStream, Inngest breaks streaming
- [02-06] Composer queue extracted as pure zustand store factory (createComposerStore) — FIFO hold+flush-once testable without browser
- [02-06] react-markdown used without rehype-raw — no raw HTML passthrough prevents XSS from model-generated markdown (T-2-06-02)
- [Phase ?]: [03-01] Migration 0005 applied via 'supabase db push --db-url <session-pooler>' (not Supabase MCP — MCP lacked project permission); recorded in remote migration history (Local 0005 / Remote 0005)
- [Phase ?]: [03-01] createWorkflowVersion retries once on UNIQUE(workflow_id,version_number) 23505 with a fresh MAX read — absorbs concurrent version inserts
- [Phase ?]: [03-01] canRevert is one shared pure function (D-11) re-evaluated server-side with a fresh shopify_updated_at fetch; UI classification never trusted (T-3-01-05); unknown action_type defaults to content (7d) window
- [03-02] WorkflowRow name is a Link to detail page — inline edit is D-01 detail-surface feature, not list
- [03-02] context_workflow_id explicitly omitted in new-workflow navigation — WF-10 routes to blank /app/chat; WF-12 ("Open in Chat" with context) is plan 03-03
- [Phase ?]: [03-03] openWorkflowInChat Server Action creates thread with context_workflow_id set — D-06/WF-12
- [Phase ?]: [03-03] RunNowDialog L2+L3 both get confirm dialog — L2 approval-gated runs confirmed before trigger (D-05)
- [Phase ?]: [04-01] Wave-0 RED scaffold pattern intentionally fails typecheck on test files — imports not-yet-built modules; resolves as 04-02..04-04 ship
- [Phase ?]: [04-01] Migration 0006 applied via supabase db push over session pooler port 5432 — MCP lacks project-write permission; same convention as 03-01
- [Phase ?]: [04-01] user-exports bucket is PRIVATE — downloads via 24h signed URL only per threat model T-4-01-02
- [Phase ?]: [04-04] getEffectiveAutomationLevel pure helper in lib/workflows/autonomy.ts — D-06 one-directional logic shared between engine and tests
- [Phase ?]: [04-04] Override gate as step.run in execute-workflow-run.ts before L2 branch — deterministic step ID, serviceDb filter (T-2-07-04)
- [Phase ?]: [04-04] admin.signOut scope is string arg not object — Supabase JS SDK v2 API; fixed during typecheck
- [Phase ?]: [04-04] recordSession non-fatal in login paths — errors logged, never block login redirect

### Pending Todos

None yet.

### Blockers/Concerns

- Pricing required before beta (PRD §8.3 open item — out of scope for build but needed pre-GA)
- Mobile detailed design pass still needed (PRD flag — Phase 4 work will unblock this)
- SOC 2 / threat model / pen test tracked separately, required before GA

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260523-1jq | Fix Shopify Connect button to collect myshopify store domain before OAuth redirect | 2026-05-23 | 4851b5b | [260523-1jq-fix-shopify-connect-button-to-collect-my](./quick/260523-1jq-fix-shopify-connect-button-to-collect-my/) |
| 260526-fmp | Add one-click public demo mode (enterDemo + banner + destructive-action guards) | 2026-05-26 | d7b7cc0 | [260526-fmp-add-one-click-public-demo-mode-with-bann](./quick/260526-fmp-add-one-click-public-demo-mode-with-bann/) |
| 260526-ii6 | Reset demo to baseline on each entry (in-app reseedDemo + reset route + tab-close beacon) | 2026-05-26 | b58c896 | [260526-ii6-reset-demo-to-baseline-on-each-entry-via](./quick/260526-ii6-reset-demo-to-baseline-on-each-entry-via/) |
| 260526-kpx | Clean shape-aware approval preview (Q&A customer message + drafted reply, before/after, item list) | 2026-05-26 | 6453e56 | [260526-kpx-render-approval-preview-cleanly-especial](./quick/260526-kpx-render-approval-preview-cleanly-especial/) |
| 260526-luj | Fix chat: graceful Voyage-recall degradation (no more 500 on free-tier 429) + non-editable BYOK showcase card | 2026-05-26 | 9f5cbf3 | [260526-luj-fix-chat-voyage-429-with-graceful-recall](./quick/260526-luj-fix-chat-voyage-429-with-graceful-recall/) |
| 260526-l83 | Add logout/sign-out button to UI (desktop sidebar + Settings → Sessions) | 2026-05-26 | d8de2da | [260526-l83-add-logout-button](./quick/260526-l83-add-logout-button/) |
| 260526-mfp | Seed Gmail mirror tables in reseedDemo (23 threads/messages, 9 product questions) — inbox tools now return data | 2026-05-26 | c3072a7 | [260526-mfp-seed-gmail-mirror-demo](./quick/260526-mfp-seed-gmail-mirror-demo/) |
| 260526-r8o | Turn off demo auto-reset (removed reseed call + reset route + tab-close beacon) + cleared demo account data — for a permanent real Shopify dev store connection | 2026-05-26 | 8387197 | [260526-r8o-disable-demo-reset-clear-data](./quick/260526-r8o-disable-demo-reset-clear-data/) |
| 260526-tl5 | Demo Shopify connection lock flag (DEMO_SHOPIFY_LOCKED, default unlocked) gating connect+disconnect guards + reworded demo banner | 2026-05-26 | c5d2d74 | [260526-tl5-demo-shopify-lock-flag](./quick/260526-tl5-demo-shopify-lock-flag/) |
| 260526-v0o | Fix stale/never-synced Shopify connection badge — stamp integrations.last_synced_at at end of shopifyFullSyncForUser | 2026-05-26 | 16bbed1 | [260526-v0o-stamp-integration-last-synced](./quick/260526-v0o-stamp-integration-last-synced/) |
| 260527-d97 | Fix chat assistant messages rendering raw markdown — render via react-markdown + remark-gfm (GFM tables), preserve streaming caret + T-2-06-02 XSS guard | 2026-05-27 | 0bd45f4 | | [260527-d97-fix-chat-assistant-messages-rendering-ra](./quick/260527-d97-fix-chat-assistant-messages-rendering-ra/) |
| 260527-dse | Make chat header Search + ⋯ menu functional — in-thread search, Rename/Delete(soft)/Copy transcript/Pin; new deleteThread+togglePinThread actions, migration 0010 pinned_at, sidebar pin ordering | 2026-05-27 | 5d7442c | Needs Review | [260527-dse-make-chat-header-search-icon-and-more-op](./quick/260527-dse-make-chat-header-search-icon-and-more-op/) |
| 260527-ebw | Provider abstraction + per-task model routing (Anthropic↔Groq) via Vercel AI SDK — MODEL_PROFILE/OZ_MODEL_&lt;ROLE&gt; routing, default anthropic = zero behavior change; chat route on streamText, 3 sites on generateText, dead streamChat removed | 2026-05-27 | 338d7e7 |  | [260527-ebw-model-routing-anthropic-groq-via-ai-sdk](./quick/260527-ebw-model-routing-anthropic-groq-via-ai-sdk/) |
| 260528-sgu | Backfill after_state onto activity_entries in Shopify write path — updateProduct/updateInventory now persist the post-write mirror re-read onto the activity row (DRY backfillAfterState helper, user_id-scoped) so the Activity log shows a true before→after diff on real edits | 2026-05-29 | 690f122 | Verified | [260528-sgu-backfill-after-state-onto-activity-entri](./quick/260528-sgu-backfill-after-state-onto-activity-entri/) |
| 260529-f4g | "Optimized product descriptions" workflow (vertical slice #2): run-time LLM generation wired into the frozen workflow engine via a new extractProposedAction tool-contract — generated copy flows into proposedAction so the L2 approval card shows it and the approved re-dispatch writes it without regenerating. Adds generation helper (cost-cap-gated, provider-routed, HTML-sanitized) + shopify_optimize_product_description smart tool (propose/write/L3) + idempotent seed script. 51 tests, engine 0-diff | 2026-05-29 | 7651b25 | Needs Review | [260529-f4g-optimized-product-descriptions-workflow-](./quick/260529-f4g-optimized-product-descriptions-workflow-/) |
| 260529-jk4 | "Optimize SEO meta" workflow (Tool 13): shopify_optimize_meta smart tool (propose/write/L3) + generateOptimizedMeta helper (cost-cap-gated, SEO-length-guarded ≤60/≤160) + idempotent seed script. Surfaces generated meta title+description via pre-existing extractProposedAction contract (parenthesized OR precedence fix applied). 42 tests, engine 0-diff | 2026-05-29 | 23f4043 | Needs Review | [260529-jk4-meta-optimization-workflow-shopify-optim](./quick/260529-jk4-meta-optimization-workflow-shopify-optim/) |
| 260529-jxq | "Low-stock restock proposals" workflow (Tool 14): shopify_propose_restock smart tool (propose/write/L3) + generateRestockProposal helper (cost-cap-gated; target_qty clamped to positive int >current, ≤1000) + idempotent seed script targeting variants inventory_qty≤5. Restock-to-target written via updateInventory; WRITE/PROPOSE branch keys on typeof inventory_qty==='number' so a target of 0 still routes to write. 47 tests, engine 0-diff | 2026-05-29 | 9f4dee6 | Needs Review | [260529-jxq-low-stock-restock-workflow-shopify-propo](./quick/260529-jxq-low-stock-restock-workflow-shopify-propo/) |
| 260531-tsg | Fixed L2 approval preview rendering across BOTH surfaces (Approval Inbox `_preview.tsx` + chat `inline-approval-card.tsx`): extracted shared `sanitizeHtml` to `lib/html/sanitize.ts` + new pure `buildPreviewModel` (lib/approvals/preview-model.ts) discriminated union — html/fields/diff/list/email/text/empty + humanized generic fallback that never dumps escaped JSON. Both surfaces now render off it; raw `JSON.stringify(preview)` fallbacks deleted. HTML sanitized at render. 39 preview/sanitizer tests, 471 suite green, engine 0-diff | 2026-05-31 | 929b1b7 | Verified | [260531-tsg-fix-approval-preview-rendering-across-bo](./quick/260531-tsg-fix-approval-preview-rendering-across-bo/) |
| 260531-vhh | Fixed live Shopify write path (Admin API 2024-10): updateProduct `bodyHtml`→`descriptionHtml` (mutation+re-read+mirror), updateInventory now resolves real inventoryItemId + locationId from the variant's inventoryItem/inventoryLevels (no read_locations scope needed; no hardcoded Location/1) + enables tracking when tracked:false; both fail loud on userErrors. Found via live smoke test. Descriptions (#2) confirmed writing live after this. 23 tests | 2026-05-31 | 8cb2052 | Verified (descriptions live) | [260531-vhh-fix-live-shopify-write-path-descriptionh](./quick/260531-vhh-fix-live-shopify-write-path-descriptionh/) |
| 260531-w26 | parseMeta rewritten to extract balanced JSON (stops the fence regex from deleting Groq's ```json content); updateInventory adds `changeFromQuantity` (current on-hand) to inventorySetOnHandQuantities. 42 tests, typecheck clean. NOTE: meta still blocked live by Groq gpt-oss reasoning-token starvation (fix=reasoningEffort:low, not yet applied); restock still blocked by Shopify `@idempotent` directive requirement on the inventory mutation | 2026-05-31 | fdc3f71 | Partial (further live blockers found) | [260531-w26-fix-meta-json-fence-parsing-restock-chan](./quick/260531-w26-fix-meta-json-fence-parsing-restock-chan/) |

## Session Continuity

Last session: 2026-05-29T21:19:15.806Z
Stopped at: Completed quick task 260529-jxq — shopify_propose_restock (Tool 14) + generateRestockProposal + seed script (47 tests, typecheck clean, engine frozen)
Resume file: None
