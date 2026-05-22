---
phase: 02-foundation-prove-the-agent
plan: "07"
subsystem: workflow-engine
tags: [inngest, l2-approval, durable-execution, observability, activity-log]
dependency_graph:
  requires: ["02-02", "02-03", "02-05"]
  provides: ["executeWorkflowRun", "writeActivity", "createApproval", "resolveApprovalRow", "approveItem", "rejectItem", "InlineApprovalCard"]
  affects: ["02-06-message-stream"]
tech_stack:
  added: []
  patterns:
    - "step.waitForEvent with CEL async.data.approvalId for L2 pause/resume"
    - "ON CONFLICT DO NOTHING for idempotent activity writes"
    - "resolveApprovalRow ownership check before inngest.send (auth before event)"
    - "module-level state in tests for vi.doMock factory closure sharing"
key_files:
  created:
    - lib/workflows/activity.ts
    - lib/workflows/approvals.ts
    - lib/inngest/functions/execute-workflow-run.ts
    - app/app/approvals/actions.ts
    - components/chat/inline-approval-card.tsx
  modified:
    - lib/integrations/shopify/mutations.ts
    - app/api/inngest/route.ts
    - tests/unit/workflow-engine.test.ts
    - tests/unit/l2-approval-flow.test.ts
    - tests/unit/shopify-mutations.test.ts
decisions:
  - "[02-07] CEL if: async.data.approvalId NOT event.data — async=awaited event, event=original trigger (Pitfall 1)"
  - "[02-07] UUID Zod validation in Server Actions requires valid UUIDs in test fixtures"
  - "[02-07] Module-level _testState object bypasses vi.doMock closure isolation in Vitest"
  - "[02-07] activity.ts uses workflow_run_id=idempotency_key as placeholder in mutations.ts (engine-level writeActivity has canonical run context)"
metrics:
  duration: "13 minutes"
  completed_date: "2026-05-22"
  tasks: 3
  files: 10
---

# Phase 02 Plan 07: Workflow Engine Summary

Durable L1/L2/L3 workflow execution with idempotent Activity logging, CEL-safe L2 pause/resume via `step.waitForEvent(if: async.data.approvalId)`, Server Actions that re-verify ownership before firing Inngest events, and a full-fidelity inline approval card with private Realtime sync.

## What Was Built

### Task 1: Activity writer + Approvals helper + Shopify mutations observability

**lib/workflows/activity.ts** — `writeActivity(userId, input)` inserts activity_entries via serviceDb with `ON CONFLICT DO NOTHING` on the `unique(workflow_run_id, step_id)` constraint. Called BEFORE every external effect (WF-06 + CLAUDE.md observability constraint). Retry-safe by design.

**lib/workflows/approvals.ts** — `createApproval(userId, input)` inserts a pending approval row with 14-day expiry and a correlation `inngest_event_key`. `resolveApprovalRow(approvalId, userId, decision)` performs an ownership check (select by id + user_id) before updating — returns null if not owned (T-2-07-02).

**lib/integrations/shopify/mutations.ts** — Replaced `// ACTIVITY_TODO (02-07)` call-sites in `updateProduct` and `updateInventory` with real `await writeActivity(...)` invocations placed BEFORE the Shopify GraphQL call. Closes the observability gap documented in 02-03.

**tests/unit/workflow-engine.test.ts** — 7 active tests covering: writeActivity inserts via serviceDb, ON CONFLICT DO NOTHING called on each invocation, field inclusion (user_id/workflow_run_id/step_id/action_type/result), createApproval pending status + 14d expiry, resolveApprovalRow ownership rejection, resolveApprovalRow approved path (status + resolved_at + resolved_by_path).

**tests/unit/shopify-mutations.test.ts** — Extended with 3 call-ORDER tests: `updateProduct` calls writeActivity BEFORE shopifyWrite, `updateInventory` calls writeActivity BEFORE shopifyWrite, writeActivity receives correct before_state and action_type.

### Task 2: executeWorkflowRun Inngest function

**lib/inngest/functions/execute-workflow-run.ts** — Full durable workflow engine:
- `step.run('load-and-create-run')` loads workflow + version + creates workflow_runs row (status: running)
- L1 path: marks `paused_manual` + returns (no approval row created)
- L2 path: `createApproval` → set `paused_for_approval` → `step.waitForEvent('wait-approval-${i}', { event: 'approval.resolved', timeout: '14d', if: \`async.data.approvalId == "${approval.id}"\` })` — correct CEL per Pitfall 1
- L2 on null (timeout): sets `expired`; on rejected: auth re-check + sets `failed`; on approved: auth re-check + executes via `runWorkflowStep`
- L3 path: executes directly + writeActivity BEFORE effect
- All step.run IDs are deterministic: `execute-step-${i}-${workflowStep.id}` (Pitfall 6)

