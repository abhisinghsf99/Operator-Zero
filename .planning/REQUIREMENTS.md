# Requirements: Operator Zero

**Defined:** 2026-05-21
**Core Value:** Sarah builds workflows in plain language and trusts the agent to run them — most operator work happens without her in the loop, and she reviews only what genuinely needs her judgment.
**Source:** Derived from `Docs/Operator Zero PRD.md` (v1 scope), `Docs/Info Architecture.md`, `Docs/SYSTEMS-DESIGN.md`, `Docs/DATA-FLOW.md`, `Docs/TECH-SPEC.md` — treated as the locked source of truth.

> Phase mapping mirrors the PRD's moat-depth phasing:
> **Phase 1** = Infra Foundation (PRD "Week 0") · **Phase 2** = Foundation (PRD Phase 1) · **Phase 3** = Ownership (PRD Phase 2) · **Phase 4** = Polish (PRD Phase 3).
> Mobile parity, accessibility, idempotency, and observability are build constraints applied throughout; their dedicated requirements are mapped to the phase where the bulk of the work lands.

## v1 Requirements

### Infrastructure (INFRA)

- [x] **INFRA-01**: Vercel + Supabase projects provisioned; app deploys on merge to main with PR preview deployments and CI tests
- [x] **INFRA-02**: Drizzle schema + forward-only migrations for initial tables (users, user_profiles, integrations)
- [x] **INFRA-03**: RLS policies enforce per-user row access on every user-data table (defense-in-depth with explicit query filters)
- [x] **INFRA-04**: Integration tokens are encrypted at rest (libsodium, key from Supabase secret); plaintext never hits the DB
- [x] **INFRA-05**: Inngest configured with local dev server and deploys with the app; a durable hello-world function fires and checkpoints
- [x] **INFRA-06**: Anthropic SDK + Voyage embeddings wired and callable from the agent tier
- [x] **INFRA-07**: Integration adapter interface defined with skeleton Shopify + Gmail clients (no real ops yet)
- [x] **INFRA-08**: Sentry (client + server) and Axiom log aggregation capture errors and structured logs

### Authentication & Platform (AUTH)

- [ ] **AUTH-01**: User can sign up with email and password
- [ ] **AUTH-02**: User can sign in with Google OAuth
- [ ] **AUTH-03**: Session persists via httpOnly cookie with 30-day rolling refresh; middleware guards `/app/*` routes
- [ ] **AUTH-04**: User can view active sessions (device, location, last seen) and revoke any session
- [ ] **AUTH-05**: User can "sign out all devices" with confirmation
- [x] **AUTH-06**: Per-user rate limits on chat sends and concurrent workflow runs prevent runaway cost
- [ ] **AUTH-07**: Per-user daily cost cap — soft-cap warns in chat, hard-cap disables write tools while chat continues in degraded mode

### Integrations (INTEG)

- [ ] **INTEG-01**: User can connect Shopify via OAuth with minimum-necessary scopes; handshake completes <60s p50
- [ ] **INTEG-02**: On Shopify connect, catalog/orders/content/inventory full-sync runs in background to a local Postgres mirror
- [ ] **INTEG-03**: Shopify webhooks update the mirror on change; 15-min polling fallback catches missed webhooks
- [ ] **INTEG-04**: User can connect Gmail via Google OAuth (`gmail.modify`); skippable in onboarding with an explicit warning
- [ ] **INTEG-05**: On Gmail connect, last 30 days of threads sync; 5-min polling pulls new inbound; support emails are classified
- [ ] **INTEG-06**: Connection health is visible (status, last sync); broken/expired tokens surface a clear reconnect path
- [ ] **INTEG-07**: All Shopify writes are idempotent, go direct to Shopify, then re-read to update the mirror

### Onboarding (ONBOARD)

- [ ] **ONBOARD-01**: New user is guided through an inline onboarding wizard within the app shell (not a separate modal)
- [ ] **ONBOARD-02**: Wizard requires Shopify to proceed; Gmail is skippable with an explicit warning and reachable later in Settings
- [ ] **ONBOARD-03**: Brand-voice bootstrap (3–5 message conversation) produces an initial brand voice profile, saved before the user enters Conversation
- [ ] **ONBOARD-04**: Orchestrator runs a read-only catalog audit and returns ≥3 tailored starter-workflow suggestions for any non-empty store
- [ ] **ONBOARD-05**: Selected starter workflows are created as Draft workflows at L2
- [ ] **ONBOARD-06**: Abandoned onboarding saves progress and resumes from the last completed step on next login
- [ ] **ONBOARD-07**: Empty store (zero products) skips the catalog audit and suggests content/Q&A workflows only
- [ ] **ONBOARD-08**: Post-onboarding lands the user in Conversation with a welcome message (Phase 1 landing)

### Conversation (CONV)

