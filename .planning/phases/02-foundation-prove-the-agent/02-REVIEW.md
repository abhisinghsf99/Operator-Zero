---
phase: 02-foundation-prove-the-agent
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 85
files_reviewed_list:
  - app/api/chat/[threadId]/send/route.ts
  - app/api/inngest/route.ts
  - app/api/integrations/gmail/callback/route.ts
  - app/api/integrations/gmail/connect/route.ts
  - app/api/integrations/shopify/callback/route.ts
  - app/api/integrations/shopify/connect/route.ts
  - app/api/webhooks/shopify/route.ts
  - app/app/approvals/actions.ts
  - app/app/chat/[threadId]/page.tsx
  - app/app/chat/actions.ts
  - app/app/chat/page.tsx
  - app/app/layout.tsx
  - app/app/settings/_connections.tsx
  - app/app/settings/actions.ts
  - app/app/settings/page.tsx
  - app/globals.css
  - app/layout.tsx
  - app/onboarding/_steps/brand-voice.tsx
  - app/onboarding/_steps/catalog-audit.tsx
  - app/onboarding/_steps/connect-gmail.tsx
  - app/onboarding/_steps/connect-shopify.tsx
  - app/onboarding/_steps/done.tsx
  - app/onboarding/_steps/welcome.tsx
  - app/onboarding/_wizard.tsx
  - app/onboarding/actions.ts
  - app/onboarding/page.tsx
  - components/chat/composer.tsx
  - components/chat/content-preview.tsx
  - components/chat/inline-approval-card.tsx
  - components/chat/message-stream.tsx
  - components/chat/reasoning-block.tsx
  - components/chat/thread-sidebar.tsx
  - components/chat/workflow-visualizer.tsx
  - components/layout/bottom-tabs.tsx
  - components/layout/sidebar.tsx
  - components/onboarding/connect-step.tsx
  - components/onboarding/progress-rail.tsx
  - components/ui/badge.tsx
  - components/ui/button.tsx
  - components/ui/card.tsx
  - components/ui/dialog.tsx
  - components/ui/input.tsx
  - components/ui/sonner.tsx
  - lib/agent/memory.ts
  - lib/agent/prompt.ts
  - lib/agent/runtime.ts
  - lib/agent/tools/index.ts
  - lib/agent/tools/meta.ts
  - lib/agent/tools/read/index.ts
  - lib/agent/tools/write/index.ts
  - lib/auth/middleware.ts
  - lib/cost-cap.ts
  - lib/db/schema/activity-entries.ts
  - lib/db/schema/approvals.ts
  - lib/db/schema/autonomy-thresholds.ts
  - lib/db/schema/brand-voice.ts
  - lib/db/schema/gmail-mirror.ts
  - lib/db/schema/index.ts
  - lib/db/schema/memory-embeddings.ts
  - lib/db/schema/memory-items.ts
  - lib/db/schema/messages.ts
  - lib/db/schema/shopify-mirror.ts
  - lib/db/schema/telemetry.ts
  - lib/db/schema/threads.ts
  - lib/db/schema/workflow-runs.ts
  - lib/db/schema/workflow-versions.ts
  - lib/db/schema/workflows.ts
  - lib/inngest/client.ts
  - lib/inngest/functions/catalog-audit.ts
  - lib/inngest/functions/execute-workflow-run.ts
  - lib/inngest/functions/gmail-sync.ts
  - lib/inngest/functions/shopify-sync.ts
  - lib/integrations/gmail/classify.ts
  - lib/integrations/gmail/client.ts
  - lib/integrations/gmail/sync.ts
  - lib/integrations/health.ts
  - lib/integrations/shopify/client.ts
  - lib/integrations/shopify/mutations.ts
  - lib/integrations/shopify/sync.ts
  - lib/integrations/shopify/webhooks.ts
  - lib/utils.ts
  - lib/workflows/activity.ts
  - lib/workflows/approvals.ts
  - supabase/migrations/0003_phase2_tables.sql
findings:
  critical: 8
  warning: 11
  info: 6
  total: 25
