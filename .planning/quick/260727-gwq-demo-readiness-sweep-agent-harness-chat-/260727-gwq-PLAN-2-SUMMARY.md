---
task: 260727-gwq
plan: 2
subsystem: chat
tags: [nextjs, ai-sdk, sse, drizzle, react]
requirements-completed: []
duration: ~45min
completed: 2026-07-27
---

# Quick Task 260727-gwq Plan 2: Chat surface fixes — Summary

**Ordered chat history with real message ids, self-naming threads, sanitized errors, propose-safe-only chat write tools, and a serialized message queue that no longer self-aborts.**

## Scope

All thirteen WS7 items plus the WS12 `ask_user_clarification` item, executed in the three tasks defined in `260727-gwq-PLAN-2.md`. Plan 1's engine/provider work (already committed before this plan started) was not touched or redone.

## Task Commits

1. **Task 1: SSE route + Server Actions** — `6023569` (feat) — ordered history, real message id, auto-naming, sanitized errors, propose previews, tool gating, stale-stream reaper, approval-card state.
2. **Task 2: Message stream client** — `f2f8fa2` (fix) — id adoption, streaming auto-scroll, serialized queue flush, live suggestion pills, resolved approval cards.
3. **Task 3: Workflow visualizer + thread sidebar** — `43170fa` (fix) — automation level passed through to save, dead "Edit in chat" button removed, New Thread → auto-name coupling documented.

## Files Modified

- `app/api/chat/[threadId]/send/route.ts` — orderBy on history select, 20-message window, uncapped output/step count under Gemini, provider-conditional providerOptions, leading `{message_id}` SSE event, propose-phase preview inline block, `req.signal` passed to `streamText`, sanitized `stream_error` payload, calls `autoNameThreadIfDefault` post-reply.
- `lib/agent/llm/tools.ts` — `getAiSdkTools` gains `opts.writeTools` (`"all" | "propose-safe"`) and `opts.excludeTools`, default-safe (byte-for-byte unchanged when `opts` is omitted).
- `app/app/chat/actions.ts` — new `autoNameThreadIfDefault`, new `reapStaleStreamingMessages`, `saveWorkflowFromPlan` accepts an optional `automationLevel`, `listMessages` enriches `approval_card` payloads with live approval state.
- `components/chat/message-stream.tsx` — `currentAsstId` id-adoption, content-aware scroll effect honoring reduced motion, `pendingQueueRef`-based serialized queue flush, `SuggestionPill`/`ThreadEmptyState` wired to send, `approval_card` reads real status/reasoning/preview/risk, errored-assistant copy changed to "This reply was interrupted."
- `components/chat/workflow-visualizer.tsx` — `handleSave` passes `automationLevel` through to `saveWorkflowFromPlan`; dead "Edit in chat" button removed; confirmation label shows the persisted level.
- `components/chat/thread-sidebar.tsx` — comment documenting the `createThread("New conversation")` ↔ `autoNameThreadIfDefault` coupling.
- `tests/unit/chat-tool-gating.test.ts` (new) — asserts `getAiSdkTools` gating behavior against the real registry.
- `tests/unit/chat-actions.test.ts` (new) — covers `autoNameThreadIfDefault`, `reapStaleStreamingMessages`, `saveWorkflowFromPlan`'s automationLevel precedence, and `listMessages`'s approval enrichment.
- `tests/integration/chat-stream.test.ts` (modified) — updated the SSE-shape assertion for the new leading `message_id` event (see "Tests intentionally changed" below).

## Key Decisions (as implemented)

**D-1 (WS7.13, chat write-tool gating).** Implemented exactly as specified: the chat route now calls
`getAiSdkTools(includeWriteTools, agentCtx, { writeTools: "propose-safe", excludeTools: ["ask_user_clarification"] })`.
`"propose-safe"` filters `WRITE_TOOL_NAMES` down to registry entries with `proposeSafe === true` — currently exactly
`shopify_optimize_product_description`, `shopify_optimize_meta`, `shopify_propose_restock` (verified against the real
registry in `tests/unit/chat-tool-gating.test.ts`, not hardcoded in the route). These three tools generate a proposal
at L2 without writing; the route's hardcoded `automationLevel: "L2"` plus `dispatchTool` never enforcing approval on
the chat path meant any other write tool would have hit Shopify/Gmail with no card in front of it. Anything requiring
a real write still has to go through `propose_workflow_plan` → Save as workflow → Run. The propose-phase output is no
longer silent — it now renders as a `preview` inline block (title derived from the tool name; content prefers
`preview`, then `meta_title`+`meta_description`, then `body_html`, then `rationale`).

