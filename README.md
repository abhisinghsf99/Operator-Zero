# Operator Zero

> An AI agent that runs the day-to-day operations of a Shopify store, from the catalog and SEO to customer questions and inventory, so the founder can stop being the operator and get back to growing the business.

**Status:** v1 MVP. Code-complete across 4 build phases, deployed against a live Shopify Sandbox store, 560+ tests passing, TypeScript strict.

🔗 **[Live demo](https://shopifyoperatorzero.vercel.app/login)**

---

## What it is

Operator Zero is the anti-dashboard. Instead of giving a small store owner more screens to watch, an agent absorbs the operator-level work and surfaces only what needs human judgment.

The founder builds workflows in plain language and sets a trust level on each one:

- **L1, manual:** the agent suggests, the founder does it.
- **L2, approval-gated:** the agent does the work, then waits for a one-tap approval before any live change.
- **L3, autonomous:** the agent runs end to end and logs everything.

Trust is more than the level. Every action lands in an activity feed the founder can review, and anything can be reverted or edited. When they do, the agent records it as a preference and learns what they like.

## Architecture

The system splits into a stateless web tier and a durable agent tier:

- **Web tier (Vercel):** page loads, chat, and approvals go through Next.js routes. Chat streams over SSE because it has to feel instant.
- **Agent tier (Inngest):** workflow runs, plan generation, and autonomous actions run as durable background jobs that survive restarts. An approval-gated workflow pauses with `waitForEvent` and resumes exactly where it left off once approved.
- **Observability before effect:** every action is logged before it touches Shopify or Gmail, and every external write is idempotent, so retries never apply the same change twice.
- **Multi-tenant from day one:** every table carries `user_id`, every query filters by it, and Postgres RLS enforces it.

A single **Orchestrator** agent carries four embedded domain playbooks — Catalog, SEO, Q&A, and Inventory — rather than routing to separate specialist agents. Per-domain specialist agents are a v2 direction, not a v1 architecture.

## Features

- **My Workflows:** the home screen. The founder's portfolio of workflows grouped by status, with the L1/L2/L3 trust toggle inline.
- **Conversation:** chat with the Orchestrator to build workflows in plain language, with inline approval cards.
- **Approvals:** a batch inbox for approval-gated work, with preview, approve, edit, reject, and snooze.
- **Activity:** a filterable feed of every action, with before and after states and drift-aware revert.
- **Settings:** brand voice, autonomy thresholds, agent memory, sessions, and account export or delete.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript (strict) |
| Hosting | Vercel |
| Data | Supabase (Postgres 16, pgvector, Auth, Realtime, Storage) |
| ORM / migrations | Drizzle |
| Agent tier | Inngest (durable workflow runtime) |
| LLM | Google Gemini (primary, via Google AI Studio) · Anthropic Claude and Groq supported via MODEL_PROFILE — all through the Vercel AI SDK |
| Embeddings | Voyage AI |
| UI | Tailwind · shadcn/ui · Radix · Lucide · Framer Motion · Sonner |
| Validation | Zod (all external input) |
| Security | libsodium (encrypted-at-rest) · Upstash (rate limits) · HMAC webhooks |
| Testing | Vitest · Playwright · axe-core |

## Project structure

```
app/            Next.js App Router: auth, onboarding, and the /app surfaces
  app/          workflows · chat · approvals · activity · home · settings
  api/          route handlers: chat SSE, inngest, integrations, webhooks
lib/
  agent/        runtime · prompt · tools · generation · memory · embeddings
  inngest/      durable functions (the workflow engine)
  integrations/ shopify + gmail adapters
  workflows/    versioning, revert, grouping, autonomy logic
  auth/ db/ approvals/ cost-cap · rate-limit
components/     ui (shadcn) + per-surface components
drizzle/        schema + migrations
supabase/       Supabase config
Docs/           PRD · IA · Systems Design · Data Flow · Tech Spec
tests/          unit · integration · e2e · smoke
```

## Getting started

**Prerequisites:** Node (see [`.nvmrc`](./.nvmrc)), a Supabase project, and API keys for Google AI Studio (or Anthropic / Groq), Voyage, Shopify, and Gmail OAuth.

```bash
# 1. Install
npm install

# 2. Configure env: copy the example and fill in your keys
cp .env.local.example .env.local

# 3. Apply the database migrations (in /drizzle) to your Supabase project
npx drizzle-kit migrate

# 4. (optional) Seed demo workflows against a connected Shopify store
node scripts/seed-optimize-meta-workflow.mjs
node scripts/seed-optimize-descriptions-workflow.mjs
node scripts/seed-restock-workflow.mjs

# 5. Run
npm run dev
```

See [`.env.local.example`](./.env.local.example) for the full list of required variables and OAuth callback URLs.

## Testing

```bash
npm run test        # Vitest unit + integration
npm run test:e2e    # Playwright end-to-end (includes axe-core accessibility)
npm run typecheck   # tsc --noEmit (strict)
```

## Impact (modeled)

For a store run by a team of one to three people, the agent saves roughly **3.8 hours a week (about 16 hours a month)** by shrinking repetitive catalog, SEO, support, and inventory tasks to a quick approval. These are modeled estimates from published task times and order volumes, not measured results, since the product is pre-launch.

## Roadmap

- **v1 (done):** one Orchestrator chat, four operational domains, all three trust levels, full inspectability.
- **v2:** specialist domain surfaces, an experiments/growth surface, Q&A channels beyond Gmail (Meta/IG), team/multiplayer.
- **v3:** cross-store pattern library, operator console, workflow marketplace.

## Status & caveats

v1 is code-complete and deployed, with demo workflows running against a live Shopify Sandbox store. Tracked as **pre-GA** (not done): pricing, full SOC 2 / threat model / pen test, and a detailed mobile design pass.