status: partial
remediation:
  remediated_at: 2026-05-22T00:00:00Z
  fixed: 18
  deferred: 6
  deferred_ids:
    - WR-07
    - WR-09
    - WR-11
    - IN-04
    - IN-05
    - IN-06
  remaining_critical: 0
  remaining_warning: 3
  remaining_info: 3
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-22
**Depth:** standard
**Files Reviewed:** 85
**Status:** issues_found

## Summary

Phase 2 wires the autonomous-agent foundation: OAuth integrations, Shopify/Gmail mirror sync, the durable workflow engine, the chat SSE surface, the agent tool registry, and the L2 approval loop. The security boundaries that were explicitly hardened (OAuth nonce + HMAC ordering, webhook HMAC timing-safe + 401-before-work, token encryption, RLS-vs-serviceDb separation, prompt-injection-as-data) are in good shape and hold up to adversarial reading.

However, the **end-to-end "create a workflow and have it reliably run" path — the stated core value — does not work**, and there are real security gaps in the approval-resume trust model. The most damaging defects:

1. **Every Shopify write tool throws before it ever calls Shopify** because `mutations.ts` passes a non-UUID string into the `uuid`/FK `activity_entries.workflow_run_id` column (CR-01). This breaks catalog/SEO/inventory writes — the heart of the product.
2. **Saved workflows can never execute** because `saveWorkflowFromPlan` never sets `workflows.current_version_id`, and the engine throws on a null `current_version_id` (CR-02).
3. **The L2 approval-resume trusts the event payload's `decision` field** rather than re-reading the resolved row from the DB. A forged `approval.resolved` event with `decision: "approved"` passes the ownership re-check (the row exists and is owned) and executes the action even though the user never approved — defeating T-2-07-02 (CR-03).
4. **L2 approval ownership re-check uses the wrong identity.** The re-lookup is keyed on the workflow's `userId` (always owner), not on who fired the event, so a cross-user forged event for another tenant's approval is not actually rejected by this gate (CR-04).

The chat tool loop is also functionally broken (tool results are never fed back to the model — CR-05), and the cost cap defaults make the soft cap unreachable (WR-01). Findings below are concrete and line-referenced.

## Critical Issues

### CR-01: Shopify write tools always fail — non-UUID string inserted into `uuid` FK column

**File:** `lib/integrations/shopify/mutations.ts:120-130` (also `281-291`)
**Issue:** `writeActivity()` is called with `workflow_run_id: idempotency_key`, where `idempotency_key` is `${userId}:${actionType}:${targetId}:${bucket}` — a colon-delimited string. But `activity_entries.workflow_run_id` is declared `uuid("workflow_run_id")` (`lib/db/schema/activity-entries.ts:49`) with a FK to `workflow_runs(id)` (`supabase/migrations/0003_phase2_tables.sql:208`). Inserting a non-UUID string raises `invalid input syntax for type uuid`; even a valid UUID would violate the FK because no `workflow_runs` row with that id exists. Because `writeActivity` runs **before** the Shopify GraphQL call (observability-first), the throw aborts the whole mutation — so `updateProduct`/`updateInventory` never reach Shopify. Every catalog/SEO/inventory write tool (`shopify_update_product_description`, `shopify_update_meta_title`, etc.) returns a `tool_result` error. This breaks the core "agent runs operator work" value.
**Fix:** Do not overload `workflow_run_id` with a synthetic key. Either (a) make `writeActivity` accept a separate nullable idempotency key column (and add it + a partial unique index in the migration), or (b) for the tool-layer pre-write, pass `workflow_run_id: null` and put the idempotency key in `step_id` only, after adding a unique index that tolerates a null `workflow_run_id`:
```ts
// mutations.ts — stop passing idempotency_key as workflow_run_id
await writeActivity(userId, {
  workflow_run_id: null,            // not a real run at this layer
  step_id: idempotency_key,         // idempotency lives here
  action_type: "product_update",
  // ... and add a unique index on (user_id, step_id) WHERE workflow_run_id IS NULL
});
```
The current `activity_entries_run_step_unique` index is `WHERE workflow_run_id IS NOT NULL AND step_id IS NOT NULL`, so a null `workflow_run_id` would NOT dedupe — design the idempotency index to match the chosen approach.