**D-2 (WS12, ask_user_clarification exclusion).** Implemented via the new `excludeTools` option — the tool stays in
the registry (still available to the workflow engine path, which calls `getAiSdkTools` with default `opts`, i.e.
`writeTools: "all"`, no exclusions) but is dropped from the chat toolset specifically. The route only renders
`workflow_plan` and `preview` inline blocks, so a clarification tool call from chat would be a dead end; the domain
prompt already tells the agent to ask clarifying questions in plain text.

**D-3 (WS7.9, stale-stream reaper location).** `reapStaleStreamingMessages(threadId)` lives in
`app/app/chat/actions.ts` and is called at the top of `listMessages`, before the message select, wrapped in a
belt-and-suspenders try/catch (the function itself never throws — it swallows its own errors and returns `0`). It
issues one `UPDATE messages SET status = 'errored' WHERE thread_id = $1 AND status = 'streaming' AND created_at <
now() - interval '2 minutes'`, scoped by RLS via `withUserRls`. No cron, no new infrastructure — an abandoned stream
renders correctly ("This reply was interrupted.") the next time the thread is opened.

## Tests Intentionally Changed

`tests/integration/chat-stream.test.ts` — the "emits SSE data events with `{ text: string }` shape" test asserted
that every SSE data line has a `.text` property. WS7.2 now emits `{ message_id }` as the *first* event of every
stream (before any text), so that assertion would fail against every request, not just an edge case. Renamed the
test to "emits a leading message_id event, then SSE data events with `{ text: string }` shape" and split the
assertion: the first data line must be `{ message_id: string }`, every subsequent line must be `{ text: string }`.
No other existing assertions were touched — the 8-message-slice, `maxOutputTokens`, `stepCountIs`, and unfiltered
tool-set values were mocked away in this test file already (`getAiSdkTools` and `resolveModelChoice` are both
mocked), so raising them in the route required no test changes there.

## Deviations from Plan

None — plan executed as written. One clarification made during implementation: the plan's Part B step 4 says
"emit `{ groq: { reasoningEffort: 'low' } }` only when provider is `'groq'`, and an empty object otherwise" — TS's
structural typing rejected a plain ternary between `{ groq: {...} }` and `{}` against the AI SDK's
`SharedV3ProviderOptions` type (`Record<string, JSONObject>`), so the object is explicitly typed as
`{ groq?: { reasoningEffort: "low" } }` rather than left to inference. Behavior is unchanged from the plan's intent.

## Verification

- `npm run typecheck` — 0 errors, every commit.
- `npm test` — baseline before this plan was 535 passed | 2 skipped | 12 todo (per Plan 1's EXECUTION-NOTES). Added
  18 new tests (`chat-tool-gating.test.ts` ×6, `chat-actions.test.ts` ×12). Final: **553 passed | 2 skipped | 12 todo
  (567 total)**. No test deleted; no count regression at any commit.
- `npm run build` — production build succeeds.
- All per-task grep gates pass (verified individually before each commit).

## Known Stubs

None introduced by this plan.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. The write-tool gating change *narrows* the chat
attack surface (fewer tools reachable from chat, not more) and is covered by the D-1 rationale above and
`tests/unit/chat-tool-gating.test.ts`.

## Next Plan Readiness

Plan 3 can proceed. Notes for Plan 3 (also appended to `260727-gwq-EXECUTION-NOTES.md`):
- `components/chat/message-stream.tsx` has now been edited by both Plan 1 (Realtime removal) and this plan (id
  adoption, scroll, queue, suggestions, approval enrichment) — diff against the current file state.
- `getAiSdkTools`'s new `opts` parameter is additive and optional; every existing call site (the workflow engine)
  is unaffected.
- `saveWorkflowFromPlan`'s `automationLevel` parameter is optional; every existing call site not in this plan is
  unaffected.
