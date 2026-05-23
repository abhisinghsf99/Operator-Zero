# Operator Zero

## What This Is

Operator Zero is an autonomous agent system that runs the day-to-day operations of a solo founder's Shopify store — catalog, SEO, customer Q&A, and inventory — so the founder can stop being the bottleneck. It is deliberately the *anti-dashboard*: instead of giving Sarah (the persona) more screens to monitor, the agent absorbs operator-level work and surfaces only what needs her judgment. The center of gravity is **workflows** — a compounding portfolio of automated work that Sarah owns, each gated by a per-workflow trust level (L1 manual / L2 approval-gated / L3 fully autonomous).

This GSD project builds **v1, the Ship-Now MVP** — one Orchestrator chat surface, four operational domains handled internally (Catalog, SEO, Q&A via Gmail, Inventory), all three automation levels, and full inspectability. v2 (Domains, Experiments, Meta/IG, multiplayer) and v3 (pattern library, operator console, marketplace) are explicitly out of scope here.

## Core Value

Sarah builds workflows in plain language and trusts the agent to run them — most operator work happens without her in the loop, and she reviews only what genuinely needs her judgment. If everything else fails, *creating a workflow and having it reliably run* must work.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — greenfield. Ship to validate.)

### Active

<!-- v1 scope. All hypotheses until shipped and validated. Grouped by PRD phase. -->

**Week 0 — Infra Foundation (pre-Phase 1 rails)**
- [ ] Auth: email/password + Google OAuth, session middleware on `/app/*`
- [ ] Initial schema (users, profiles, integrations) with RLS + Drizzle migrations
- [ ] Encrypted-token helper; Anthropic SDK + Voyage embeddings wired
- [ ] Inngest configured (local dev + deploy); integration adapter interface skeleton
- [ ] CI: PR previews + tests; Sentry + Axiom observability rails

**Phase 1 — Foundation (prove the agent works)** — _built & code-verified in GSD Phase 2 (2026-05-22); live validation pending human UAT (creds + user/perf/durability testing) tracked in `02-HUMAN-UAT.md`. Not yet moved to Validated until confirmed valuable via real usage._
- [x] Onboarding wizard: Shopify connect, initial sync, Gmail connect (skippable), brand-voice bootstrap, catalog audit → starter workflow seeding
- [x] Conversation surface: Orchestrator chat with SSE token streaming, threads (auto-named), composer
- [x] Live workflow build visualizer (inline animated diagram + narration)
- [x] Inline approval card — full-fidelity inline card + Approvals route (upgraded past the Phase-1 placeholder)
- [x] Settings (minimal): Connections only — status, reconnect, disconnect
- [x] Workflow data model + Workflow Engine (Inngest execute function, durable L1/L2/L3 + L2 pause/resume) + agent runtime (chat + step paths) + 22-tool catalog
- [x] Activity entries written for every agent action (idempotent, observability-before-effect)

**Phase 2 — Ownership (make the portfolio visible)** — _built & code-verified in GSD Phase 3 (2026-05-22); live validation pending human UAT (load/perf, usage metrics, live Realtime + accessibility) tracked in `03-HUMAN-UAT.md`. Not yet moved to Validated until confirmed valuable via real usage._
- [x] My Workflows landing surface (library grouped by status, recent activity strip, inline L1/L2/L3 toggle)
- [x] Workflow Detail page (visual definition, historical runs, inline-editable name/description/schedule/level, "Open in Chat", Run Now)
- [x] Activity log (chronological, filters, detail view with before/after, revert subject to drift rules, atomic bulk revert)
- [x] Workflow versioning (10-version retention, forward-only restore, run-references-version)
- [x] Default landing surface flips Conversation → My Workflows (D-16 redirect)

**Phase 3 — Polish (daily use feels effortless)** — _built & code-verified in GSD Phase 4 (2026-05-22); live validation pending human UAT (live e2e a11y/mobile/keyboard/perf, Sessions/Export after migrations 0008+0009 applied, Realtime badge <5s) tracked in `04-HUMAN-UAT.md`. Not yet moved to Validated until confirmed valuable via real usage._
- [x] Approval Inbox surface (batch triage, stakes sort, approve/edit/reject/snooze, bulk actions)
- [x] Inline approval cards at full fidelity (upgrade from placeholder; synced across surfaces via Realtime)
- [x] Settings (full): Brand Voice editor, Autonomy Thresholds, What I Remember About You, Profile, Sessions, Export/Delete
- [x] Mobile parity for the 5 core surfaces (Workflows, Chat, Approvals, Activity, More)
- [x] Polished empty states, loading skeletons, error/degraded states

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **Domains surface (4 specialist chat surfaces)** — v2. v1 routes specialists internally behind one Orchestrator.
- **Experiments surface** — v2. Growth comes after daily ops are absorbed.
- **Meta / Instagram integration** — v2. v1 Q&A is Gmail-only (documented limitation; qualify users in onboarding).
- **Q&A on channels other than Gmail** — v2.
- **Team Members / multiplayer** — v2. v1 is single-user; `account_id` parent deferred.
- **Notification surface beyond in-app sidebar badge** — v2. v1 ships only the badge; Settings shows a "coming soon" placeholder.
- **Global search** — v2. Revisit if surface count makes it necessary.
- **Pattern library / cross-store learning, operator console, workflow marketplace** — v3.
- **Native mobile apps** — v1 ships responsive web (PWA-capable); native is v2+ only if demand pulls.
- **Multi-store / agency mode, non-Shopify e-commerce, Enterprise Shopify Plus** — anti-persona; not the v1 customer.