**app/api/inngest/route.ts** — `executeWorkflowRun` added to serve() functions list.

### Task 3: Approval Server Actions + Inline Approval Card

**app/app/approvals/actions.ts** — `approveItem(approvalId, path)` and `rejectItem(approvalId, reason?)` Server Actions with:
- Zod UUID validation
- `getClaims()` authentication
- `resolveApprovalRow()` ownership check BEFORE `inngest.send` (T-2-07-02: event alone cannot bypass auth)
- `inngest.send({ name: 'approval.resolved', data: { approvalId, decision } })` only if row update succeeded

**components/chat/inline-approval-card.tsx** — `"use client"` component with:
- Full-fidelity design (header with stakes indicator, action type badge, summary, reasoning, preview, impact warning)
- Supabase Realtime postgres_changes subscription with `{ config: { private: true } }` (Pitfall 5, T-2-07-04)
- Keyboard-accessible Approve/Reject buttons with `aria-label` (UX-03)
- Calls Server Actions; handles approval/rejection/expired resolved states

**tests/unit/l2-approval-flow.test.ts** — 9 tests: createApproval fields (pending status, 14d expiry, inngest_event_key correlation), resolveApprovalRow paths (approved+path, rejected+reason, null on wrong user), approveItem/rejectItem call order (resolveApprovalRow BEFORE inngest.send), inngest.send not called when ownership fails, inngest.send called exactly once with correct approvalId + decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod UUID validation in test fixtures**
- **Found during:** Task 3 test debugging
- **Issue:** Test fixtures used `"appr-1"` as approvalId, but the Server Actions apply `z.string().uuid()` validation which correctly rejects non-UUID strings, causing tests to silently return early with `{ error: "Invalid approval ID" }` before reaching the mocked functions
- **Fix:** Replaced test fixture IDs with valid UUIDs (`550e8400-e29b-41d4-a716-44665544000x`)
- **Files modified:** tests/unit/l2-approval-flow.test.ts

**2. [Rule 1 - Bug] vi.doMock closure isolation in Vitest**
- **Found during:** Task 3 test debugging
- **Issue:** Local variables captured in `vi.doMock` factory closures were not shared correctly with test assertions — `callOrder` arrays appeared empty even though functions were being called
- **Fix:** Used module-level `_testState` object for shared mutable state across vi.doMock factory boundaries. This pattern mirrors how the shopify-mutations tests use class constructor functions to avoid the same issue.
- **Files modified:** tests/unit/l2-approval-flow.test.ts

**3. [Rule 1 - Bug] TypeScript cast in executeWorkflowRun event typing**
- **Found during:** TypeScript check after Task 2
- **Issue:** `event as WorkflowRunRequestedEvent` caused TS2352 — Inngest's union type doesn't overlap with the custom type
- **Fix:** `event as unknown as WorkflowRunRequestedEvent` (double cast)
- **Files modified:** lib/inngest/functions/execute-workflow-run.ts

### Notes

- `writeActivity` in `mutations.ts` uses `idempotency_key` as a `workflow_run_id` placeholder since the mutation layer doesn't have the canonical run context. The workflow engine's own `writeActivity` calls (in `execute-workflow-run.ts`) use the real `run.id`. This is documented in the code.
- The `step.waitForEvent` CEL expression `if: async.data.approvalId == "${approval.id}"` is correct per Pitfall 1: `async` = the awaited/matched approval.resolved event (NOT the triggering event). This is the most critical correctness requirement in this plan.

## Known Stubs

None. All functionality is wired end-to-end. The `executeWorkflowRun` function calls real helper functions (`createApproval`, `resolveApprovalRow`, `writeActivity`, `runWorkflowStep`) without placeholders.

## Threat Flags

None. All surfaces introduced were planned and covered by the threat model in the plan.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| lib/workflows/activity.ts | FOUND |
| lib/workflows/approvals.ts | FOUND |
| lib/inngest/functions/execute-workflow-run.ts | FOUND |
| app/app/approvals/actions.ts | FOUND |
| components/chat/inline-approval-card.tsx | FOUND |
| .planning/phases/02-foundation-prove-the-agent/02-07-SUMMARY.md | FOUND |
| Commit 8e61393 (Task 1) | FOUND |
| Commit b57a22e (Tasks 2+3) | FOUND |
| npx vitest run: 0 failures | PASSED (220 tests) |
| npx tsc --noEmit | PASSED |
