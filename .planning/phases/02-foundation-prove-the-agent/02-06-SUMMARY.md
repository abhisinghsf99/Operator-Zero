---
phase: 02-foundation-prove-the-agent
plan: 06
subsystem: ui
tags: [sse, streaming, chat, anthropic, zustand, framer-motion, react-markdown, supabase-realtime, wcag]

# Dependency graph
requires:
  - phase: 02-01
    provides: "UI primitives (cn, shadcn/ui components), zustand, framer-motion, sonner installed"
  - phase: 02-02
    provides: "threads, messages, workflows, workflowVersions DB schema with inline_block_type/payload/status"
  - phase: 02-05
    provides: "streamChat, dispatchTool, getAnthropicToolDefinitions, buildSystemPrompt from lib/agent/runtime.ts"
  - phase: 02-07
    provides: "InlineApprovalCard component for approval_card inline block type"
provides:
  - "SSE Route Handler: POST /api/chat/[threadId]/send — force-dynamic, getClaims 401, chatRateLimit 429, streaming ReadableStream"
  - "Thread Server Actions: createThread (auto-name), renameThread, listThreads (reverse-chron), saveWorkflowFromPlan (draft workflow row)"
  - "Composer component with FIFO queue (hold+flush-once), saveDraftOnUnload/loadDraft pure functions, Sonner retry"
  - "MessageStream component: SSE consumer, latency indicator, inline block routing by type"
  - "WorkflowVisualizer: Framer Motion AnimatePresence staggered step-reveal + sr-only text equivalent"
  - "ReasoningBlock: collapsed default, aria-expanded Why? expander"
  - "ContentPreview: react-markdown sanitized (no rehype-raw — XSS prevention)"
  - "ThreadSidebar: reverse-chron list, New Thread button, aria-current, keyboard nav"
  - "Chat RSC pages: /app/chat and /app/chat/[threadId] gated on onboarding"
