---
phase: 2
slug: foundation-prove-the-agent
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-22
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` → `## Validation Architecture`. Task IDs are filled in by the planner; this contract maps requirements → tests so every plan can attach `<automated>` verification.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (unit/integration) + Playwright 1.x (e2e) |
| **Config file** | `vitest.config.mts` (excludes `tests/e2e/**`); `playwright.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~30s unit · several min full |

**LLM testing rule (TECH-SPEC §7.1):** Do NOT snapshot LLM outputs. DO snapshot prompt construction (catches prompt regressions). Mock the Anthropic SDK at the SDK boundary. Reserve one Playwright spec for real-LLM responses in a sandbox account, run nightly — not in the per-commit suite.

---

## Sampling Rate

- **After every task commit:** `npx vitest run` (unit, <30s)
- **After every plan wave:** `npx vitest run && npx playwright test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30s (unit)

---

## Per-Requirement Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| INTEG-01 | Shopify OAuth HMAC + state-nonce verification | unit | `npx vitest run tests/unit/shopify-oauth.test.ts` | ❌ W0 |
| INTEG-02 | Full-sync UPSERT idempotency to mirror | unit | `npx vitest run tests/unit/shopify-sync.test.ts` | ❌ W0 |
| INTEG-03 | Webhook HMAC validation + polling fallback | unit | `npx vitest run tests/unit/shopify-webhook.test.ts` | ❌ W0 |
| INTEG-04 | Gmail OAuth refresh-token handling | unit | `npx vitest run tests/unit/gmail-oauth.test.ts` | ❌ W0 |
| INTEG-05 | Gmail History API incremental cursor advance | unit | `npx vitest run tests/unit/gmail-sync.test.ts` | ❌ W0 |
| INTEG-06 | Integration health detection (stale/expired) | unit | `npx vitest run tests/unit/integration-health.test.ts` | ❌ W0 |
| INTEG-07 | Idempotent write (pre-read → write → re-read) | unit | `npx vitest run tests/unit/shopify-mutations.test.ts` | ❌ W0 |
| AUTH-07 | Cost-cap soft/hard threshold logic | unit | `npx vitest run tests/unit/cost-cap.test.ts` | ❌ W0 |
| ONBOARD-03 | Brand-voice profile created from conversation | integration | manual — requires LLM | Manual |
| ONBOARD-04 | Catalog audit yields ≥3 suggestions | unit (mock products) | `npx vitest run tests/unit/catalog-audit.test.ts` | ❌ W0 |
| ONBOARD-06 | Step-progress persistence + resume | unit | `npx vitest run tests/unit/onboarding-progress.test.ts` | ❌ W0 |
| ONBOARD-07 | Empty store skips audit → content/Q&A only | unit | `npx vitest run tests/unit/catalog-audit.test.ts` | ❌ W0 |
| CONV-01 | SSE streaming route returns tokens (<2s first) | integration | `npx vitest run tests/integration/chat-stream.test.ts` | ❌ W0 |
| AGENT-01 | Prompt construction fits token budget | unit | `npx vitest run tests/unit/prompt-builder.test.ts` | ❌ W0 |
| AGENT-04 | Tool Zod validation → correctable error | unit | `npx vitest run tests/unit/tool-validation.test.ts` | ❌ W0 |
| AGENT-05 | Memory record/update/soft-delete + recall | unit | `npx vitest run tests/unit/agent-memory.test.ts` | ❌ W0 |
| AGENT-06 | Error classification transient/auth/budget | unit | `npx vitest run tests/unit/agent-errors.test.ts` | ❌ W0 |
| WF-02 | Inngest run resumes from checkpoint after restart | unit (Inngest test SDK) | `npx vitest run tests/unit/workflow-engine.test.ts` | ❌ W0 |
| WF-04 | L2 pause creates approval row + waitForEvent/resume | unit (Inngest test SDK) | `npx vitest run tests/unit/l2-approval-flow.test.ts` | ❌ W0 |
| WF-06 | Activity entry written before external effect | unit | in `workflow-engine.test.ts` | ❌ W0 |
| SET-01 | Connections page status + disconnect | e2e | `npx playwright test tests/e2e/settings-connections.spec.ts` | ❌ W0 |
| CONV-01 + WF-04 | Full journey: chat → plan → save → L2 run → approve | e2e (happy path) | `npx playwright test tests/e2e/full-workflow-journey.spec.ts` | ❌ W0 |

---

## Wave 0 Requirements (create before implementation waves)

- [ ] `tests/unit/shopify-oauth.test.ts` — HMAC + state-nonce with test vectors
- [ ] `tests/unit/shopify-sync.test.ts` — UPSERT idempotency with mock responses
- [ ] `tests/unit/shopify-webhook.test.ts` — HMAC webhook verification
- [ ] `tests/unit/shopify-mutations.test.ts` — idempotent pre-read/write/re-read
- [ ] `tests/unit/gmail-oauth.test.ts` / `tests/unit/gmail-sync.test.ts` — token refresh + History cursor
- [ ] `tests/unit/integration-health.test.ts` — stale/expired detection
- [ ] `tests/unit/cost-cap.test.ts` — soft/hard cap thresholds (pure fn, no Redis)
- [ ] `tests/unit/prompt-builder.test.ts` — token-budget truncation + prompt snapshot
- [ ] `tests/unit/tool-validation.test.ts` — Zod error → tool_result error format
- [ ] `tests/unit/agent-memory.test.ts` — record/update/soft-delete + semantic recall
- [ ] `tests/unit/agent-errors.test.ts` — transient/auth/budget classification
- [ ] `tests/unit/catalog-audit.test.ts` — ≥3 suggestions; empty-store branch
- [ ] `tests/unit/onboarding-progress.test.ts` — persist + resume from last step
- [ ] `tests/unit/workflow-engine.test.ts` — Inngest test SDK step checkpointing + Activity-before-effect
- [ ] `tests/unit/l2-approval-flow.test.ts` — waitForEvent mock + resume on approve/reject
- [ ] `tests/integration/chat-stream.test.ts` — SSE route emits tokens
- [ ] `tests/e2e/settings-connections.spec.ts` — connections status + disconnect
- [ ] `tests/e2e/full-workflow-journey.spec.ts` — critical happy-path journey

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Brand-voice profile reads like the user | ONBOARD-03 | LLM output quality is subjective | Run onboarding voice step with sample writing; confirm drafted profile reflects tone |
| First-token latency <2s p50 | CONV-01 | Real network + model latency | Send a message in Conversation; observe first token arrives <2s (manual p50 over several sends) |
| Workflow build visualizer assembles inline | CONV-03 | Visual/motion behavior | Describe a goal; confirm steps animate in as the Orchestrator narrates |
| L2 resume durable across Inngest restart | WF-04 | Requires restarting the Inngest dev server mid-run | Trigger L2 run → pause at approval → restart Inngest → approve → confirm resume |
| Shopify/Gmail OAuth round-trip | INTEG-01/04 | Requires real OAuth apps + credentials (human prerequisite) | Connect each in onboarding/Settings with real dev-store/test-account credentials |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ MISSING test files above
- [ ] No watch-mode flags in commands
- [ ] Feedback latency < 30s (unit)
- [ ] `nyquist_compliant: true` set in frontmatter once planner attaches tests to tasks

**Approval:** approved 2026-05-22 (plan-checker confirmed every auto task has automated verify; Wave-0 covers all test files)