- [ ] **CONV-01**: User can send a natural-language message and receive a streamed Orchestrator response (<2s first token p50)
- [ ] **CONV-02**: User can describe a goal and the Orchestrator proposes a workflow plan (trigger + steps) with a "Save as Workflow" action
- [ ] **CONV-03**: A live workflow build visualizer renders inline, assembling each step as the Orchestrator narrates it
- [ ] **CONV-04**: Conversations are organized into threads, auto-named from first message or workflow context, listed reverse-chronologically
- [ ] **CONV-05**: User can start a new thread that inherits brand voice + memory but carries no message history
- [ ] **CONV-06**: Agent memory persists across threads — a decision made in one thread is recalled in another
- [ ] **CONV-07**: Embedded previews render for content drafts (product descriptions, email replies, meta titles)
- [ ] **CONV-08**: Reasoning chains are collapsed by default with a "Why?" expander
- [ ] **CONV-09**: Chat degrades gracefully — latency indicators, retry on model error, queued messages sent mid-response, auto-saved Draft on tab close

### Agent Runtime & Tools (AGENT)

- [ ] **AGENT-01**: Runtime constructs prompts from system role + store context + brand voice + structured memory + semantic recall + tools, capped at a token budget
- [ ] **AGENT-02**: v1 read tools (products, orders, inventory, pages, redirects, gmail threads, recall memory, search activity, brand voice) are available and always safe
- [ ] **AGENT-03**: v1 write tools (descriptions, meta fields, image alt, status, price, inventory, redirects, page content, gmail draft/send) are gated by automation level
- [ ] **AGENT-04**: Tool inputs are validated against Zod schemas; invalid input returns a correctable error to the model
- [ ] **AGENT-05**: Agent records durable memory items silently (record/update/soft-delete) with embeddings for semantic recall
- [ ] **AGENT-06**: Agent errors are classified — transient → retry with backoff; auth → pause + reconnect; budget → degrade

### Workflows & Engine (WF)

- [ ] **WF-01**: A workflow has name, description, trigger (schedule/event/manual), steps, automation level, status, and source attribution
- [ ] **WF-02**: The Workflow Engine executes multi-step runs durably via Inngest and resumes from the last checkpoint on failure
- [ ] **WF-03**: L1 (manual) workflows prepare an action and wait for the user to trigger it — no approval entry
- [ ] **WF-04**: L2 (approval-gated) workflows pause at execution boundaries, create an approval, and resume on approve/reject
- [ ] **WF-05**: L3 (autonomous) workflows execute without approval and log everything to Activity
- [ ] **WF-06**: Every agent action writes an Activity entry within 5s of execution
- [ ] **WF-07**: My Workflows shows all workflows grouped by status (Scheduled / Triggered / Manual / Paused / Drafts) with a recent-activity strip
- [ ] **WF-08**: User can change a workflow's automation level inline (L1/L2/L3) with immediate save; switching to L3 shows a one-time confirmation
- [ ] **WF-09**: User can pause/resume a workflow without deleting it (history + config retained)
- [ ] **WF-10**: User can start a new workflow from My Workflows ("+ New Workflow" opens a creation thread in Conversation)
- [ ] **WF-11**: Workflow Detail shows the visual definition + historical runs; name/description/schedule/level are inline-editable
- [ ] **WF-12**: User can edit workflow logic via "Open in Chat" — a scoped thread pre-loaded with the workflow's context
- [ ] **WF-13**: User can "Run Now" to trigger immediate execution; the run appears in Historical Runs within seconds
- [ ] **WF-14**: Workflows are versioned (number increments on edit); runs reference their version; restore creates a new version; last 10 retained

### Activity (ACT)

- [ ] **ACT-01**: Activity log lists all agent actions chronologically with timestamp, workflow, summary, result, and automation level
- [ ] **ACT-02**: User can filter by workflow, date range, result type, and automation level (filters combine with AND)
- [ ] **ACT-03**: Activity detail shows full breakdown, before/after state, reasoning chain, and a link to the parent workflow
- [ ] **ACT-04**: User can revert a recent change subject to drift rules; disabled reverts show a tooltip explaining why
- [ ] **ACT-05**: User can multi-select and bulk-revert atomically (all-or-none)
- [ ] **ACT-06**: User can promote a one-off action into a saved workflow ("Save as Workflow")
- [ ] **ACT-07**: Activity log loads <1s p50 with 1000+ entries; entries retained 6 months
- [ ] **ACT-08**: Drift rules are enforced consistently in UI and backend (content 7d, structural 24h, sent never; manual-edit-since blocks revert)

### Approvals (APRV)

- [ ] **APRV-01**: Approval Inbox lists pending L2 items (action type, stakes, preview, reasoning, est. review time), sorted stakes-desc then recency
- [ ] **APRV-02**: User can approve/edit/reject/snooze a single item; reject captures an optional reason that influences future proposals
- [ ] **APRV-03**: User can bulk-select and batch approve/reject/snooze — clearing 10+ items in 2 clicks
- [ ] **APRV-04**: Full-fidelity inline approval cards let the user approve/edit/reject/snooze without leaving Conversation
- [ ] **APRV-05**: One approval row, two views — approving inline or in the Inbox updates both and decrements the sidebar badge in real time (<5s cross-device)
- [ ] **APRV-06**: Snoozed items are hidden by default with a toggle; expired/stale items are handled without dumping on the user
- [ ] **APRV-07**: User can revert a recently-approved (≤24h) item from the Inbox detail; older reverts happen in Activity
- [ ] **APRV-08**: Empty state reads "All clear" with no CTA (empty is the goal state)