affects: [chat-surface, workflow-engine, approval-flow, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SSE Route Handler pattern: export const dynamic='force-dynamic', ReadableStream pump, getClaims+chatRateLimit before LLM"
    - "Composer FIFO queue: zustand store with enqueueSend/flushQueue, streaming flag, hold-then-flush-once"
    - "Draft persistence: saveDraftOnUnload/loadDraft via sessionStorage keyed by threadId"
    - "Inline block routing: message.inline_block_type switch → WorkflowVisualizer/InlineApprovalCard/ContentPreview/ReasoningBlock"
    - "Framer Motion step-reveal: AnimatePresence + motion.div with staggered transition delay i*0.15, sr-only text equivalent for a11y"
    - "react-markdown sanitized: no rehype-raw, no raw HTML passthrough (T-2-06-02)"
    - "Supabase Realtime {private:true}: channel config for cross-user leakage prevention (Pitfall 5)"

key-files:
  created:
    - "app/api/chat/[threadId]/send/route.ts — SSE streaming Route Handler"
    - "app/app/chat/actions.ts — thread Server Actions (createThread, renameThread, listThreads, saveWorkflowFromPlan)"
    - "app/app/chat/page.tsx — RSC chat index page with onboarding gate"
    - "app/app/chat/[threadId]/page.tsx — RSC chat thread page with await params"
    - "components/chat/composer.tsx — composer + FIFO queue store + draft-save pure functions"
    - "components/chat/message-stream.tsx — SSE consumer + inline block renderer + ChatThreadView"
    - "components/chat/thread-sidebar.tsx — thread list sidebar"
    - "components/chat/workflow-visualizer.tsx — Framer Motion step-reveal visualizer"
    - "components/chat/reasoning-block.tsx — collapsible Why? expander"
    - "components/chat/content-preview.tsx — sanitized markdown preview"
  modified:
    - "tests/integration/chat-stream.test.ts — 14 tests: SSE tokens, 401/429, composer queue, draft-save"

key-decisions:
  - "[02-06] SSE route is a Route Handler (not Inngest) — streaming requires force-dynamic ReadableStream, Inngest breaks streaming"
  - "[02-06] Composer queue pure functions (createComposerStore, saveDraftOnUnload, loadDraft) extracted for unit testing without browser"
  - "[02-06] InlineApprovalCard uses 'stakes' prop (not 'riskLevel') — discovered from 02-07 component interface"
  - "[02-06] workflowVersions has no 'created_by' column — uses 'created_by_thread_id'; Rule 1 fix applied during TypeScript check"
  - "[02-06] react-markdown used without rehype-raw to prevent XSS from model-generated markdown (T-2-06-02)"

patterns-established:
  - "SSE streaming: ReadableStream pump in Route Handler, not Server Action; data: JSON\\n\\n format"
  - "Inline block routing: server-persisted inline_block_type drives client component selection"
  - "FIFO queue pattern: zustand store holds sends during stream, flushQueue returns array and clears atomically"

requirements-completed: [CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, CONV-06, CONV-07, CONV-08, CONV-09]

# Metrics
duration: 7min
completed: 2026-05-22
---

# Phase 02 Plan 06: Conversation Surface Summary

**SSE streaming chat surface with Anthropic SDK pump (<2s first token target), FIFO composer queue, inline workflow visualizer (Framer Motion staggered), and XSS-safe markdown previews**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-22T09:11:00Z
- **Completed:** 2026-05-22T09:18:00Z
- **Tasks:** 3 (Task 1 + Task 2 + Task 3 co-committed)
- **Files modified:** 11

## Accomplishments

- SSE Route Handler with getClaims 401, chatRateLimit 429, thread ownership RLS, streaming ReadableStream pump, propose_workflow_plan inline block persistence, recordCost finalization
- Thread Server Actions: createThread (auto-name, brand-voice/memory inherited via agent_context), saveWorkflowFromPlan inserts draft workflow + version row
- Composer FIFO queue (hold during stream, flush exactly once) + saveDraftOnUnload/loadDraft pure functions — tested without browser
- WorkflowVisualizer with Framer Motion AnimatePresence staggered step-reveal + sr-only text equivalent + prefers-reduced-motion
- ReasoningBlock collapsed with aria-expanded "Why?" expander; ContentPreview with react-markdown (no rehype-raw — XSS prevention T-2-06-02)
- Supabase Realtime channel { private: true } in message-stream (T-2-06-05)

## Task Commits

1. **Task 1: SSE Route + Thread Actions + Composer store** - `1b0e78b` (feat)
2. **Task 2+3: Pages + MessageStream + ThreadSidebar + inline components** - `6cbab53` (feat)

## Files Created/Modified

- `app/api/chat/[threadId]/send/route.ts` — SSE streaming Route Handler (force-dynamic, getClaims, chatRateLimit, ReadableStream pump)
- `app/app/chat/actions.ts` — createThread, renameThread, listThreads, saveWorkflowFromPlan Server Actions
- `app/app/chat/page.tsx` — RSC chat index page gated on onboarding
- `app/app/chat/[threadId]/page.tsx` — RSC chat thread page with await params (Next.js 15)
- `components/chat/composer.tsx` — Composer + createComposerStore + saveDraftOnUnload + loadDraft
- `components/chat/message-stream.tsx` — ChatThreadView SSE consumer, inline block routing
- `components/chat/thread-sidebar.tsx` — Thread list + New Thread button (WCAG)
- `components/chat/workflow-visualizer.tsx` — Framer Motion step-reveal + sr-only equivalent
- `components/chat/reasoning-block.tsx` — Collapsed Why? expander (aria-expanded)
- `components/chat/content-preview.tsx` — Sanitized react-markdown (no raw HTML)
- `tests/integration/chat-stream.test.ts` — 14 tests: SSE tokens, 401/429 gates, composer queue hold+flush-once, draft-save recoverable

## Decisions Made

- SSE route is a Route Handler (not Inngest) — Inngest breaks streaming; force-dynamic + ReadableStream required
- Composer queue extracted as pure zustand store factory (`createComposerStore`) so queue behavior can be unit-asserted without a browser
- `InlineApprovalCard` uses `stakes` prop (not `riskLevel`) — discovered from 02-07 component interface during TypeScript check
- `workflowVersions` has no `created_by` column — uses `created_by_thread_id`; corrected during TypeScript check (Rule 1 auto-fix)
- `react-markdown` used without `rehype-raw` plugin to prevent XSS from model-generated markdown (T-2-06-02 mitigated)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] workflowVersions.created_by does not exist — uses created_by_thread_id**
- **Found during:** Task 1 (saveWorkflowFromPlan TypeScript check)
- **Issue:** Plan action used `created_by: userId` but the schema column is `created_by_thread_id` (nullable UUID, not user ID)
- **Fix:** Removed the `created_by` field from the insert; the column is optional and nullable
- **Files modified:** `app/app/chat/actions.ts`
- **Verification:** `npx tsc --noEmit` passes after fix
- **Committed in:** `1b0e78b` (Task 1 commit)

**2. [Rule 1 - Bug] InlineApprovalCard prop is `stakes` not `riskLevel`**
- **Found during:** Task 2 (message-stream TypeScript check)
- **Issue:** message-stream used `riskLevel` prop but InlineApprovalCard (from 02-07) defines `stakes`
- **Fix:** Changed prop name to `stakes` and added required `reasoning` and `initialStatus` props
- **Files modified:** `components/chat/message-stream.tsx`
- **Verification:** `npx tsc --noEmit` passes after fix
- **Committed in:** `6cbab53` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — schema/interface mismatch)
**Impact on plan:** Both fixes necessary for TypeScript correctness. No scope creep.

## Issues Encountered

None — plan executed successfully with 2 minor interface corrections caught by TypeScript.

## User Setup Required

None — no new external service configuration required. Uses existing Anthropic, Supabase, and Upstash credentials.

## Next Phase Readiness

- Conversation surface complete — CONV-01..09 satisfied
- SSE streaming route ready for Sarah to send messages and receive streamed responses
- WorkflowVisualizer ready for inline workflow plan proposals
- 02-08 (final integration/polish) can proceed

## Self-Check

- [x] `npx vitest run` — 234 tests pass, 0 failures
- [x] `npx tsc --noEmit` — clean
- [x] SSE route exports `dynamic = "force-dynamic"` and `POST` handler
- [x] Composer exports `createComposerStore`, `saveDraftOnUnload`, `loadDraft`
- [x] WorkflowVisualizer contains `motion` (Framer Motion)
- [x] ReasoningBlock contains `aria-expanded`
- [x] ContentPreview uses `react-markdown` without `rehype-raw`
- [x] Supabase Realtime channel uses `{ private: true }`

---
*Phase: 02-foundation-prove-the-agent*
*Completed: 2026-05-22*