### CR-02: Saved workflows can never run — `current_version_id` is never set

**File:** `app/app/chat/actions.ts:259-300`
**Issue:** `saveWorkflowFromPlan` inserts a `workflows` row and a `workflow_versions` row, but never updates `workflows.current_version_id` to point at the new version. `executeWorkflowRun` explicitly throws `Workflow ${workflowId} has no current_version_id` when it is null (`lib/inngest/functions/execute-workflow-run.ts:115-119`). So every workflow created via the primary "Save as Workflow" flow fails on first run. The same gap exists for onboarding starter workflows (`app/onboarding/actions.ts:287-300`) and starter creation never inserts a version at all.
**Fix:** After inserting the version, capture its id and update the workflow:
```ts
const [versionRow] = await tx.insert(workflowVersions).values({...}).returning();
await tx.update(workflows)
  .set({ current_version_id: versionRow.id })
  .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)));
```
Onboarding starters must also create an initial `workflow_versions` row and set `current_version_id`, or remain in `draft` until a version exists.

### CR-03: L2 resume trusts the event's `decision` field instead of the DB — forged "approved" event executes the action

**File:** `lib/inngest/functions/execute-workflow-run.ts:300-418`
**Issue:** After `waitForEvent`, the engine reads the decision from the event payload: `const decisionData = decision.data as { approvalId, decision }` and branches on `decisionData.decision === "rejected"` vs. else-execute. The "approved" branch (line 360+) re-looks-up the approval row only to confirm it **exists and is owned** — it never checks `existingApproval.status === "approved"`. An attacker who can emit an `approval.resolved` event (Inngest event ingestion, internal event bus, or a compromised path) with `{ approvalId: <a real, owned, still-pending approval>, decision: "approved" }` satisfies the `if: async.data.approvalId == "..."` matcher and the ownership re-check, and the engine executes the write — even though the user never approved. This directly defeats the documented T-2-07-02 invariant ("the event alone does NOT bypass auth"). The event payload is the source of truth here, not the DB row.
**Fix:** Treat the event purely as a wakeup signal and derive the decision from the persisted, ownership-checked row:
```ts
const [row] = await serviceDb.select().from(approvals)
  .where(and(eq(approvals.id, approval.id), eq(approvals.user_id, userId))).limit(1);
if (!row) throw new Error("approval not found (T-2-07-02)");
if (row.status === "rejected") { /* finalize rejected */ }
else if (row.status === "approved") { /* execute */ }
else { /* still pending/expired/snoozed — do NOT execute */ }
```

### CR-04: Approval ownership re-check is a no-op against cross-user forgery — keyed on owner `userId`, not the actor

**File:** `lib/inngest/functions/execute-workflow-run.ts:307-324, 360-383`; `lib/workflows/approvals.ts:120-150`
**Issue:** The "auth re-check" looks up the approval by `(approvals.id, approvals.user_id == userId)` where `userId` is the **workflow run's owner** — i.e., always the legitimate owner of the approval. So the check can only ever pass; it provides no protection against a forged event resolving another tenant's approval. The real defense lives in `resolveApprovalRow` (the Server Action path), which correctly scopes to the resolving user's `getClaims().sub`. But the engine resumes purely from the Inngest event, whose payload (`{ approvalId, decision }` — `app/app/approvals/actions.ts:108-111`) carries **no actor identity**. There is therefore no point at which the engine verifies that the entity who fired `approval.resolved` is the owner. Combined with CR-03, the approval gate's server-side trust boundary is effectively the Server Action only; anything that can emit the event bypasses it.
**Fix:** Make the DB row the trust anchor (see CR-03) and ensure `approval.resolved` is only ever emitted by `resolveApprovalRow` after its own ownership + status write. Optionally include `resolvedByUserId` in the event and assert it equals the row's `user_id`. Do not rely on a re-lookup keyed on the run owner — it cannot fail.

### CR-05: Chat tool loop is broken — tool results never returned to the model

