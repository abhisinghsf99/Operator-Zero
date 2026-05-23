# Roadmap: Operator Zero

## Overview

Four phases ordered by moat depth: Phase 1 lays the infrastructure rails before any user-facing surface ships; Phase 2 proves the agent works end-to-end with onboarding, conversation, and a running workflow; Phase 3 makes Sarah's portfolio visible and editable; Phase 4 polishes daily use with full approvals, complete settings, mobile parity, and accessibility. Each phase ladders trust and ships value incrementally, matching the PRD's phasing strategy exactly.

## Phases

- [x] **Phase 1: Infrastructure Foundation** - Backend rails, auth, schema, Inngest, SDK wiring, and CI — no user-facing surfaces (completed 2026-05-22)
- [x] **Phase 2: Foundation — Prove the Agent** - Onboarding, Conversation surface, agent runtime, workflow engine, and a running L2 workflow (completed 2026-05-22)
- [x] **Phase 3: Ownership — The Portfolio** - My Workflows landing surface, Workflow Detail, Activity log, versioning, and portfolio ownership (completed 2026-05-22)
- [x] **Phase 4: Polish — Effortless Daily Use** - Approval Inbox, full-fidelity inline approvals, complete Settings, mobile parity, and accessibility (completed 2026-05-23)

## Phase Details

### Phase 1: Infrastructure Foundation

**Goal**: The production-grade backend rails exist — auth, schema, encrypted tokens, durable jobs, and observability — so every subsequent phase builds on a solid foundation with no infra debt.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, AUTH-01, AUTH-02, AUTH-03, AUTH-06
**Success Criteria** (what must be TRUE):

  1. A logged-in user can land on a placeholder home page protected by session middleware — no unauthenticated access to `/app/*`
  2. The integrations table accepts an encrypted token (libsodium); plaintext is never persisted to the database
  3. Inngest fires and checkpoints a durable hello-world function in both local dev and deployed environments
  4. Anthropic SDK and Voyage embeddings are callable from the agent tier without errors
  5. A pull request triggers CI (tests + preview deploy); Sentry and Axiom capture a test error end-to-end

**Plans**: TBD
**UI hint**: no

### Phase 2: Foundation — Prove the Agent

**Goal**: A new user can sign up, connect their Shopify store, complete onboarding, build a workflow in plain language, and have it run successfully — all in one session under 30 minutes.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05, INTEG-06, INTEG-07, AUTH-07, ONBOARD-01, ONBOARD-02, ONBOARD-03, ONBOARD-04, ONBOARD-05, ONBOARD-06, ONBOARD-07, ONBOARD-08, CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, CONV-06, CONV-07, CONV-08, CONV-09, AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, WF-01, WF-02, WF-03, WF-04, WF-05, WF-06, SET-01
**Success Criteria** (what must be TRUE):

  1. 80% of test users complete onboarding (Shopify connected, brand voice created, at least one starter workflow seeded) without dropping off
  2. 80% of test users reach "first workflow created and ran successfully" within 30 minutes of signup
  3. The Orchestrator's first response token arrives in under 2 seconds (p50), and full workflow plan in under 8 seconds (p50)
  4. A live workflow build visualizer renders inline in the message stream, assembling each step as the Orchestrator narrates it
  5. An L2 workflow pauses at an execution boundary, creates an approval entry, and resumes correctly when approved — durable across Inngest restarts