### Settings (SET)

- [ ] **SET-01**: Connections section shows Shopify/Gmail status + last sync, with reconnect and disconnect-with-confirmation
- [ ] **SET-02**: Brand Voice Profile is editable markdown with preview; changes take effect on the next agent action; "regenerate from examples" is available
- [ ] **SET-03**: Autonomy Thresholds set a global default level + curated per-action overrides that win over workflow level
- [ ] **SET-04**: "What I Remember About You" lists memory items by category; user can edit inline, delete (24h reversible), or add
- [ ] **SET-05**: Profile section edits name, email, password, and avatar
- [ ] **SET-06**: User can export all account data (workflows + history, activity, memory, brand voice) as JSON, initiated within 60s
- [ ] **SET-07**: User can delete account (hard delete, 7-day grace, email confirmation); blocked while workflows are mid-run
- [ ] **SET-08**: Notifications section shows only the in-app sidebar badge + a "coming soon" placeholder (no non-functional toggles)

### Mobile & Accessibility (UX)

- [ ] **UX-01**: The 5 core surfaces (Workflows, Chat, Approvals, Activity, More) are fully functional on mobile via a bottom tab bar — no read-only stripping
- [ ] **UX-02**: All surfaces meet WCAG 2.1 AA — keyboard nav, screen-reader labels, focus indicators, color contrast, reduced-motion
- [ ] **UX-03**: Inline approval cards and the workflow visualizer are keyboard-accessible and have text equivalents
- [ ] **UX-04**: Performance targets met per PRD §5.4.2 (app shell <1.5s, surface nav <300ms, My Workflows <500ms p50)

## v2 Requirements

Deferred to the next milestone. Tracked but not in this roadmap.

### Domains & Experiments
- **DOM-01**: Four specialist chat surfaces (Catalog, SEO, Q&A, Inventory) with visual differentiation and hand-off to Orchestrator
- **EXP-01**: Experiments surface — goals, ranked hypotheses, promote-to-workflow, honest three-way outcomes

### Channels & Multiplayer
- **META-01**: Meta/Instagram integration (DM handling, comment moderation, content posting with per-post approval)
- **QA-EXT-01**: Q&A expansion to Instagram DMs / Meta comments
- **TEAM-01**: Team Members / multiplayer foundations (`account_id` parent, role-based RLS, invitations, per-actor audit)
- **NOTIF-01**: Full notification surface (toast / email / push / in-app inbox)
- **SEARCH-01**: Global search across workflows / threads / activity
- **WFIO-01**: Export / import workflows for cross-store reuse (same user)

## Out of Scope

Explicitly excluded for v1. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Pattern library / cross-store learning | v3 — needs privacy-preserving cross-account aggregation |
| Operator Console (IA Version C) | v3 — multi-domain dashboard redesign |
| Workflow marketplace | v3 — requires exportable/parameterized workflow definitions |
| Native mobile apps | v1 ships responsive web (PWA-capable); native only if demand pulls (v2+) |
| Multi-store / agency mode | Anti-persona; solved in v3 |
| Non-Shopify e-commerce (Woo, BigCommerce, custom) | Out of scope for v1 and v2 |
| Enterprise Shopify Plus | Different procurement/compliance/scale; not the v1 customer |
| Q&A on channels other than Gmail | v2 — v1 Q&A is Gmail-only (documented limitation, qualified in onboarding) |
| Voice input in chat | Deferred to v2 |
| Live analytics dashboards | Anti-dashboard principle — Shopify already provides observability |

## Traceability

Validated by roadmapper 2026-05-21. Coverage confirmed 87/87 v1 requirements mapped across 4 phases. All statuses initialized to Pending.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 … INFRA-08 | Phase 1 | Pending |
| AUTH-01, AUTH-02, AUTH-03, AUTH-06 | Phase 1 | Pending |
| INTEG-01 … INTEG-07 | Phase 2 | Pending |
| AUTH-07 | Phase 2 | Pending |
| ONBOARD-01 … ONBOARD-08 | Phase 2 | Pending |
| CONV-01 … CONV-09 | Phase 2 | Pending |
| AGENT-01 … AGENT-06 | Phase 2 | Pending |
| WF-01 … WF-06 | Phase 2 | Pending |
| SET-01 | Phase 2 | Pending |
| WF-07 … WF-14 | Phase 3 | Pending |
| ACT-01 … ACT-08 | Phase 3 | Pending |
| APRV-01 … APRV-08 | Phase 4 | Pending |
| SET-02 … SET-08 | Phase 4 | Pending |
| AUTH-04, AUTH-05 | Phase 4 | Pending |
| UX-01 … UX-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 87 total
- Mapped to phases: 87
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-21*
*Last updated: 2026-05-21 after roadmapper validation — 87/87 mapped, ROADMAP.md and STATE.md written*