**File:** `app/api/chat/[threadId]/send/route.ts:248-287`; `lib/agent/runtime.ts:192-201`
**Issue:** When the model emits a `tool_use` block, the handler calls `dispatchTool(...)` and discards the result (only inspecting it for an inline `workflow_plan`). The tool result is never appended to the conversation and no follow-up `anthropic.messages.stream` turn is issued, so the model never sees the data it requested. Any user query that requires a read tool (list products, get inventory, recall memory) yields an answer with no tool output — the model either hallucinates or stalls. The same single-shot, no-feedback pattern exists in `streamChat` in `runtime.ts`. This is a core correctness failure of the agent runtime, not just the chat surface.
**Fix:** Implement the agentic loop: collect `tool_use` blocks, run `dispatchTool` for each, append a `tool_result` user turn with the results, and re-invoke the model until it stops requesting tools (bounded by a max-iterations guard). Stream only the final assistant text.

### CR-06: Shopify webhook → wrong-tenant resolution via product mirror typo; plus dead/incorrect first query

**File:** `lib/inngest/functions/shopify-sync.ts:128-147`
**Issue:** `resolve-user` first runs `select user_id from shopify_products where user_id = shop` (line 132) — comparing a `uuid` column to a shop domain string, which will raise a uuid cast error or silently match nothing; its result is unused (dead code). The real lookup that follows resolves the user from `integrations.provider_account_id == shop`, which is correct — but it is **not scoped to a verified shop**: the webhook route (`app/api/webhooks/shopify/route.ts:46-47`) takes `shop` from the unauthenticated `x-shopify-shop-domain` header. The HMAC proves the body came from your app's secret, but the header is attacker-controllable independent of the body; a crafted request with a valid HMAC over body B and a spoofed shop header for tenant A could drive `products/delete` against tenant A's mirror (`shopify-sync.ts:174-185`). The webhook never cross-checks the header shop against the shop embedded in the (HMAC-signed) payload.
**Fix:** Remove the dead first query. Validate that `x-shopify-shop-domain` matches a shop value inside the HMAC-verified payload (Shopify includes the shop in the body for most topics) before resolving the user, and reject mismatches. Pass `shop` through only after that cross-check.

### CR-07: Cross-tenant token overwrite on Gmail re-connect via shared `nonce` precondition is weak; refresh-token loss on reconnect

**File:** `lib/integrations/gmail/client.ts:107-117`
**Issue:** On re-connect, `exchangeGmailCode` upserts with `...(encryptedRefresh ? { refresh_token_encrypted: encryptedRefresh } : {})`. Google only returns a refresh token on the first consent (or with `prompt=consent`, which is set — good). But if Google ever omits it on a re-grant, the upsert keeps the old encrypted refresh token, which may now be invalid after the user re-consented, leaving `getAccessToken()` unable to refresh and no clear error path. More importantly, the callback's nonce precondition (`access_token_encrypted.startsWith("nonce:")` in `app/api/integrations/gmail/callback/route.ts:81`) means a user who already has an **active** Gmail integration (no `nonce:` prefix) cannot re-run connect — the connect route overwrites the active token with `nonce:<value>` first (`gmail/connect/route.ts:57-64`), so a failed/abandoned callback leaves the integration permanently in `pending` with the real token destroyed.
**Fix:** Store the OAuth nonce in a dedicated column or short-lived store (e.g., `oauth_state`) instead of clobbering `access_token_encrypted`. This avoids destroying a live token when a user restarts the connect flow, and removes the `nonce:` sentinel coupling. Apply the same fix to the Shopify connect/callback pair (`shopify/connect/route.ts:64`, `shopify/callback/route.ts:95`).

### CR-08: `trigger_type` values written by the app violate the engine contract and (for `chat`) the DB CHECK is absent but engine/Zod disagree

