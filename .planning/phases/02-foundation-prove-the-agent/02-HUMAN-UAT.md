---
status: partial
phase: 02-foundation-prove-the-agent
source: [02-VERIFICATION.md, 02-REVIEW.md]
started: 2026-05-22T00:00:00Z
updated: 2026-05-22T00:00:00Z
---

## Current Test

[awaiting human testing — all code-verifiable work passed; the items below need live credentials, a running stack, or human judgment]

## Tests

### 1. Live Shopify OAuth + catalog sync (INTEG-01/02/03)
prerequisite: Create a Shopify Partner account → dev store → **custom app** (v1); set `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_API_VERSION`, `SHOPIFY_SCOPES` in `.env.local` (+ Vercel); redirect URI `{origin}/api/integrations/shopify/callback`. (Documented in `.env.local.example`.)
expected: Connect flow completes (state-nonce + HMAC verified); background full sync populates `shopify_products`/orders/pages/redirects; `shopify_sync_state.last_full_sync_at` set; webhooks update the mirror; 15-min poll fallback runs.
result: [pending]

### 2. Live Gmail OAuth + History-API sync (INTEG-04/05)
prerequisite: Enable Gmail API on a Google Cloud project → OAuth Web client with `gmail.modify` scope + redirect URI `{origin}/api/integrations/gmail/callback`; set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `.env.local`. (Documented in `.env.local.example`.)
expected: Connect with offline access returns a refresh token; last 30 days of threads sync; `gmail_sync_state.last_history_id` set; 5-min poll pulls new inbound; support emails flagged `is_customer_support`; expired access tokens refresh transparently.
result: [pending]

### 3. Onboarding completion rate (Success Criterion #1)
expected: ≥80% of test users complete onboarding (Shopify connected, brand voice created, ≥1 starter workflow seeded) without dropping off.
result: [pending — live user sessions]

### 4. 30-minute first-workflow benchmark (Success Criterion #2)
expected: ≥80% of test users reach "first workflow created and ran successfully" within 30 minutes of signup.
result: [pending — wall-clock user timing]

### 5. Streaming latency (Success Criterion #3)
expected: Orchestrator first response token <2s p50; full workflow plan <8s p50 (measure on a production-like deployment).
result: [pending — requires deployment + measurement]

### 6. Live workflow build visualizer (Success Criterion #4)
expected: In a browser, the inline visualizer renders in the message stream, assembling each step (Framer Motion stagger) as the Orchestrator narrates; reduced-motion respected; screen-reader text equivalent present.
result: [pending — browser visual check]

### 7. L2 durability across Inngest restart (Success Criterion #5 — keystone)
expected: Trigger an L2 run → it pauses at the approval boundary and creates an approval entry → restart the Inngest dev server → approve → the run resumes and completes (durable across restart). Code path verified (step.waitForEvent with `async.data.approvalId`, DB-row-as-truth resume); the durability proof needs a live Inngest restart.
note: Consider converting the 7 `it.todo` durable-execution cases in `tests/unit/workflow-engine.test.ts` (WF-02) to active tests using Inngest's test helpers before GA.
result: [pending — live Inngest dev-server restart]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

(No code gaps. All 37 requirements have implementation evidence; all 8 code-review criticals remediated. The items above require live credentials, a running stack, or human judgment.)

## Deferred (non-blocking, from 02-REVIEW.md — track for v1.1)

- WR-07: verify Supabase Realtime authorization policies for `approvals`/`messages` (so `{ private: true }` enforces tenant isolation server-side)
- WR-09: batch/cap Gmail support classification + route its cost through the cost cap
- WR-11: implement an `updatedAt`-cursor incremental Shopify sync (current poll re-runs full sync)
- IN-04: record real per-step LLM cost for workflow steps (currently a non-zero placeholder)
- IN-05: grapheme-safe thread-name truncation (`Intl.Segmenter`)
- IN-06: full `zod-to-json-schema` conversion for tool input contracts (currently strings)