**Plans**: 8 plans (5 waves)
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — UI Foundation: shadcn/ui + OKLCH tokens + fonts + app-shell nav (wave 1)
- [x] 02-02-PLAN.md — Schema migration 0003 (22 tables + RLS + pgvector) + Wave-0 test scaffolds (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — Shopify integration: OAuth + full sync + webhooks + idempotent writes + health (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-04-PLAN.md — Gmail integration: OAuth offline + 30-day sync + History polling + classify (wave 3)
- [x] 02-05-PLAN.md — Agent runtime: prompt budget + 22-tool catalog + memory + error class + cost cap (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-06-PLAN.md — Conversation surface: SSE streaming + visualizer + threads + degradation (wave 4)
- [x] 02-07-PLAN.md — Workflow engine: durable L1/L2/L3 + L2 pause/resume keystone + Activity (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-08-PLAN.md — Onboarding wizard + Settings/Connections + full-journey e2e (wave 5)

**UI hint**: yes

### Phase 3: Ownership — The Portfolio

**Goal**: Sarah can see, manage, and inspect everything she has built — her workflow portfolio is visible, editable inline, and fully auditable through the Activity log with versioning and revert.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: WF-07, WF-08, WF-09, WF-10, WF-11, WF-12, WF-13, WF-14, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ACT-06, ACT-07, ACT-08
**Success Criteria** (what must be TRUE):

  1. The median user has 5 or more active workflows visible in My Workflows by end of week 4, grouped by status with inline L1/L2/L3 toggle
  2. 60% of users visit My Workflows at least 3 times per week (default landing surface is My Workflows, not Conversation)
  3. Activity log loads in under 1 second (p50) with 1,000 or more entries, with working filters (workflow, date range, result type, automation level)
  4. User can revert a recent agent action subject to drift rules; disabled reverts show a tooltip explaining why; bulk revert is atomic (all-or-none)
  5. Workflows are versioned — editing increments the version, runs reference their version, and restore creates a new version without overwriting history

**Plans**: 4 plans (3 waves)
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Foundation: migration 0005 + version/revert/grouping libs + Server Actions + D-16 redirect + Wave 0 tests (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — My Workflows surface: grouped portfolio + live strip + inline level/pause + search + New Workflow (wave 2)
- [x] 03-04-PLAN.md — Activity log: virtualized timeline + AND filters + before/after diff + single/atomic-bulk revert + Save as Workflow (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — Workflow Detail: inline edit + schedule picker + version history/restore + Run Now + Open in Chat (wave 3)

**UI hint**: yes

### Phase 4: Polish — Effortless Daily Use

**Goal**: Daily use is effortless — inline approvals work end-to-end across surfaces, Settings is complete, mobile is full parity, and all surfaces meet accessibility and performance targets.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: APRV-01, APRV-02, APRV-03, APRV-04, APRV-05, APRV-06, APRV-07, APRV-08, SET-02, SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, AUTH-04, AUTH-05, UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):

  1. 70% of L2 approvals happen inline in Conversation (not in the Approval Inbox) — the inline card shows full fidelity (action type, stakes, preview, reasoning, approve/edit/reject/snooze) and syncs across surfaces in under 5 seconds
  2. Mobile session length is at least 60% of desktop session length — all 5 core surfaces (Workflows, Chat, Approvals, Activity, More) are fully functional on mobile with no read-only stripping
  3. Approval Inbox "All clear" empty state is reached at least once per day by 50% of users; batch triage (bulk approve/reject/snooze) clears 10+ items in 2 clicks
  4. All surfaces meet WCAG 2.1 AA — full keyboard navigation, screen-reader labels, focus indicators, color contrast, and reduced-motion support
  5. App shell loads under 1.5 seconds (p50), surface navigation under 300 milliseconds, My Workflows under 500 milliseconds — performance targets from PRD §5.4.2 are met

**Plans**: 6 plans (5 waves)
Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Foundation: user_sessions + user_exports schema, migration 0006 + perf indexes (BLOCKING push), axe-core + mobile project, reduced-motion, Wave-0 test scaffolds (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — Approvals slice: Inbox (list + detail) + full-fidelity inline cards + snooze/edit/bulk/revert actions + reject→memory + drift handling + Realtime sync + sidebar badge (wave 2)
- [x] 04-03-PLAN.md — Settings slice A: Brand Voice (encrypt + regenerate-confirm) + Memory CRUD (soft-delete + undo) + Profile + Notifications placeholder (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-04-PLAN.md — Settings slice B: Autonomy thresholds + one-directional override gate (execute-workflow-run) + Sessions list/revoke/sign-out-everywhere + session registry + cancel-deletion-on-signin (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-05-PLAN.md — Account lifecycle: durable Export job (signed URL) + Delete/purge job (lock-now/sleep-7d/cancelOn) + Danger Zone section (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04-06-PLAN.md — Mobile parity (drill-down, no read-only stripping) + WCAG 2.1 AA (axe + keyboard + reduced-motion) + Performance targets (wave 5)

**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Foundation | 4/4 | Complete   | 2026-05-22 |
| 2. Foundation — Prove the Agent | 8/8 | Complete   | 2026-05-22 |
| 3. Ownership — The Portfolio | 4/4 | Complete   | 2026-05-22 |
| 4. Polish — Effortless Daily Use | 6/6 | Complete   | 2026-05-23 |
