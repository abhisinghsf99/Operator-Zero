<!-- GSD:project-start source:PROJECT.md -->
## Project

**Operator Zero**

Operator Zero is an autonomous agent system that runs the day-to-day operations of a solo founder's Shopify store — catalog, SEO, customer Q&A, and inventory — so the founder can stop being the bottleneck. It is deliberately the *anti-dashboard*: instead of giving Sarah (the persona) more screens to monitor, the agent absorbs operator-level work and surfaces only what needs her judgment. The center of gravity is **workflows** — a compounding portfolio of automated work that Sarah owns, each gated by a per-workflow trust level (L1 manual / L2 approval-gated / L3 fully autonomous).

This GSD project builds **v1, the Ship-Now MVP** — one Orchestrator chat surface, four operational domains handled internally (Catalog, SEO, Q&A via Gmail, Inventory), all three automation levels, and full inspectability. v2 (Domains, Experiments, Meta/IG, multiplayer) and v3 (pattern library, operator console, marketplace) are explicitly out of scope here.

**Core Value:** Sarah builds workflows in plain language and trusts the agent to run them — most operator work happens without her in the loop, and she reviews only what genuinely needs her judgment. If everything else fails, *creating a workflow and having it reliably run* must work.

### Constraints

- **Tech stack (locked):** Next.js 15 (App Router, React 19) + TypeScript strict on Vercel; Supabase (Postgres 16, pgvector, Auth, Realtime, Storage) Pro tier; Inngest for the durable agent tier; Anthropic Claude (Opus-class primary, faster variant for classification); Voyage AI embeddings; Drizzle ORM; Zod for all external-input validation. Reason: documented and justified in TECH-SPEC.md — single vendor per layer to keep the novel work (agent/approval/workflow) the focus.
- **UI:** Tailwind + shadcn/ui (copied in, not a dep) + Radix + Lucide + Framer Motion (visualizer) + Sonner. Reason: shipped-fast, accessible primitives.
- **Multi-tenant from day one:** every user-data table carries `user_id`, every query filters by it, RLS enforces it. Reason: retrofitting tenancy later is harder.
- **Idempotency for every external-write agent action** (Shopify writes, Gmail sends). Reason: retries are inevitable; double-writes are unacceptable.
- **Observability is non-negotiable:** Activity log is a first-class store; every agent action emits a structured event before external effects. Reason: "Trust through transparency" is core to the product.
- **Mobile parity is a build constraint, not an afterthought** — responsive web, no read-only stripping of the 5 core surfaces.
- **Accessibility baseline:** WCAG 2.1 AA, full keyboard nav, screen-reader labels, reduced-motion support.
- **Security baseline (pre-GA):** encrypted-at-rest tokens/memory/brand-voice, RLS, per-user rate limits + cost caps, HMAC on webhooks. (Full SOC 2 / threat model / pen test tracked separately, required before GA.)
- **Open items deferred to build/pricing:** pricing (required before beta), exact cost-cap thresholds, mobile detailed design pass.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