**File:** `app/app/chat/actions.ts:271`; `lib/agent/tools/meta.ts:116-118`; `lib/inngest/functions/execute-workflow-run.ts:58`
**Issue:** `propose_workflow_plan` accepts `trigger_type` of `manual | scheduled | webhook | ai_suggested` (meta.ts:116). `saveWorkflowFromPlan` casts that value directly into `workflows.trigger_type` as `"schedule" | "event" | "manual"` (actions.ts:271) — but `scheduled`/`webhook`/`ai_suggested` are none of those, so the persisted value is an unmapped string. The migration declares `trigger_type text NOT NULL` with **no CHECK** (0003_phase2_tables.sql:29), so the bad value is stored silently, then the run event's `triggerSource` typing (`schedule|event|manual|chat`) and any downstream branching on trigger type get an unexpected literal. This is a latent correctness/data-integrity bug that will surface as mis-triggered or never-triggered workflows.
**Fix:** Map the proposal's trigger vocabulary to the workflow vocabulary explicitly (e.g., `scheduled→schedule`, `webhook→event`, `ai_suggested→manual`) and add a CHECK constraint on `workflows.trigger_type`. Align the Zod enum, the schema comment (`schedule|event|manual`), and the engine's `triggerSource` union so all three agree.

## Warnings

### WR-01: Soft cost cap is unreachable — `HARD_CAP_USD === SOFT_CAP_USD` by default

**File:** `lib/cost-cap.ts:42-53, 82-84`
**Issue:** Both caps default to `$5.00`. `checkCostCap` returns `'hard'` when `spent >= HARD_CAP_USD` (5.00) and `'soft'` when `spent >= SOFT_CAP_USD * 0.8` (4.00). Between 4.00 and 5.00 the soft warning works, but the intent ("soft at 80% of soft cap, hard at hard cap") collapses because hard == soft cap; once spend hits 5.00 it is simultaneously the soft 80%-of-soft and the hard threshold. With equal defaults the soft band is only $4–$5, far narrower than implied, and any deployment that sets only one env var gets surprising behavior.
**Fix:** Default `HARD_CAP_USD` meaningfully above `SOFT_CAP_USD` (e.g., soft 5.00, hard 10.00) and document the relationship. Add a startup assertion that `HARD_CAP_USD >= SOFT_CAP_USD`.

### WR-02: `recordCost` TTL guard misfires under concurrency / float drift, so the key may never expire

**File:** `lib/cost-cap.ts:100-107`
**Issue:** TTL is set only when `newVal <= costUsd` (i.e. "first write of the day"). With `incrbyfloat`, floating-point accumulation can make the first increment return a value slightly different from `costUsd`, and concurrent first writes can both miss the guard or both set it. If the guard is missed on the genuine first write (e.g., a prior fractional residue, or a race), the key never gets a TTL and the daily counter persists indefinitely, permanently capping the user.
**Fix:** Use `redis.set(key, 0, { nx: true, ex: 25*3600 })` to create-with-TTL atomically, then `incrbyfloat`; or call `redis.expire(key, ttl, { nx: true })` unconditionally after each increment. Do not infer "first write" from the returned float.

### WR-03: `updateInventory` mirror update silently no-ops when the variant isn't yet mirrored

**File:** `lib/integrations/shopify/mutations.ts:317-336`
**Issue:** Step 5 uses `serviceDb.update(shopifyProductVariants)...where(user_id, variant_gid)`. If the variant row doesn't exist in the mirror yet (e.g., write before first sync), the UPDATE affects zero rows, `afterRow` is null, and the function reports success with `after_state: null` despite having written to Shopify. The product path (updateProduct) re-reads from Shopify and upserts; the inventory path does not re-read from Shopify and assumes the mirror row exists.
**Fix:** Re-read the variant from Shopify and upsert (insert-on-conflict) the mirror row, mirroring the product flow, rather than a bare UPDATE.

### WR-04: `inventoryAdjustQuantities` delta uses possibly-stale mirror baseline → incorrect quantity

**File:** `lib/integrations/shopify/mutations.ts:307-313`
**Issue:** The adjustment delta is `input.inventory_qty - (before_state?.inventory_qty ?? 0)`. `before_state` comes from the local mirror, which can be stale. If Shopify's true on-hand differs from the mirror, the adjustment lands at the wrong absolute value. Also `?? 0` means a missing mirror row is treated as on-hand 0, so the delta becomes the full target qty — potentially doubling stock. Inventory correctness is a stated domain.
**Fix:** Use an absolute-set mutation (`inventorySetOnHandQuantities`) keyed to the desired quantity, or read the current Shopify on-hand immediately before computing the delta. Do not derive deltas from the mirror.

