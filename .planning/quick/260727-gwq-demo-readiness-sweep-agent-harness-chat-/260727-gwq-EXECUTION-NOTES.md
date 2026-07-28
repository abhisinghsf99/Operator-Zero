# 260727-gwq Execution Notes

## Plan 1 execution notes

**Status:** Complete. All 4 tasks executed, all verification gates pass (typecheck, full vitest suite, production build, all per-task grep gates).

### Commits (in order)

1. `8cfd913` — `fix(260727-gwq): defer approval-gated writes, propagate tool errors to failed runs` (Task 1: WS2/WS3)
2. `d9b2637` — `feat(260727-gwq): make stub write tools real (Shopify API + sandbox mirror, Gmail) and revert real` (Task 2: WS4/WS10)
3. `21130a7` — `feat(260727-gwq): domain-expert system prompt + Google AI Studio (Gemini) provider` (Task 3: WS5/WS6)
4. `e46f5dc` — `feat(260727-gwq): scheduled-workflow cron trigger + dead-code removal` (Task 4: WS9/WS12)

### Test results

- `npm run typecheck` — 0 errors, every commit.
- `npm test` — baseline before Plan 1 was 490 (per AUDIT.md). Final count: **535 passed | 2 skipped | 12 todo (549 total)**. No test was deleted; the only intentional behavior-changing edits were to existing assertions (see below), and no total-count decrease occurred at any commit.
- `npm run build` — production build succeeds **without** `GOOGLE_GENERATIVE_AI_API_KEY` set (confirms the google provider is code-complete-but-inactive by default).
- `.env.local` was never touched — still `MODEL_PROFILE=groq`.

### Key decisions (for SUMMARY.md after Plan 3)