## Context

- **Persona — Sarah:** solo Shopify founder, $200K–$2M revenue, 50–500 SKUs, 20–30 hrs/week fragmented across the day. Comfortable with Shopify admin and no-code tools but not a developer; burned before by automation that ran wild, so trust is calibrated per task. Wants end-of-day summaries, not a live dashboard.
- **Rich prior definition exists** and is the source of truth for this build:
  - `Docs/Operator Zero PRD.md` — v1/v2/v3 product requirements, user stories, acceptance criteria, success metrics, kill criteria, rollout plan.
  - `Docs/Info Architecture.md` — locked IA: 7 surfaces, navigation chrome, chat behavior, cross-surface wiring (Version A workflow-first + Version B inline-approval pattern).
  - `Docs/SYSTEMS-DESIGN.md` — architecture: web tier (stateless) vs agent tier (durable), data tier, agent system, failure modes, v1→v2→v3 evolution.
  - `Docs/DATA-FLOW.md` — full table-by-table data model, RLS patterns, critical-path flows (chat send, L2 approval, L3 run, webhook, revert, onboarding audit).
  - `Docs/TECH-SPEC.md` — implementation choices, tool catalog, and the v1 build plan aligned to the three phases.
- **Design surfaces already sketched:** `Operator Zero Design Files/surface-*.jsx` (onboarding, conversation, workflows, workflow-detail, approvals, activity, settings, domains, experiments) plus `components.jsx`, `icons.jsx`, `data.jsx`.
- **Hardest parts of the build** (per tech spec, in order): (1) workflow execution + L2 approval-pause via Inngest `waitForEvent`; (2) agent runtime + tool orchestration; (3) Realtime sync correctness across Inbox/inline-card/activity; (4) the inline workflow build visualizer (novel UI); (5) Shopify mirror consistency (webhook + polling fallback + drift).

## Constraints

- **Tech stack (locked):** Next.js 15 (App Router, React 19) + TypeScript strict on Vercel; Supabase (Postgres 16, pgvector, Auth, Realtime, Storage) Pro tier; Inngest for the durable agent tier; Anthropic Claude (Opus-class primary, faster variant for classification); Voyage AI embeddings; Drizzle ORM; Zod for all external-input validation. Reason: documented and justified in TECH-SPEC.md — single vendor per layer to keep the novel work (agent/approval/workflow) the focus.
- **UI:** Tailwind + shadcn/ui (copied in, not a dep) + Radix + Lucide + Framer Motion (visualizer) + Sonner. Reason: shipped-fast, accessible primitives.
- **Multi-tenant from day one:** every user-data table carries `user_id`, every query filters by it, RLS enforces it. Reason: retrofitting tenancy later is harder.
- **Idempotency for every external-write agent action** (Shopify writes, Gmail sends). Reason: retries are inevitable; double-writes are unacceptable.
- **Observability is non-negotiable:** Activity log is a first-class store; every agent action emits a structured event before external effects. Reason: "Trust through transparency" is core to the product.
- **Mobile parity is a build constraint, not an afterthought** — responsive web, no read-only stripping of the 5 core surfaces.
- **Accessibility baseline:** WCAG 2.1 AA, full keyboard nav, screen-reader labels, reduced-motion support.
- **Security baseline (pre-GA):** encrypted-at-rest tokens/memory/brand-voice, RLS, per-user rate limits + cost caps, HMAC on webhooks. (Full SOC 2 / threat model / pen test tracked separately, required before GA.)
- **Open items deferred to build/pricing:** pricing (required before beta), exact cost-cap thresholds, mobile detailed design pass.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build scope = v1 MVP only | v1 proves the wedge and reaches real users; v2/v3 expand the moat afterward | — Pending |
| Existing docs (PRD/IA/systems/data/tech) are the locked source of truth | Decisions are already deeply reasoned and justified; planning should not re-litigate stack, IA, or phasing | — Pending |
| Roadmap mirrors PRD phasing (Week 0 → Phase 1 → 2 → 3) | PRD already organizes the build by moat depth; phases ladder up trust and ship value incrementally | — Pending |
| One Orchestrator agent in v1, specialist routing internal/invisible | Keeps v1 simple (one prompt/toolset/memory) while preserving the v2 split path | — Pending |
| Single LLM provider (Anthropic) in v1 | Tool-use + streaming fit the workflow model; fallback provider is additive in v2 | — Pending |
| Local Shopify mirror for agent reads; writes go direct then re-read | Faster agent reasoning, no rate-limit risk; accepts <15-min staleness risk in v1 | — Pending |
| Chat streaming via Vercel Route Handler + SSE (not Inngest) | Chat is latency-critical and synchronous from the user's view; Inngest is for durable long-running work | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-22 — GSD Phase 4 (Polish — Effortless Daily Use) complete: 6 plans across 5 waves. Approvals vertical slice (Inbox + inline card + snooze/edit/bulk/revert + reject→memory + Realtime sync), full Settings (Brand Voice, Memory, Profile, Autonomy thresholds + one-directional override gate, Sessions registry/revoke, Account export/purge + Danger Zone), mobile drill-down parity, WCAG 2.1 AA + keyboard + perf pass. Migrations 0006 + 0007 (workflow_versions RLS) applied live; 0008 (user_exports UNIQUE) + 0009 (user_sessions UNIQUE) authored, pending live apply. Code-verified (336 tests, tsc clean, next build green; 5 review blockers incl. a cross-tenant data leak + 5 warnings fixed); live validation pending in 04-HUMAN-UAT.md. This completes the v1.0 Ship-Now MVP milestone.*