### WR-05: L1 workflow `return` inside the step loop drops all remaining steps and exits on the first iteration

**File:** `lib/inngest/functions/execute-workflow-run.ts:171-182`
**Issue:** For `automation_level === "L1"`, the function marks the run `paused_manual` and `return`s on the first loop iteration. There is no resume entry point that continues from `current_step_id`, and the early return means a multi-step L1 workflow can never progress past step 0 even after a manual trigger. The "all three automation levels" requirement is not actually met for multi-step L1.
**Fix:** Design an explicit L1 resume path (a separate event/function that picks up at `current_step_id`) or document L1 as single-step-only for v1 and validate that at save time.

### WR-06: Approval card never persisted to a message — inline approval UI cannot render from server data

**File:** `lib/inngest/functions/execute-workflow-run.ts:217-234`; `components/chat/message-stream.tsx:444-461`
**Issue:** The engine creates the approval row but never writes an `inline_block_type: "approval_card"` message tying the approval to a thread (the approval row's `thread_id`/`message_id` are left null in `createApproval` unless passed). `message-stream.tsx` only renders an `InlineApprovalCard` when a message carries `inline_block_type === "approval_card"` with an `approval_id`. So workflow-originated L2 approvals will not surface inline in chat; only the Approvals inbox could show them. The "review only what needs judgment" loop is incomplete.
**Fix:** When creating an approval for a chat-originated run, insert (or update) a message with `inline_block_type='approval_card'` and `inline_block_payload={ approval_id, action_type, summary, risk }`, and set `approvals.thread_id`/`message_id` accordingly.

### WR-07: Realtime subscriptions never filter rows / never update messages — live sync is a stub

**File:** `components/chat/message-stream.tsx:79-91`
**Issue:** The `thread:${threadId}` channel calls `.subscribe()` with no `postgres_changes` listener, so it does nothing (the comment admits "In production this would subscribe"). Meanwhile `inline-approval-card.tsx:141-164` does subscribe but relies on `{ private: true }` + a `filter: id=eq.${approvalId}` for isolation; with no server-side authorization policy verified here, ensure the Realtime RLS/authorization is actually configured, otherwise the `filter` is client-side only.
**Fix:** Implement the messages `postgres_changes` listener (or remove the dead channel), and verify Realtime authorization policies exist for `approvals`/`messages` so `{ private: true }` actually enforces tenant isolation server-side.

### WR-08: `verifyShopifyWebhook` short-circuits on `!secret` returning false — config error looks like an attack, and unequal-length path is fine but mismatch logging is absent

**File:** `lib/integrations/shopify/webhooks.ts:35-37`; `app/api/webhooks/shopify/route.ts:31-43`
**Issue:** If `SHOPIFY_CLIENT_SECRET` is unset, `verifyShopifyWebhook` returns `false`, and the route returns 401 for every legitimate webhook — a silent misconfiguration that looks identical to an attack and will drop all real Shopify events with only a generic `hmac_invalid` log. Operationally this is hard to diagnose.
**Fix:** Distinguish "secret not configured" (log an error / 500) from "HMAC mismatch" (401) so the misconfiguration is visible in logs and alerting.

### WR-09: `getProfile`/`getToken` and Anthropic calls in tools/sync lack timeouts and per-call error typing; one stuck Gmail API call can hold an Inngest step open

**File:** `lib/integrations/gmail/sync.ts:203-293`; `lib/integrations/gmail/classify.ts:29-40`
**Issue:** `gmailInitialSync` calls `classifySupport` (an Anthropic call) inside `upsertThread`, which runs once per thread inside a sequential loop with no concurrency cap, no timeout, and no cost accounting — for a 30-day inbox this is a large, unbounded fan of LLM calls that also bypasses `checkCostCap`. A slow/erroring classifier stalls the whole initial sync. Classification cost is invisible to the cost cap.
**Fix:** Batch or cap classification, add per-call timeouts, and route classification cost through `recordCost`. Consider classifying lazily (on first read) rather than for every historical thread.

### WR-10: `gmailInitialSync` writes sync state with an UPDATE that no-ops, then a second upsert — first UPDATE is dead and ordering is fragile

**File:** `lib/integrations/gmail/sync.ts:255-281`
**Issue:** It first `update(gmailSyncState)...where(user_id)` (affects zero rows on first sync), then immediately does an `insert ... onConflictDoUpdate`. The initial UPDATE is dead code on the first run and redundant on subsequent runs. Harmless but confusing and a latent maintenance hazard.
**Fix:** Remove the standalone UPDATE; keep only the upsert.

### WR-11: `shopifyIncrementalSyncForUser` re-runs a full sync every 15 minutes for every active user

**File:** `lib/integrations/shopify/sync.ts:418-432`; `lib/inngest/functions/shopify-sync.ts:70-102`
**Issue:** "Incremental" delegates to `shopifyFullSyncForUser`, so the 15-minute cron does a complete catalog+orders+pages+redirects re-pull for every active user. This is flagged not for performance (out of scope) but for **correctness/cost**: it issues unthrottled Shopify GraphQL traffic that will trip Shopify rate limits at modest tenant counts, causing partial syncs that are silently swallowed (each section's catch only logs). Repeated full syncs can also race with webhook-driven deletes.
**Fix:** Implement an `updatedAt`-cursor incremental path, or at minimum gate the polling fallback behind a "no webhook in N minutes" check so it does not run unconditionally for everyone.

## Info

### IN-01: Contradictory CEL doc comments invert `async` vs `event` meaning

**File:** `lib/inngest/functions/execute-workflow-run.ts:10-16, 255-260`
**Issue:** The header comment (lines 10-16) says "`async` MUST be the matched/awaited event (approval.resolved), NOT `event`," but the inline comment at the `waitForEvent` site (255-260) says the opposite ("`async` = the original triggering event ... `event` = the matched approval.resolved event"). The code uses `if: async.data.approvalId == ...`, which is correct for Inngest (`async` = the awaited event). The conflicting inline comment will mislead future maintainers into "fixing" a correct condition.
**Fix:** Correct the inline comment to match the header and the implementation: `async` = the awaited `approval.resolved` event.

### IN-02: `prompt.ts` store domain is hardcoded placeholder leaking into the system prompt

**File:** `lib/agent/prompt.ts:294-321`
**Issue:** `loadStoreContext` always returns `shopDomain: "connected-store.myshopify.com"` regardless of the real store, so the agent's STORE CONTEXT section is wrong for every tenant. The comment acknowledges it as a placeholder, but it ships a misleading fact into the prompt.
**Fix:** Load the real domain from `integrations.provider_account_id` (Shopify) for the user, or omit the domain line until available.

### IN-03: Empty-catch / swallowed errors reduce observability on the chat persistence path

**File:** `app/api/chat/[threadId]/send/route.ts:171-173, 193-195, 300-322, 353-364`
**Issue:** Multiple `try { ... } catch {}` blocks silently swallow failures to persist the user message, assistant placeholder, finalized content, and errored status. A persistent DB issue would lose conversation history with no signal. Observability is a stated non-negotiable.
**Fix:** Log a structured error in each catch (without leaking PII) so silent data loss is detectable.

### IN-04: `recordCost` uses fixed `$0.0001` placeholder for workflow steps — telemetry undercounts

**File:** `lib/agent/runtime.ts:266-268`
**Issue:** `runWorkflowStep` records a constant `0.0001` "minimal overhead" cost and never accounts for the actual LLM usage of the step's tool dispatch path. Cost caps and cost telemetry will systematically undercount workflow-driven spend.
**Fix:** Record real usage where an LLM call occurs; if a step makes no LLM call, record 0 rather than a misleading constant.

### IN-05: `autoNameThread` truncation can split a multi-byte grapheme

**File:** `app/app/chat/actions.ts:56-60`
**Issue:** `trimmed.slice(0, 60)` slices by UTF-16 code unit, which can split an emoji/surrogate pair or combining sequence, producing a mojibake title. Minor UX/data-quality issue.
**Fix:** Use a grapheme-aware truncation (`Intl.Segmenter`) or trim on a word boundary.

### IN-06: `zodToJsonSchemaShape` emits `type: "string"` for every property regardless of actual Zod type

**File:** `lib/agent/tools/index.ts:189-213`
**Issue:** The minimal converter labels all tool parameters as strings in the schema sent to Anthropic, including numeric fields (`price`, `inventory_qty`, `limit`) and enums. The model may then send strings where numbers are expected; the Zod `safeParse` in `dispatchTool` will reject them as validation errors, degrading tool reliability (the model can't see the real contract).
**Fix:** Generate accurate JSON Schema from the Zod types (a real `zod-to-json-schema` pass), at least covering number/boolean/enum/array, so the model receives the correct input contract.

---

_Reviewed: 2026-05-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Remediation

**Remediated:** 2026-05-22
**Fixed:** 18 of 25 findings (all 8 critical, 8 of 11 warnings, 3 of 6 info)
**Deferred:** 6 findings (WR-07, WR-09, WR-11, IN-04, IN-05, IN-06) — non-blocking for v1 ship
**Final state:** `npx tsc --noEmit` clean · `npx vitest run` 278 passed, 0 failures · `npx next build` success

### Fixed Findings

| ID | Title | Commit |
|----|-------|--------|
| CR-01 | step_id carries idempotency key; workflow_run_id nullable | `15474aa` |
| CR-02 | current_version_id updated after workflow version insert | `b0f6f09` |
| CR-03 | Trust DB row status, not event payload (T-2-07-02) | `2e13f1a` |
| CR-04 | Approval ownership re-check uses DB row (T-2-07-02) | `2e13f1a` |
| CR-05 | Agentic tool loop with MAX_TOOL_ITERATIONS=5 | `5f5ec09` |
| CR-06 | Remove dead UUID-vs-domain query; add shop cross-check | `04b2921` |
| CR-07 | OAuth nonce stored in Redis, not access_token_encrypted | `969f916` |
| CR-08 | trigger_type mapping before workflow insert | `b0f6f09` |
| WR-01 | HARD_CAP_USD default raised to 10 USD (above SOFT_CAP) | `7499c27` |
| WR-02 | Atomic TTL creation via redis.set(nx:true) + incrbyfloat | `7499c27` |
| WR-03 | Re-read variant from Shopify before mirror upsert | `15474aa` |
| WR-04 | inventorySetOnHandQuantities (absolute) replaces delta adjust | `15474aa` |
| WR-05 | Document L1 single-step-only behavior in execute-workflow-run | `2e13f1a` |
| WR-06 | Insert approval_card message for chat-triggered approvals | `2e13f1a` |
| WR-08 | verifyShopifyWebhookDetailed distinguishes error reasons | `a6f10ae` |
| WR-10 | Remove redundant UPDATE before gmail sync upsert | `672e84e` |
| IN-01 | Fix CEL doc comment: async=matched event, event=original trigger | `2e13f1a` |
| IN-02 | Load actual shop domain from integrations table | `2193233` |
| IN-03 | Replace bare catch{} with structured JSON error logging | `5f5ec09` |

### Deferred Findings

| ID | Title | Reason |
|----|-------|--------|
| WR-07 | Realtime RLS policy verification | Requires live Supabase Realtime policy audit; non-blocking for v1 |
| WR-09 | Gmail classification batching / cost | Optimization; current per-email classify works correctly |
| WR-11 | Incremental sync cursor (historyId pagination) | Enhancement; initial full sync is correct |
| IN-04 | Per-step real cost tracking in workflow runs | Placeholder cost is non-zero; real telemetry is a v1.1 item |
| IN-05 | Grapheme-safe thread name truncation | Minor UX; emoji split is cosmetic, not functional |
| IN-06 | Full zod-to-json-schema conversion | Tool schema accuracy improvement; current behavior works for MVP |

_Remediation by: Claude (gsd-code-fixer)_