- **Deferred-dispatch gate (WS2):** `runWorkflowStep` now withholds `dispatchTool` during the pre-approval pass unless `toolDef.proposeSafe === true` OR `typeof toolDef.extractProposedAction === "function"`. Both signals independently indicate "safe to call execute() without an external write happening." Only `shopify_optimize_product_description`, `shopify_optimize_meta`, `shopify_propose_restock` have `proposeSafe: true` set explicitly (they also have `extractProposedAction`, so the flag is technically redundant today, but documents intent and is a stable public contract from the `ToolDefinition` interface for the next tool that needs it).
- **Gemini role-model choice (WS6):** Flash on every role (`ORCHESTRATOR`/`AUDIT`/`DRAFTER` = `gemini-2.5-flash`, `CLASSIFIER` = `gemini-2.5-flash-lite`). Quality-upgrade escape hatch: `OZ_MODEL_ORCHESTRATOR=google:gemini-2.5-pro`. `@ai-sdk/google` was pinned to `^3.0.101`, **not** the version `npm install @ai-sdk/google` picks by default (`4.0.24`) — the 4.x line ships a `LanguageModelV4` provider spec that is incompatible with `ai@^6.0.191` (which the rest of this stack, including `@ai-sdk/anthropic@3.0.79`, is built against). If a future upgrade of the `ai` package or `@ai-sdk/*` family is attempted, re-verify this pin.
- **Sandbox/demo exclusion rule for the scheduled cron (WS9):** `scheduledWorkflowsTick` excludes any workflow owner whose Shopify `integrations.access_token_encrypted` equals `SANDBOX_SENTINEL_TOKEN`, and any owner for whom `isDemoUser(userId)` is true. Rationale: auto-firing every 15 minutes on the shared demo account or a per-visitor sandbox would pile up runs and corrupt the curated demo dataset; "Run now" still works for both from the UI (unaffected — that path doesn't go through this tick).
- **isCronDue semantics (WS9):** intentionally calendar-day-granularity for the daily/weekly forms (fires once time-of-day is reached AND `lastRunAt`'s local calendar date != today's), not strict-instant comparison — a manual run earlier the same day still counts as "already ran this window." The every-N-minutes form uses N-minute-slot granularity instead (compares `(date, slotIndex)` pairs). This was a deliberate interpretation choice to match the plan's illustrative test scenario (a 10-minutes-ago run on the same calendar day must NOT re-fire, even though it technically predates the exact H:M mark) — see the docblock in `lib/workflows/cron.ts` for the full rationale.
- **Groq/Gemini pricing labels:** the Groq rates in `pricing.ts` were previously flagged as "unconfirmed placeholders"; relabeled as confirmed (same numeric values — 0.15/0.75 for 120b, 0.10/0.50 for 20b). Added Gemini rates: flash 0.30/2.50, flash-lite 0.10/0.40, pro 1.25/10.00 (USD/MTok).

### Deviation not in the original plan text (Rule 1 — bug, auto-fixed)

**`lib/workflows/revert.ts` / `lib/workflows/revert-effect.ts` split.** The plan's Task 2 instructed making `executeRevertEffect` a real write-path executor inside `lib/workflows/revert.ts`. That file is imported by a **client component** (`components/activity/activity-detail.tsx`, for the pure `canRevert()` eligibility check). Once `executeRevertEffect` gained dynamic imports of `lib/integrations/shopify/mutations.ts` (which pulls in `serviceDb`/`postgres.js`, a Node-only package), `npm run build` failed: Next.js tried to bundle the server-only dependency chain for the browser (`Module not found: Can't resolve 'net'/'tls'/'perf_hooks'`).

**Fix:** split the module. `lib/workflows/revert.ts` now only exports the pure, client-safe pieces (`canRevert`, `REVERT_REASON_LABELS`, types). `executeRevertEffect` moved to a new sibling module, `lib/workflows/revert-effect.ts`, imported only by the two Server Action callers (`app/app/approvals/actions.ts`, `lib/actions/activity.ts`). Updated `tests/unit/workflows/revert.test.ts`'s `executeRevertEffect` describe block to import from the new path. This was caught by running `npm run build` proactively before considering Task 2/4 done — **Plan 2 and Plan 3 executors: if you see this same "Can't resolve net/tls/perf_hooks" build error again, check whether a client-imported module gained a transitive server-only dependency, and split it the same way rather than adding `import "server-only"`** (the project's memory notes `import "server-only"` breaks Vitest for modules reachable from unit tests — this codebase has zero `"server-only"` imports anywhere and relies on import-discipline + docblock notes instead; follow that convention).

### Notes for Plan 2 / Plan 3 executors

- `components/chat/message-stream.tsx`: Task 4 removed the dead Supabase Realtime `useEffect` (lines ~146-168) and the `createBrowserClient` import. **Plan 2 makes further edits to this same file** (per the plan's own note) — that removal has already landed, so diff against the current file state, not the original.
- The seeded demo workflows (WS1, `lib/demo/seed.ts`) still reference nonexistent tool names (`seo_score`, `request_approval`, `compute`, etc.) — **not touched by Plan 1**. This is explicitly out of scope here; Plan 2/3 or the orchestrator's prod-reseed step needs to rewrite those workflow definitions to use the real registry tool names (`shopify_list_products`, `shopify_optimize_product_description`, `shopify_optimize_meta`, `shopify_propose_restock`, `shopify_update_variant_inventory`, `gmail_list_threads`, `gmail_draft_reply`, etc.) per AUDIT.md WS1.
- `.env.local` is still `MODEL_PROFILE=groq`. The orchestrator flips this to `google` once `GOOGLE_GENERATIVE_AI_API_KEY` is supplied by the user — do not flip it as part of Plan 2/3 unless explicitly instructed.
- Real-token paths added in Task 2 (Shopify `fileUpdate`/`productVariantsBulkUpdate`/`urlRedirectCreate`/`pageUpdate` mutations, Gmail `drafts.create`/`messages.send`) are code-complete but **untested against a live API** — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Gmail OAuth) and a real Shopify token are not configured locally. Only the sandbox-sentinel simulation branches have been exercised (unit tests + the sandbox demo account uses the sentinel token exclusively).
- No `.env.local`, database, or Vercel deploy changes were made in Plan 1, per the orchestrator's constraints.

## Plan 2 execution notes

**Status:** Complete. All 3 tasks executed, all verification gates pass (typecheck, full vitest suite, production build, all per-task grep gates).

### Commits (in order)

1. `6023569` — `feat(260727-gwq): ordered chat history, real message id, auto-naming, sanitized errors, tool gating (WS7.1/2/3/6/7/12/13, WS12, D-1/D-2/D-3)` (Task 1)
2. `f2f8fa2` — `fix(260727-gwq): message stream client — real message id, honest scroll, serialized queue, live suggestions, resolved approvals (WS7.2/4/5/8/9/11)` (Task 2)
3. `43170fa` — `fix(260727-gwq): honour the chosen automation level on save, drop the dead Edit-in-chat button (WS7.12)` (Task 3)

### Test results

- `npm run typecheck` — 0 errors, every commit.
- `npm test` — baseline before Plan 2 was 535 passed | 2 skipped | 12 todo (549 total, per Plan 1's notes above). Added
  18 new tests. Final: **553 passed | 2 skipped | 12 todo (567 total)**. No test deleted; no count regression at any commit.
- `npm run build` — production build succeeds.

### Key decisions (as implemented — see 260727-gwq-PLAN-2-SUMMARY.md for full detail)

- **D-1 (WS7.13, chat write-tool gating):** `getAiSdkTools` gained `opts.writeTools: "all" | "propose-safe"` (default
  `"all"`, byte-for-byte unchanged for the workflow engine's existing call sites) and `opts.excludeTools: string[]`.
  The chat route calls it with `{ writeTools: "propose-safe", excludeTools: ["ask_user_clarification"] }`.
  `"propose-safe"` resolves to exactly `shopify_optimize_product_description`, `shopify_optimize_meta`,
  `shopify_propose_restock` (verified against the real registry in a new test, not hardcoded). Propose-phase tool
  output (`phase === "propose"` in the parsed tool result) now renders as a `preview` inline block instead of
  vanishing silently.
- **D-2 (WS12, ask_user_clarification):** stays in the registry for the workflow path (default `opts` = no
  exclusions); dropped from the chat toolset via `excludeTools`.
- **D-3 (WS7.9, stale-stream reaper):** `reapStaleStreamingMessages(threadId)` lives in `app/app/chat/actions.ts`,
  called at the top of `listMessages` (one UPDATE, RLS-scoped, `status='streaming' AND created_at < now() - interval
  '2 minutes'` → `'errored'`). Never throws. No cron.
- **WS7.2 (real message id):** the route emits `{ message_id }` as the FIRST SSE event of every stream (before any
  text). The client (`message-stream.tsx`) tracks a mutable `currentAsstId` in `sendMessage`'s closure and repoints
  every subsequent `setMessages` call (text, inline block, finalize, error) at it once the real id arrives.
- **WS7.12 (automation level):** `saveWorkflowFromPlan(messageId, automationLevel?)` — optional second arg, takes
  precedence over `plan.automation_level`, falls back to `"L2"`. `workflow-visualizer.tsx`'s `handleSave` now passes
  the LevelToggle's current value through (previously silently discarded).

### Tests intentionally changed

`tests/integration/chat-stream.test.ts` — the "emits SSE data events with `{ text: string }` shape" test asserted
every data line has `.text`. WS7.2's new leading `{ message_id }` event breaks that for line 0 on every request, not
an edge case — renamed the test and split the assertion (first line is `{ message_id }`, rest are `{ text }`). No
other assertions changed; `getAiSdkTools`/`resolveModelChoice` were already mocked in that file, so raising
`maxOutputTokens`/`stepCountIs`/history-slice in the route required no test changes there.

### Notes for Plan 3

- `components/chat/message-stream.tsx` has now been edited by Plan 1 (Realtime removal) AND Plan 2 (id adoption,
  content-aware scroll, serialized queue via `pendingQueueRef`, suggestion pills wired, approval_card reads real
  server-enriched status/reasoning/preview/risk, errored-assistant copy is now "This reply was interrupted.") — diff
  against the current file state before editing it further.
- `getAiSdkTools`'s new `opts` parameter (`writeTools`, `excludeTools`) is additive/optional — every existing call
  site not touched by this plan (the workflow engine) is unaffected; default behavior is byte-for-byte identical to
  before this plan.
- `saveWorkflowFromPlan`'s new `automationLevel` parameter is optional — every existing call site not touched by
  this plan is unaffected.
- `listMessages` now does two extra round-trips beyond the original select: one `reapStaleStreamingMessages` UPDATE
  (RLS-scoped, inside its own `withUserRls`) and, when the thread has approval_card messages, one `serviceDb` select
  against `approvals` (OUTSIDE any `withUserRls` transaction, per the `gid-resolve-outside-rls-tx` project memory —
  the postgres client is `max:1` and nesting a `serviceDb` call inside a `withUserRls` tx will deadlock).
- No `.env.local`, database, or Vercel deploy changes were made in Plan 2, per the orchestrator's constraints.
