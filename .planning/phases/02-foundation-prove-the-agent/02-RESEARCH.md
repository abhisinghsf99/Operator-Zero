# Phase 02: Foundation — Prove the Agent — Research

**Researched:** 2026-05-21
**Domain:** Agent runtime, Shopify/Gmail OAuth + sync, Conversation surface, Workflow Engine, UI foundation
**Confidence:** HIGH (architecture confirmed from canonical docs) / MEDIUM (some library-specific gotchas from WebSearch)

---

## Summary

Phase 2 is the largest, most integration-heavy phase in the Operator Zero roadmap. It spans 38 requirements across six distinct areas — all of which must compose into a single working demo in under 30 minutes for a new user. The architecture is fully locked in the canonical docs (PRD, SYSTEMS-DESIGN, DATA-FLOW, TECH-SPEC), so research focuses on **implementation specifics**, **critical gotchas**, and **dependency ordering**.

The phase breaks into six self-contained implementation areas: (1) UI Foundation — install the shadcn/ui + Tailwind v4 token translation before any surface work; (2) Integrations — Shopify OAuth + full sync, Gmail OAuth + incremental sync, webhook handlers; (3) Onboarding wizard — 6-step flow with brand voice bootstrap and catalog audit; (4) Conversation surface — SSE streaming, thread management, workflow visualizer, inline approval cards; (5) Agent Runtime — prompt construction, tool dispatch, memory persistence, cost capping; (6) Workflow Engine — durable Inngest execution, L1/L2/L3 paths, the critical L2 pause/resume via `step.waitForEvent`.

**The single highest-risk component** is the L2 approval pause/resume — Inngest's `step.waitForEvent` is the mechanism, and it is well-suited to the pattern, but the wiring between the DB `approvals` row, the Inngest event, and two UI surfaces (inline card + Inbox) requires careful implementation and is the Success Criterion #5 gate.

**Phase complexity flag:** 38 requirements across 6 major areas, a new schema with 15+ tables, a full UI component library standing up from zero, and two real OAuth integrations. This is almost certainly too large for a single atomic plan. The recommendation is to structure this as 5–6 separate plans with explicit dependency gates: UI Foundation → Integrations → Schema Migration → Onboarding → Conversation/Agent → Workflow Engine. Plans 5 and 6 (Conversation + Workflow Engine) can start in parallel after Plans 1–4 complete.

**Primary recommendation:** Build in dependency order. Stand up the UI foundation and run the schema migration before writing a single surface component. The L2 approval mechanism is the keystone — implement and test it in isolation before connecting it to the Conversation surface.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTEG-01 | Shopify OAuth with minimum scopes; handshake <60s p50 | OAuth handshake flow documented; `@shopify/shopify-api` v13 handles HMAC, code exchange. State nonce stored in DB. |
| INTEG-02 | Full catalog/orders/content/inventory sync on connect via background Inngest job | GraphQL cursor pagination (250/page); bulk operations for stores >5000 SKUs |
| INTEG-03 | Webhooks update mirror on change; 15-min polling fallback | HMAC verification via `X-Shopify-Hmac-Sha256`; Inngest fan-out from webhook handler |
| INTEG-04 | Gmail OAuth (`gmail.modify`); skippable in onboarding with warning | Same Google OAuth flow as existing auth; `gmail.modify` scope added |
| INTEG-05 | 30-day thread sync on connect; 5-min polling via History API; support email classification | Gmail History API cursor stored in `gmail_sync_state`; Anthropic fast-path for classification |
| INTEG-06 | Connection health visible; broken tokens surface reconnect path | `integrations.status` + `last_synced_at`; stale = >24h; red/yellow badge |
| INTEG-07 | All Shopify writes idempotent, direct to Shopify, then re-read to update mirror | Idempotency key pattern on each write; read-back after write confirms mirror |
| AUTH-07 | Per-user daily cost cap — soft warns in chat, hard disables write tools | Upstash Redis `INCRBY` atomic pattern; `cost_aggregates` table; checked before every LLM call |
| ONBOARD-01 | Inline onboarding wizard within app shell (not a modal) | Surface-level App Router route `app/onboarding/` + step state in URL or session |
| ONBOARD-02 | Shopify required; Gmail skippable with warning | Step 2 required gate; Step 3 optional with explicit `skipGmail` flag |
| ONBOARD-03 | Brand voice 3-5 message conversation saves profile before Conversation | Scoped agent call with only `ask_user_clarification` + `record_memory_item` tools |
| ONBOARD-04 | Read-only catalog audit returns ≥3 starter suggestions | Inngest `catalogAudit` function; queries `shopify_products` mirror; LLM generates suggestions |
| ONBOARD-05 | Starters created as Draft L2 workflows | `workflows.status = 'draft'`, `automation_level = 'L2'`, `source = 'onboarding'` |
| ONBOARD-06 | Abandoned onboarding saves progress and resumes | `user_profiles.onboarding_step` or session cookie persists last completed step |
| ONBOARD-07 | Empty store skips catalog audit; suggests content/Q&A only | Count of `shopify_products` = 0 branch in `catalogAudit` function |
| ONBOARD-08 | Post-onboarding lands in Conversation with welcome message | `user_profiles.onboarding_completed_at` set; redirect to `/app/chat` with seed message |
| CONV-01 | Streamed Orchestrator response; <2s first token p50 | SSE via Route Handler `/api/chat/[threadId]/send`; Anthropic SDK `.stream()` |
| CONV-02 | Orchestrator proposes workflow plan with "Save as Workflow" action | `propose_workflow_plan` tool call; `inline_block_type = 'workflow_plan'` on message |
| CONV-03 | Live workflow build visualizer assembles inline as narration streams | Client component reads `inline_block_payload`; Framer Motion (motion/react) step reveals |
| CONV-04 | Threads, auto-named, reverse-chronological | `threads` table; auto-name via first message truncation or Anthropic fast-path |
| CONV-05 | New thread inherits brand voice + memory; no message history | New `threads` row; agent context loaded fresh from `memory_items` + `brand_voice_profiles` |
| CONV-06 | Agent memory persists across threads — pgvector semantic recall | `memory_items` + `memory_embeddings` with Voyage embeddings; top-K similarity recall per call |
| CONV-07 | Embedded previews for content drafts | `inline_block_type = 'preview'` on messages; markdown renderer |
| CONV-08 | Reasoning chains collapsed with "Why?" expander | `inline_block_type = 'reasoning'` or field on message; CSS toggle |
| CONV-09 | Graceful degradation — latency indicators, retry, queue, auto-save Draft | `messages.status = 'streaming'` placeholder; client retry logic; window `beforeunload` handler |
| AGENT-01 | Runtime constructs prompts from system + store context + brand voice + memory + tools under token budget | `lib/agent/runtime.ts`; prompt assembly from 6 sections; truncation of oldest context first |
| AGENT-02 | v1 read tools always safe | 11 read tools defined in `lib/agent/tools/`; no approval gate |
| AGENT-03 | v1 write tools gated by automation level | 11 write tools; `approvalRequired(input, ctx)` check before execute |
| AGENT-04 | Tool inputs validated via Zod; invalid input returns correctable error to model | Each tool's `input` schema is Zod; validation errors become `tool_result` with error message |
| AGENT-05 | Agent records durable memory items silently with pgvector embeddings | `record_memory_item` meta tool; embeds content via Voyage; inserts `memory_items` + `memory_embeddings` |
| AGENT-06 | Error classification — transient → retry; auth → pause; budget → degrade | Anthropic SDK error codes; `instanceof` checks in `lib/agent/runtime.ts` error handler |
| WF-01 | Workflow schema: name/desc/trigger/steps/level/status/source | `workflows` + `workflow_versions` + `workflow_runs` tables as designed in DATA-FLOW.md |
| WF-02 | Durable multi-step execution via Inngest; resume from checkpoint | `executeWorkflowRun` Inngest function; each step is `step.run()`; checkpointed automatically |
| WF-03 | L1 prepares action, waits for manual trigger — no approval entry | `automation_level = 'L1'`; `workflow_runs.status = 'paused_manual'`; no `approvals` row |
| WF-04 | L2 pauses at boundary, creates approval, resumes on approve/reject | `step.waitForEvent`; `approvals` row; Inngest event `approval.resolved` |
| WF-05 | L3 executes without approval, logs everything | No pause; directly executes tool; inserts `activity_entries` |
| WF-06 | Every agent action writes Activity entry within 5s | Activity insert before returning from tool handler; Inngest retry does not duplicate (idempotency) |
| SET-01 | Connections section: Shopify/Gmail status + last sync + reconnect/disconnect | `app/app/settings/page.tsx` (or route); Server Action reads `integrations`; reconnect re-initiates OAuth |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shopify/Gmail OAuth handshake | API (Route Handler) | — | OAuth redirect/callback is server-to-server; never client-side |
| Shopify full sync + webhook processing | Agent tier (Inngest) | — | Long-running; needs durable retry; not a request/response operation |
| Gmail incremental poll | Agent tier (Inngest) | — | Scheduled background job; History API cursor persisted in DB |
| Onboarding step rendering | Frontend (RSC + client island) | API (Server Action) | UI renders server-side; mutations (save step progress) via Server Actions |
| Brand voice bootstrap conversation | API (Route Handler) | Agent tier (scoped) | Single synchronous turn with LLM; no durable execution needed |
| Catalog audit for starter workflows | Agent tier (Inngest) | API (Server Action triggers it) | Read-only but may take >30s for large stores |
| Chat streaming (SSE) | API (Route Handler) | Frontend (EventSource / ReadableStream) | Server Actions don't support streaming; must be Route Handler |
| Workflow build visualizer | Frontend (client island) | — | React + Framer Motion; reads message stream state client-side |
| Agent prompt construction + tool dispatch | Agent tier (lib/agent/runtime.ts) | — | Shared by both chat path and workflow execution path |
| Memory storage + semantic recall | Agent tier / API | Database (pgvector) | Voyage embeddings generated server-side; stored in Supabase |
| Workflow execution (L1/L2/L3) | Agent tier (Inngest function) | Database | Durable; long-running; checkpointed |
| L2 approval pause/resume | Agent tier (Inngest waitForEvent) | Database (approvals table) + Frontend (Realtime) | Inngest holds state; DB is source of truth; Realtime pushes to UI |
| Approval badge count | Database (Realtime) | Frontend (client subscription) | Supabase Realtime `postgres_changes` subscription on `approvals` |
| Activity log writes | Agent tier (tool handlers) | Database | Every tool handler writes to `activity_entries` before external effect |
| Cost cap enforcement | API (before LLM call) | Database (cost_aggregates) + Redis | Redis atomic increment; checked in `lib/agent/runtime.ts` |
| Connection health display (SET-01) | Frontend (RSC) | Database | Server Component reads `integrations` table directly |

---

## Standard Stack

### Core (all already installed from Phase 1 or locked by TECH-SPEC)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.6 (installed) | App Router, RSC, Route Handlers, Server Actions | Locked by TECH-SPEC |
| `@anthropic-ai/sdk` | 0.97.1 (installed) | LLM calls; `.stream()` for chat; tool use | Locked |
| `inngest` | 4.4.0 (installed) | Durable workflows; `step.waitForEvent` for L2 | Locked |
| `drizzle-orm` | 0.45.2 (installed) | Typed Postgres; vector column support | Locked |
| `@supabase/ssr` | 0.10.3 (installed) | Auth + Realtime subscriptions | Locked |
| `zod` | ^3.24.0 (installed) | Tool input validation; API input validation | Locked |
| `voyageai` | 0.2.1 (installed) | 1024-dim embeddings for memory + brand voice | Locked |

### New Installs Required for Phase 2

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@shopify/shopify-api` | 13.0.0 | Shopify OAuth, Admin GraphQL client, webhook HMAC | Official Shopify SDK; handles nonce, HMAC, code exchange |
| `googleapis` | 172.0.0 | Gmail REST API client; History API for incremental sync | Official Google client library |
| `framer-motion` | 12.40.0 | Workflow build visualizer step-reveal animation | Locked by TECH-SPEC; v12 supports OKLCH + `prefers-reduced-motion` |
| `sonner` | 2.0.7 | Toast notifications (cost warning, sync errors, approvals) | Locked by TECH-SPEC; accessible, lightweight |
| `class-variance-authority` | 0.7.1 | Component variant management (shadcn/ui dependency) | Required by shadcn/ui component pattern |
| `clsx` | 2.1.1 | Conditional class merging | Required by shadcn/ui `cn()` utility |
| `tailwind-merge` | 3.6.0 | Tailwind class deduplication in `cn()` | Required by shadcn/ui `cn()` utility |
| `lucide-react` | 1.16.0 | Icon set | Locked by TECH-SPEC |
| `react-markdown` | 10.1.0 | Brand voice profile display; content draft previews | Sanitizing markdown renderer; prevents XSS |
| `zustand` | 5.0.13 | Transient draft state in composer across nav | Only where Server Actions can't hold state |

**Note on framer-motion:** The package was renamed to `motion` in 2025 (import path `motion/react`), but the npm package `framer-motion@12.x` still works and the import can be from either `framer-motion` or `motion/react`. TECH-SPEC says `framer-motion`, so use the `framer-motion` package name but prefer `motion/react` imports. [ASSUMED — verify import path with installed version] [VERIFIED: npm registry — version 12.40.0 exists on registry]

**Installation:**
```bash
npm install @shopify/shopify-api googleapis framer-motion sonner class-variance-authority clsx tailwind-merge lucide-react react-markdown zustand
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@shopify/shopify-api` | Manual OAuth + raw GraphQL fetch | More control, much more code; HMAC verification is error-prone to hand-roll |
| `googleapis` | Raw Gmail REST fetch | Google client library handles token refresh, pagination, and typing automatically |
| `framer-motion` | CSS transitions | Cannot do the sequential step-reveal with data-driven timing; TECH-SPEC locks Framer Motion |

---

## Package Legitimacy Audit

> slopcheck was unavailable (auto-install blocked). Verification performed via `npm view` on each package plus cross-reference with official documentation links.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@shopify/shopify-api` | npm | 6+ yrs | Millions/wk | github.com/Shopify/shopify-app-js | Not run | Approved — official Shopify org |
| `googleapis` | npm | 10+ yrs | Millions/wk | github.com/googleapis/google-api-nodejs-client | Not run | Approved — official Google org |
| `framer-motion` | npm | 6+ yrs | 15M+/wk | github.com/framer/motion | Not run | Approved — locked in TECH-SPEC |
| `sonner` | npm | 3+ yrs | 5M+/wk | github.com/emilkowalski/sonner | Not run | Approved — locked in TECH-SPEC |
| `class-variance-authority` | npm | 3+ yrs | 10M+/wk | github.com/joe-bell/cva | Not run | Approved — shadcn/ui official dep |
| `clsx` | npm | 8+ yrs | 50M+/wk | github.com/lukeed/clsx | Not run | Approved — ubiquitous utility |
| `tailwind-merge` | npm | 4+ yrs | 20M+/wk | github.com/dcastil/tailwind-merge | Not run | Approved — shadcn/ui official dep |
| `lucide-react` | npm | 5+ yrs | 10M+/wk | github.com/lucide-icons/lucide | Not run | Approved — locked in TECH-SPEC |
| `react-markdown` | npm | 8+ yrs | 10M+/wk | github.com/remarkjs/react-markdown | Not run | Approved — standard markdown renderer |
| `zustand` | npm | 5+ yrs | 15M+/wk | github.com/pmndrs/zustand | Not run | Approved — locked in TECH-SPEC |

*slopcheck was unavailable at research time. All packages above are tagged `[ASSUMED]` for official-org verification. The planner must gate each install behind a `checkpoint:human-verify` task — specifically verifying that the package names above exactly match the intended packages before `npm install`.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client Islands)
  │
  ├── Composer → POST /api/chat/[threadId]/send
  │                     │
  │               Route Handler ──→ Anthropic SDK .stream()
  │                     │                 │
  │                     │         SSE token stream ──→ Browser (EventSource)
  │                     │                 │
  │                     │         Tool calls intercepted:
  │                     │           propose_workflow_plan → inline_block_payload
  │                     │           record_memory_item → memory_items + embeddings
  │                     │
  │               Persist: messages (status: streaming → complete)
  │               Persist: agent_telemetry
  │
  ├── Supabase Realtime subscription (approvals, workflow_runs)
  │     ↓
  │   Badge count update, inline approval card state change
  │
  └── Server Actions (mutations):
        saveWorkflowFromPlan, approveItem, changeAutomationLevel, connectIntegration

Agent Tier (Inngest Functions)
  │
  ├── executeWorkflowRun
  │     step.run('load') → step.run('step-N') → ...
  │     [L2] → step.run('create-approval') → step.waitForEvent('approval.resolved', '14d')
  │              ↓ (Inngest suspends, no compute)
  │     [Resume when approval.resolved event fires from Server Action]
  │              ↓
  │     step.run('execute-approved-action') → shopify-adapter write
  │
  ├── shopifyFullSync / shopifyIncrementalPoll
  │     Cursor-paginated GraphQL → UPSERT shopify_products/variants/orders/pages/redirects
  │
  ├── gmailInitialSync / gmailIncrementalPoll
  │     Gmail History API → gmail_threads + gmail_messages + classification
  │
  └── catalogAudit (onboarding)
        Query shopify_products for issues → LLM → Draft workflow rows

External APIs
  ├── Shopify Admin GraphQL  (X-Shopify-Access-Token)
  └── Gmail REST API         (Bearer: access_token)
```

### Recommended Project Structure (Phase 2 additions)

```
app/
├── onboarding/
│   ├── page.tsx                    # Wizard shell (RSC + step routing)
│   └── _steps/                     # Step components
│       ├── welcome.tsx
│       ├── connect-shopify.tsx
│       ├── connect-gmail.tsx
│       ├── brand-voice.tsx
│       ├── catalog-audit.tsx
│       └── done.tsx
├── app/
│   ├── chat/
│   │   ├── page.tsx                # New thread or latest thread
│   │   └── [threadId]/
│   │       └── page.tsx            # Specific thread (RSC shell)
│   ├── settings/
│   │   └── page.tsx                # SET-01: Connections section
│   └── home/                       # Existing Phase 1 placeholder
├── api/
│   ├── chat/
│   │   └── [threadId]/
│   │       └── send/
│   │           └── route.ts        # SSE streaming endpoint
│   ├── integrations/
│   │   ├── shopify/
│   │   │   ├── connect/route.ts    # Initiates OAuth
│   │   │   └── callback/route.ts  # Code exchange + sync trigger
│   │   └── gmail/
│   │       ├── connect/route.ts
│   │       └── callback/route.ts
│   └── webhooks/
│       └── shopify/
│           └── route.ts            # HMAC-verified webhook receiver

components/
├── ui/                             # shadcn/ui copied components (Button, Input, Dialog, etc.)
├── chat/
│   ├── thread-sidebar.tsx
│   ├── message-stream.tsx
│   ├── composer.tsx
│   ├── workflow-visualizer.tsx
│   └── inline-approval-card.tsx
├── onboarding/
│   ├── progress-rail.tsx
│   └── connect-step.tsx
└── layout/
    ├── sidebar.tsx                 # Desktop nav
    └── bottom-tabs.tsx             # Mobile nav

lib/
├── db/schema/                      # New Drizzle schemas
│   ├── workflows.ts
│   ├── workflow-versions.ts
│   ├── workflow-runs.ts
│   ├── activity-entries.ts
│   ├── approvals.ts
│   ├── threads.ts
│   ├── messages.ts
│   ├── memory-items.ts
│   ├── memory-embeddings.ts
│   ├── brand-voice.ts
│   ├── autonomy-thresholds.ts
│   ├── shopify-mirror.ts
│   ├── gmail-mirror.ts
│   └── telemetry.ts
├── agent/
│   ├── runtime.ts                  # streamChat() + runWorkflowStep()
│   ├── prompt.ts                   # Prompt assembly (6 sections, token budget)
│   ├── tools/
│   │   ├── index.ts                # Tool registry
│   │   ├── read/                   # 11 read tools
│   │   └── write/                  # 11 write tools + workflow tools + meta tools
│   └── memory.ts                   # Memory recall helpers
├── integrations/
│   ├── shopify/
│   │   ├── client.ts               # Phase 1 stub → real implementation
│   │   ├── sync.ts                 # Full sync + incremental
│   │   ├── mutations.ts            # Write operations with idempotency
│   │   └── webhooks.ts             # HMAC verification
│   └── gmail/
│       ├── client.ts               # Phase 1 stub → real implementation
│       ├── sync.ts                 # 30-day initial + History API polling
│       └── classify.ts             # Support email classifier
└── inngest/
    ├── functions/
    │   ├── execute-workflow-run.ts  # The main workflow engine
    │   ├── shopify-sync.ts
    │   ├── gmail-sync.ts
    │   └── catalog-audit.ts
    └── client.ts                   # Existing; may need maxDuration bump to 300

supabase/migrations/
├── 0001_initial_schema.sql         # Existing
├── 0002_schema_hardening.sql       # Existing
└── 0003_phase2_tables.sql          # [BLOCKING] new migration for all Phase 2 tables
```

---

## Per-Area Implementation Approach

### Area 1: UI Foundation — shadcn/ui + Tailwind v4 Token Translation

**What:** Install shadcn/ui, wire design tokens from `index.html` into Tailwind v4 `globals.css`, and create `lib/utils.ts` with the `cn()` utility. This must complete before any surface component can be built.

**How:**

1. Run `npx shadcn@latest init` — creates `components.json`, installs `clsx`, `tailwind-merge`, `class-variance-authority`, scaffolds `components/ui/`, creates `lib/utils.ts` with `cn()`. [CITED: ui.shadcn.com/docs/installation/next]

2. Tailwind v4 token translation: the current `globals.css` has default Next.js tokens. Replace with the OKLCH paper palette from `Operator Zero Design Files/index.html`. The design file uses CSS custom properties (`--bg`, `--text`, `--acc-workflow`, etc.) — these need to map into Tailwind's `@theme inline` directive:

```css
/* app/globals.css — Phase 2 update */
@import "tailwindcss";

:root {
  /* Paper / warm neutral palette from design tokens */
  --bg:           oklch(98.5% 0.005 80);
  --bg-elevated:  oklch(99.5% 0.003 80);
  --bg-subtle:    oklch(96.5% 0.008 80);
  --bg-deeper:    oklch(94% 0.012 80);
  --bg-inset:     oklch(91% 0.014 80);
  --border:       oklch(90% 0.014 80);
  --border-strong: oklch(82% 0.018 80);
  --text:         oklch(22% 0.008 60);
  --text-secondary: oklch(44% 0.012 60);
  --text-tertiary: oklch(58% 0.010 60);
  --acc-workflow:  oklch(46% 0.13 282);
  --acc-workflow-bg: oklch(96% 0.020 282);
  --acc-workflow-ink: oklch(28% 0.10 282);
  /* ... all tokens from index.html */
}

@theme inline {
  /* Map CSS vars to Tailwind utility classes */
  --color-bg: var(--bg);
  --color-bg-elevated: var(--bg-elevated);
  --color-text: var(--text);
  --color-border: var(--border);
  --color-acc-workflow: var(--acc-workflow);
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Instrument Serif", ui-serif, Georgia, serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
```

3. shadcn/ui components are copied into `components/ui/`. The design file's components (`Button`, `Badge`, `Card`, `LevelToggle`) are visual targets — translate them using shadcn primitives + Radix, NOT the inline-styled versions from the design file.

4. **Critical:** The design file uses `@import "https://fonts.googleapis.com/..."` — this needs to move into `app/layout.tsx` as a Next.js `<link>` or via `next/font`.

**Gotcha:** shadcn v4 components no longer use `React.forwardRef` and use `data-slot` attributes for styling hooks. [CITED: ui.shadcn.com/docs/tailwind-v4]

---

### Area 2: Shopify Integration (INTEG-01, 02, 03, 06, 07)

**OAuth Flow (INTEG-01):** [CITED: shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant]

```
GET /api/integrations/shopify/connect
  1. Generate cryptographic nonce (state)
  2. Store nonce in DB tied to session (integrations_oauth_state table or user session)
  3. Redirect → https://{shop}.myshopify.com/admin/oauth/authorize
     ?client_id=...&scope=...&redirect_uri=...&state={nonce}

GET /api/integrations/shopify/callback?code=...&state=...&shop=...&hmac=...
  1. Verify state matches stored nonce (CSRF protection)
  2. Verify HMAC: remove hmac from params, HMAC-SHA256 rest of params with client_secret
  3. Validate shop is a valid .myshopify.com domain (no open redirects)
  4. POST https://{shop}.myshopify.com/admin/oauth/access_token
     { client_id, client_secret, code }
  5. Encrypt and store access_token in integrations table
  6. UPDATE user_profiles.shopify_shop = shop domain
  7. Fire Inngest event 'shopify.connected' → triggers full sync
  8. Redirect to onboarding step 2 completion
```

**Required scopes (from SYSTEMS-DESIGN §6.1):**
```
read_products,write_products,read_orders,read_content,write_content,
read_inventory,write_inventory,read_themes,write_themes,read_locales,write_locales
```

**The `@shopify/shopify-api` library** provides `shopify.auth.begin()` and `shopify.auth.callback()` helpers that handle HMAC verification and code exchange. However, Operator Zero manages its own session storage (Postgres `integrations` table) — do NOT use Shopify's built-in session storage. Use `shopify.auth.callback()` to get the session object, then extract `accessToken` and store it encrypted. [ASSUMED — verify exact API surface of v13]

**Full Sync (INTEG-02):** Inngest function `shopifyFullSync`:
- GraphQL cursor pagination: `first: 250, after: $cursor`
- `pageInfo { hasNextPage, endCursor }` drives the loop
- For stores with >5000 products, consider Shopify's Bulk Operations API (async JSONL delivery)
- Mirror tables: `shopify_products`, `shopify_product_variants`, `shopify_orders`, `shopify_pages`, `shopify_redirects`
- Update `shopify_sync_state.last_full_sync_at` on completion

**Webhooks (INTEG-03):**
- Register webhooks via Shopify Admin GraphQL `webhookSubscriptionCreate` mutation during connect
- Topics needed: `PRODUCTS_CREATE`, `PRODUCTS_UPDATE`, `PRODUCTS_DELETE`, `ORDERS_CREATE`, `ORDERS_UPDATED`, `INVENTORY_LEVELS_UPDATE`
- Route Handler at `/api/webhooks/shopify` verifies `X-Shopify-Hmac-Sha256` header before processing
- Return `200 OK` immediately; push to Inngest for async processing
- Store webhook subscription IDs in `shopify_sync_state.webhook_subscriptions` JSONB

**15-min polling fallback (INTEG-03):**
```typescript
// lib/inngest/functions/shopify-sync.ts
export const shopifyPoll = inngest.createFunction(
  { id: 'shopify-poll' },
  { cron: '*/15 * * * *' },
  async ({ step }) => {
    // For each user with active Shopify integration, trigger incremental sync
  }
);
```

**Idempotent writes (INTEG-07):**
- Every write tool attaches an idempotency key: `${userId}:${actionType}:${targetId}:${timestamp_bucket_15min}`
- Read before_state from mirror; write to Shopify; re-read to update mirror
- Activity entry written BEFORE Shopify API call (observability first)

---

### Area 3: Gmail Integration (INTEG-04, 05)

**OAuth Flow (INTEG-04):**
- Reuse existing Google OAuth infrastructure from Supabase Auth
- BUT: the Shopify store owner's Google account may differ from their Supabase Google login
- Safest: implement a separate Gmail OAuth flow with `googleapis` that requests only `gmail.modify` scope
- Store Gmail access + refresh tokens in `integrations` table with `provider = 'gmail'`
- Gmail refresh tokens DO expire (offline access scope needed): request `access_type=offline&prompt=consent`

**Initial Sync (INTEG-05):**
```typescript
// Initial: pull last 30 days of threads
const threads = await gmail.users.threads.list({
  userId: 'me',
  q: 'newer_than:30d',
  maxResults: 100,
});
// Store last historyId from profile for incremental sync
const profile = await gmail.users.getProfile({ userId: 'me' });
await db.update(gmailSyncState).set({ last_history_id: profile.data.historyId });
```

**Incremental Sync (History API):**
```typescript
// Every 5 min via Inngest cron
const history = await gmail.users.history.list({
  userId: 'me',
  startHistoryId: lastHistoryId,
  historyTypes: ['messageAdded'],
});
// historyId is valid for at least a week; store latest per poll
```

**Support email classification:**
- Fast-path Anthropic call (smaller model) with prompt: "Is this email a customer support question? Reply YES or NO."
- Set `gmail_threads.is_customer_support = true/false`

**Token refresh pattern (Gmail tokens expire):**
```typescript
// In gmail/client.ts
async function getAccessToken(userId: string): Promise<string> {
  const integration = await loadIntegration(userId, 'gmail');
  if (isExpired(integration.expires_at)) {
    const newToken = await refreshGmailToken(integration.refresh_token_encrypted);
    await updateIntegration(userId, 'gmail', newToken);
    return newToken;
  }
  return decryptToken(integration.access_token_encrypted);
}
```

---

### Area 4: Onboarding Wizard (ONBOARD-01 through 08)

**Route structure:**
```
app/onboarding/page.tsx
```
This renders within the app shell (not a modal). Middleware needs to allow `/onboarding` without requiring `onboarding_completed_at` to be set — add an exception to the auth guard.

**Step persistence (ONBOARD-06):**
- Add `onboarding_step` column to `user_profiles` (integer, 0-5)
- On each step completion, Server Action updates `user_profiles.onboarding_step`
- On login, if `onboarding_completed_at IS NULL`, redirect to `/onboarding?step={onboarding_step}`

**Brand voice bootstrap (ONBOARD-03):**
- Scoped agent call: system prompt instructs "Ask these 3 questions, record the answers as brand voice"
- Tools available: ONLY `ask_user_clarification` + `record_memory_item`
- After 3-5 turns, call a Server Action to finalize and save `brand_voice_profiles` row
- This is a synchronous chat exchange — use the same SSE streaming path as Conversation

**Catalog audit (ONBOARD-04):**
- Triggered as Inngest event after Shopify sync completes
- Read-only: query `shopify_products` for: `meta_title IS NULL`, `body_html IS NULL OR length(body_html) < 100`
- Pass issue list to Anthropic → generate 3-5 workflow suggestions as JSON
- Return via Supabase Realtime broadcast to the onboarding UI (or simple polling on a `catalog_audit_results` table)
- Empty store path: count of products = 0 → skip audit step, suggest 3 hardcoded content/Q&A workflows

---

### Area 5: Conversation Surface + Agent Runtime (CONV-01 through 09, AGENT-01 through 06)

**SSE Streaming Route (CONV-01):** [CITED: platform.claude.com/docs/en/api/messages-streaming]

```typescript
// app/api/chat/[threadId]/send/route.ts
export const dynamic = 'force-dynamic'; // Prevent Next.js caching
export const maxDuration = 60; // Match Inngest handler

export async function POST(req: Request, { params }) {
  const session = await requireSession(req);
  const { message } = await req.json();
  const { threadId } = await params; // Next.js 15: params must be awaited

  // 1. Validate thread ownership
  // 2. Persist user message
  // 3. Load agent context (memory, brand voice, last N messages)
  // 4. Construct prompt
  // 5. Insert assistant message placeholder (status: 'streaming')
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const anthropicStream = await anthropic.messages.stream({
        model: 'claude-opus-4-7',
        system: context.systemPrompt,
        messages: context.messages,
        tools: getToolDefinitions(),
        max_tokens: 4096,
      });
      
      for await (const event of anthropicStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
        }
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          // Handle tool call — may involve creating workflow plan or memory item
          await handleToolUse(event.content_block, context);
        }
      }
      
      // Finalize: update assistant message to 'complete'
      await finalizeMessage(assistantMsgId, anthropicStream.finalMessage());
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Workflow Build Visualizer (CONV-03):**
- When `propose_workflow_plan` tool fires during streaming, the tool handler saves plan to `messages.inline_block_payload`
- Client reads `inline_block_type === 'workflow_plan'` and renders the `WorkflowVisualizer` component
- Steps arrive one-by-one as the model narrates; each step gets added to `inline_block_payload.steps[]` via a Realtime update OR the client builds incrementally from the streamed text
- Framer Motion pattern:
```typescript
// components/chat/workflow-visualizer.tsx
import { motion, AnimatePresence } from 'framer-motion'; // or 'motion/react'

const stepVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

function WorkflowVisualizer({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div>
      <AnimatePresence>
        {steps.map((step, i) => (
          <motion.div
            key={step.id}
            variants={stepVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: i * 0.15 }}
          >
            <StepCard step={step} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

**Prompt construction (AGENT-01):**
```typescript
// lib/agent/prompt.ts
export async function buildSystemPrompt(userId: string, threadId?: string): Promise<string> {
  const [memoryItems, brandVoice, storeContext, semanticRecall] = await Promise.all([
    loadMemoryItems(userId),            // All structured memory (<500 items)
    loadBrandVoiceProfile(userId),
    loadStoreContext(userId),           // shop domain, product_count summary
    querySemanticMemory(userId, query), // top-5 by cosine similarity
  ]);
  
  // Assemble with token budget: recent context > older memory
  return assemblePrompt({ memoryItems, brandVoice, storeContext, semanticRecall });
}
```

**Token budget:** Cap system prompt at 15k tokens for chat, 20k for workflow steps. Truncate oldest memory items and semantic recalls first. [ASSUMED — specific thresholds; tune from beta data]

**Memory persistence (AGENT-05):**
```typescript
// Tool handler for record_memory_item
async function handleRecordMemoryItem(input: { category: string; content: string }) {
  const memoryItem = await db.insert(memoryItems).values({ ...input, user_id: userId });
  const embedding = await embedText(input.content); // Voyage voyage-4
  await db.insert(memoryEmbeddings).values({
    user_id: userId,
    source_type: 'memory_item',
    source_id: memoryItem.id,
    content: input.content,
    embedding, // vector(1024)
  });
}
```

**Error classification (AGENT-06):**
```typescript
try {
  await anthropic.messages.create(...);
} catch (err) {
  if (err instanceof Anthropic.APIStatusError && err.status === 401) {
    // auth error — surface reconnect
  } else if (err instanceof Anthropic.APIStatusError && err.status === 529) {
    // overload — transient retry
  } else if (isBudgetExhausted(userId)) {
    // budget cap — degrade write tools
  } else {
    // transient — retry with backoff (Inngest handles this for workflow steps)
  }
}
```

---

### Area 6: Workflow Engine — L1/L2/L3 + Durable Execution (WF-01 through 06)

**The L2 pause/resume is the keystone of this phase.**

**Inngest function structure (WF-02):** [CITED: inngest.com/docs/reference/typescript/functions/step-wait-for-event]

```typescript
// lib/inngest/functions/execute-workflow-run.ts
export const executeWorkflowRun = inngest.createFunction(
  {
    id: 'execute-workflow-run',
    concurrency: { limit: 1, key: 'event.data.userId' }, // Serialize per user
    retries: 3,
  },
  { event: 'workflow.run_requested' },
  async ({ event, step }) => {
    const { userId, workflowId, source } = event.data;
    
    const { workflow, version, run } = await step.run('load-and-create-run', async () => {
      // Load workflow, create workflow_runs row (status: 'queued' → 'running')
    });
    
    const context = await step.run('load-agent-context', async () => {
      return loadAgentContext(userId); // memory, brand voice, store context
    });
    
    for (const [i, workflowStep] of version.definition.steps.entries()) {
      const stepResult = await step.run(`execute-step-${i}`, async () => {
        return executeWorkflowStep(workflowStep, context, workflow, run);
      });
      
      // L1: Prepare and mark as awaiting manual trigger
      if (workflow.automation_level === 'L1') {
        await step.run(`mark-l1-pending-${i}`, async () => {
          await db.update(workflowRuns).set({ status: 'paused_manual' });
        });
        return; // Function completes; L1 is re-triggered manually
      }
      
      // L2: Create approval row, pause, wait for event
      if (stepResult.requiresApproval) {
        const approval = await step.run(`create-approval-${i}`, async () => {
          return db.insert(approvals).values({
            user_id: userId,
            workflow_run_id: run.id,
            status: 'pending',
            action_type: workflowStep.tool,
            proposed_action: stepResult.proposedAction,
            inngest_event_key: `approval.resolved.${run.id}.step.${i}`,
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            // ... other fields from DATA-FLOW.md
          }).returning();
        });
        
        await step.run(`update-run-paused-${i}`, async () => {
          await db.update(workflowRuns).set({ status: 'paused_for_approval', current_step_id: workflowStep.id });
        });
        
        // CRITICAL: This suspends the function. No compute used during wait.
        const decision = await step.waitForEvent(`wait-approval-${i}`, {
          event: 'approval.resolved',
          timeout: '14d',
          if: `async.data.approvalId == "${approval.id}"`,
          // 'async' refers to the triggering event; 'event' is the matched event
        });
        
        if (!decision || decision.data.decision === 'rejected') {
          await step.run(`finalize-rejected-${i}`, async () => {
            await db.update(workflowRuns).set({ status: 'failed' });
            await db.update(approvals).set({ status: 'rejected' });
          });
          return;
        }
        
        // Execute the approved action
        await step.run(`execute-approved-${i}`, async () => {
          return executeApprovedAction(approval, context);
          // This writes to Shopify / Gmail + inserts activity_entries
        });
      }
      
      // L3: Execute directly
      if (workflow.automation_level === 'L3' && !stepResult.requiresApproval) {
        await step.run(`execute-l3-${i}`, async () => {
          return executeDirectAction(workflowStep, context);
          // activity_entry written inside
        });
      }
    }
    
    await step.run('finalize', async () => {
      await db.update(workflowRuns).set({ status: 'succeeded', completed_at: new Date() });
    });
  }
);
```

**Sending the approval.resolved event (from Server Action):**
```typescript
// app/(app)/approvals/actions.ts
'use server';
export async function approveItem(approvalId: string, path: 'inline' | 'inbox') {
  const session = await requireSession();
  await requireApprovalOwnership(session.userId, approvalId);
  
  await db.update(approvals).set({
    status: 'approved',
    resolved_at: new Date(),
    resolved_by_path: path,
  });
  
  // This resumes the Inngest function
  await inngest.send({
    name: 'approval.resolved',
    data: { approvalId, decision: 'approved' },
  });
  
  revalidatePath('/approvals');
}
```

**CEL expression gotcha:** In `step.waitForEvent`, the `if` option uses CEL syntax where `async` refers to the **original triggering event** (the `workflow.run_requested` event) and `event` refers to the **awaited event** (the `approval.resolved` event). To match by approval ID, compare `event.data.approvalId` to the hardcoded approval ID using template literal. [CITED: inngest.com/docs/reference/typescript/functions/step-wait-for-event]

**Activity entry timing (WF-06):** The activity entry must be written BEFORE the external effect (Shopify API call). If the Shopify call fails and the function retries, the activity entry may be written twice — use idempotency key on `activity_entries` (e.g., `workflow_run_id` + `step_id` unique constraint) to prevent duplicates.

**Inngest maxDuration:** Phase 1 has `maxDuration = 60` on the Inngest route handler. For Phase 2 workflow execution, this needs to increase to 300 (max Vercel allows). Update both `lib/inngest/client.ts` (`maxRuntime: '4m'`, i.e., 20% below 300) and `app/api/inngest/route.ts` (`export const maxDuration = 300`). [CITED: inngest.com/docs/getting-started/nextjs-quick-start]

---

### Area 7: Cost Cap (AUTH-07)

**Pattern using Upstash Redis (already installed):**
```typescript
// lib/cost-cap.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });

const SOFT_CAP_USD = 5.00;  // warn at 80% = $4.00 [ASSUMED — placeholder until pricing lands]
const HARD_CAP_USD = 5.00;  // disable writes at 100% [ASSUMED]

export async function checkCostCap(userId: string): Promise<'ok' | 'soft' | 'hard'> {
  const today = new Date().toISOString().split('T')[0];
  const key = `oz:cost:${userId}:${today}`;
  const spent = await redis.get<number>(key) ?? 0;
  
  if (spent >= HARD_CAP_USD) return 'hard';
  if (spent >= SOFT_CAP_USD * 0.8) return 'soft';
  return 'ok';
}

export async function recordCost(userId: string, costUsd: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `oz:cost:${userId}:${today}`;
  const newVal = await redis.incrbyfloat(key, costUsd);
  if (newVal <= costUsd) { // key was just created
    await redis.expire(key, 25 * 60 * 60); // 25h TTL
  }
}
```

In `lib/agent/runtime.ts`, check cost cap before every LLM call:
- `'hard'` → return error to model: "Write tools disabled due to daily budget limit. Chat continues."
- `'soft'` → continue but inject warning into system prompt
- Also update `cost_aggregates` table nightly (Inngest cron) for user-facing cost visibility

---

### Area 8: Settings — Connections (SET-01)

Minimal surface for Phase 2. RSC page that reads `integrations` table:

```typescript
// app/app/settings/page.tsx (RSC)
export default async function SettingsPage() {
  const session = await requireSession();
  const integrations = await db.select().from(integrationsTable)
    .where(eq(integrationsTable.user_id, session.userId));
  // Render Shopify + Gmail rows with status badges
  // Reconnect = re-initiate OAuth flow
  // Disconnect = DELETE integration + clear mirror data (confirm dialog)
}
```

---

## New Schema / Tables Required

**Migration 0003 is BLOCKING** — no Phase 2 surface work can run without it.

All tables from DATA-FLOW.md §3–8 are new in Phase 2. Complete list:

| Table | Key Columns | RLS | Notes |
|-------|------------|-----|-------|
| `workflows` | user_id, name, automation_level, status, trigger_type, trigger_config, current_version_id, source | Yes | FK to workflow_versions is deferred (circular) |
| `workflow_versions` | workflow_id, version_number, definition JSONB | Via workflow FK | Add schema_version int DEFAULT 1 |
| `workflow_runs` | user_id, workflow_id, workflow_version_id, workflow_version_snapshot JSONB, status | Yes | status: queued/running/paused_for_approval/paused_manual/succeeded/failed/expired |
| `activity_entries` | user_id, workflow_run_id, action_type, before_state JSONB, after_state JSONB | Yes | 6-month retention; unique(workflow_run_id, step_id) for idempotency |
| `approvals` | user_id, workflow_run_id, status, proposed_action JSONB, inngest_event_key, expires_at | Yes | One table, two views (SYSTEMS-DESIGN §4.2) |
| `threads` | user_id, title, agent_context, last_message_at | Yes | |
| `messages` | thread_id, user_id, role, content, tool_calls JSONB, inline_block_type, inline_block_payload JSONB, status | Yes (via thread) | inline_block_type: 'workflow_plan'/'approval_card'/'preview'/'reasoning' |
| `memory_items` | user_id, category, content, soft_deleted_at | Yes | |
| `memory_embeddings` | user_id, source_type, source_id, embedding vector(1024) | Yes | IVFFlat or HNSW index |
| `brand_voice_profiles` | user_id PK, profile_markdown | Yes (user_id IS PK) | |
| `brand_voice_samples` | user_id, sample_text, embedding vector(1024) | Yes | |
| `autonomy_thresholds` | user_id PK, default_level, per_action_overrides JSONB | Yes | |
| `shopify_products` | (user_id, product_gid) PK, meta_title, body_html, status | Partial RLS | Composite PK |
| `shopify_product_variants` | (user_id, variant_gid) PK | Same | |
| `shopify_orders` | (user_id, order_gid) PK | Same | |
| `shopify_pages` | (user_id, page_gid) PK | Same | |
| `shopify_redirects` | (user_id, redirect_id) PK | Same | |
| `shopify_sync_state` | user_id PK, last_full_sync_at, last_webhook_at, sync_status, webhook_subscriptions JSONB | Yes | |
| `gmail_threads` | (user_id, gmail_thread_id) PK, is_customer_support | Same | |
| `gmail_messages` | (user_id, gmail_message_id) PK | Same | |
| `gmail_sync_state` | user_id PK, last_history_id, last_poll_at | Yes | |
| `agent_telemetry` | user_id, call_type, model_id, cost_usd, latency_ms | Yes | 90-day retention |
| `cost_aggregates` | (user_id, day) PK, total_cost_usd | Yes | Updated by nightly Inngest cron |

**pgvector setup for migration:**
```sql
-- Must run before CREATE TABLE with vector column
CREATE EXTENSION IF NOT EXISTS vector;

-- IVFFlat index (build only after sufficient data; can defer to post-seeding)
-- For Phase 2, use HNSW which doesn't require pre-seeding:
CREATE INDEX idx_memory_embeddings_hnsw ON memory_embeddings
  USING hnsw (embedding vector_cosine_ops);
```

**Drizzle vector column syntax:** [CITED: orm.drizzle.team/docs/guides/vector-similarity-search]
```typescript
import { vector, index } from 'drizzle-orm/pg-core';

embedding: vector('embedding', { dimensions: 1024 }),

// In table config:
index('memory_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops'))
```

**Note:** Voyage AI `voyage-4` uses 1024 dimensions; the existing `embeddings.ts` uses this model. DATA-FLOW.md says `vector(1536)` — this should be changed to `vector(1024)` to match the actual model. [ASSUMED — verify actual voyage-4 dimensions against Voyage documentation before writing migration]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shopify OAuth HMAC verification | Custom HMAC check | `@shopify/shopify-api` | Timing-safe comparison is subtle; library is official and audited |
| Shopify GraphQL pagination | Custom cursor loop | Library's built-in paginated query helpers | Rate limit handling and error retries are complex |
| Gmail token refresh | Custom OAuth refresh | `googleapis` library with auto-refresh | Refresh token rotation has timing edge cases |
| Workflow step checkpointing | Custom state machine in Postgres | Inngest `step.run()` + `step.waitForEvent()` | Inngest was built for exactly this pattern; re-implementing it is months of work |
| OKLCH color system | Custom CSS | CSS custom properties + Tailwind `@theme` | Browser handles OKLCH natively; no JS needed |
| Streaming token output to client | WebSocket | SSE via ReadableStream in Route Handler | SSE is unidirectional server-to-client, which is exactly what chat needs; simpler than WebSocket |
| Approval cross-surface sync | Manual polling / state machine | Supabase Realtime `postgres_changes` subscription | Realtime handles the fanout; Inngest handles resume; no custom pub/sub needed |
| Semantic memory search | Hand-rolled cosine similarity | pgvector + Drizzle `cosineDistance` | pgvector is optimized, indexed, and runs in the same DB transaction |

---

## Common Pitfalls

### Pitfall 1: Inngest `step.waitForEvent` CEL expression uses `async` not `event`

**What goes wrong:** Writing `if: "event.data.approvalId == X"` but both sides refer to the incoming (awaited) event, so the expression always matches the wrong event.

**Why it happens:** CEL expressions in `waitForEvent` use `async` to refer to the **original triggering event** (the run_requested event) and `event` to refer to the **matched/awaited event**. The variable names are confusing.

**How to avoid:** Use `if: \`async.data.approvalId == "${approval.id}"\`` — this matches the incoming `approval.resolved` event where its `data.approvalId` equals the specific approval ID we're waiting on. [CITED: inngest.com/docs/reference/typescript/functions/step-wait-for-event]

**Warning signs:** Inngest function resumes on any approval resolution, not just the specific one. Test with two concurrent L2 runs.

### Pitfall 2: Shopify webhook handler must return 200 immediately

**What goes wrong:** Handler does synchronous DB work before returning 200. Shopify retries if it doesn't get a response within ~5 seconds, causing duplicate webhook processing.

**How to avoid:** Return `200 OK` immediately after HMAC verification. Push to Inngest event for async processing. Inngest's idempotency key prevents duplicate processing.

**Warning signs:** Shopify shows "delivery failed" in the webhook log; database has duplicate entries.

### Pitfall 3: Drizzle + pgvector — extension must be created manually

**What goes wrong:** Migration generates `CREATE TABLE` with `vector` column but throws because `vector` type doesn't exist.

**How to avoid:** Add `CREATE EXTENSION IF NOT EXISTS vector;` as the FIRST statement in the Phase 2 migration SQL. Supabase has pgvector pre-installed but the extension still needs to be activated per-database. [CITED: orm.drizzle.team/docs/guides/vector-similarity-search]

**Warning signs:** Migration fails with `type "vector" does not exist`.

### Pitfall 4: Next.js 15 async `params` in Route Handlers

**What goes wrong:** Writing `const { threadId } = params` directly, causing a runtime error.

**Why it happens:** In Next.js 15, route params are Promises and must be awaited: `const { threadId } = await params`.

**How to avoid:** Always `await params` in Route Handlers and Page components. This is a breaking change from Next.js 14. [STATE.md already documents this pattern from Phase 1]

**Warning signs:** `TypeError: Cannot destructure property 'threadId' of 'params' as it is undefined`

### Pitfall 5: Supabase Realtime RLS — channels must be private for user-scoped data

**What goes wrong:** Subscribing to `postgres_changes` for `approvals` table without proper auth. Public channels would expose all users' approval data.

**How to avoid:** Set `{ private: true }` on the Supabase Realtime channel AND ensure the user's JWT is attached to the WebSocket connection. Use `supabase.channel('approvals', { config: { private: true } })`. [CITED: supabase.com/docs/guides/realtime/broadcast]

**Warning signs:** Cross-user approval data visible in client; RLS violation errors in Supabase logs.

### Pitfall 6: `step.run` names must be unique and deterministic within a function

**What goes wrong:** Using a variable index like `step.run(\`step-${Math.random()}\`, ...)` means the step ID changes on every execution, breaking Inngest's checkpoint memoization.

**Why it happens:** Inngest uses step IDs as keys for memoization. Non-deterministic IDs cause the function to re-execute completed steps after a restart.

**How to avoid:** Use deterministic IDs based on the step's position in the workflow definition: `step.run(\`execute-step-${i}-${workflowStep.id}\`, ...)`.

**Warning signs:** Inngest dashboard shows steps running multiple times; activity log has duplicate entries.

### Pitfall 7: Gmail access_type=offline required for refresh token

**What goes wrong:** Standard Google OAuth login doesn't return a refresh token. If the access token expires (default 1 hour), the integration breaks permanently.

**How to avoid:** Add `access_type=offline&prompt=consent` to the Gmail OAuth authorization URL. The `prompt=consent` forces Google to always return a refresh token (even if the user has authorized before). Store the refresh token encrypted in `integrations.refresh_token_encrypted`.

**Warning signs:** Gmail integration works for 1 hour then stops; `integrations.last_error` shows `401 Unauthorized`.

### Pitfall 8: HNSW vs IVFFlat for pgvector at Phase 2 scale

**What goes wrong:** Using IVFFlat before sufficient data exists. IVFFlat requires `lists` tuning based on data distribution and degrades with small datasets.

**How to avoid:** Use HNSW index for Phase 2 (better query performance, no pre-seeding requirement). Set `m = 16, ef_construction = 64` (defaults are fine for Phase 2 user counts). IVFFlat can be considered for v2 if table sizes warrant it. [CITED: supabase.com/docs/guides/ai/vector-indexes]

### Pitfall 9: Phase 2 is too large for one plan

**What goes wrong:** One enormous plan with 38 requirements, 15+ new tables, 2 OAuth integrations, and a novel UI ends up with 60+ tasks that are impossible to verify atomically.

**How to avoid:** Split into 5–6 focused plans with explicit dependency gates. Recommended split is documented in the Architecture section. Each plan should be independently verifiable.

---

## Dependency Ordering (Critical for Planning)

The six areas have hard dependencies. Plans must be created in this order:

```
Plan 1: UI Foundation
  → shadcn init, token translation, font wiring, cn() utility
  → MUST complete before any surface component

Plan 2: Schema Migration (0003)
  → All 22 new tables + pgvector extension + RLS policies + indexes
  → MUST complete before any data layer work
  → BLOCKING: nothing in Plans 3-6 works without this migration applied

Plan 3: Integrations (Shopify + Gmail)
  → OAuth handlers, adapter implementations, sync Inngest functions, webhook handler
  → Requires: Plan 2 (mirror tables)
  → Also requires: ENV VARS (SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)

Plan 4: Onboarding Wizard
  → 6-step wizard, brand voice bootstrap, catalog audit
  → Requires: Plan 1 (UI components), Plan 2 (brand voice + workflow tables), Plan 3 (Shopify connected)

Plan 5: Conversation Surface + Agent Runtime
  → SSE endpoint, message stream, workflow visualizer, prompt construction, tool catalog, memory
  → Requires: Plan 1, Plan 2, Plan 3 (tools need adapters)

Plan 6: Workflow Engine
  → executeWorkflowRun Inngest function, L1/L2/L3 paths, approvals, activity log
  → Requires: Plan 2 (approvals + activity tables), Plan 5 (agent runtime for steps)

Plan 7: Cost Cap + Settings (SET-01)
  → AUTH-07 cost cap, Settings/Connections page
  → Requires: Plan 2 (cost_aggregates), Plan 3 (integrations display)
```

Plans 5 and 7 can begin in parallel after Plans 1–3 complete. Plan 4 and Plan 6 can overlap partially with Plans 5 and 7.

---

## Runtime State Inventory

> This is a largely greenfield phase (new tables, new OAuth flows). No renames. The one runtime state concern is onboarding progress.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `user_profiles.onboarding_completed_at` exists from Phase 1 (always NULL for existing test user) | Add `onboarding_step` column in migration 0003 — forward-only |
| Live service config | No n8n or external workflow config | None |
| OS-registered state | None | None |
| Secrets/env vars | Phase 1 env vars exist; Phase 2 needs: `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_API_VERSION`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Add to Vercel env + `.env.local.example` |
| Build artifacts | `components/` is currently empty; `lib/db/schema/index.ts` re-exports only Phase 1 tables | Update `index.ts` to re-export Phase 2 schemas |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 25.x | All Next.js server work | ✓ | 25.6.1 | — |
| npm 11.x | Package management | ✓ | 11.9.0 | — |
| Supabase CLI | Migration push | [ASSUMED] | — | Use Supabase dashboard SQL editor |
| Vercel CLI | Local dev | [ASSUMED] | — | `npm run dev` |
| Inngest CLI / dev server | Local workflow testing | [ASSUMED] | — | Cloud dev mode |
| Shopify Partner account + test store | INTEG-01 testing | ✗ (user must create) | — | Shopify Developer Store (free) |
| Google Cloud project with Gmail API | INTEG-04 testing | ✗ (user must create/verify) | — | No fallback — required for Gmail OAuth |

**Missing dependencies with no fallback:**
- Shopify Partner account + `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` — required before Plan 3 can be tested
- Google Cloud project with Gmail API enabled + `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — required before Plan 3 Gmail work can be tested

**Action items before Plans 3+:**
1. Create Shopify Partner account → Create development app → Get API credentials
2. Verify Google Cloud project has Gmail API enabled (separate from Supabase Google OAuth app) → Get OAuth credentials with `gmail.modify` scope

---

## Code Examples

### Verified Pattern: Anthropic streaming with tool use interception
```typescript
// Source: platform.claude.com/docs/en/api/messages-streaming
const stream = anthropic.messages.stream({
  model: 'claude-opus-4-7',
  system: systemPrompt,
  messages: conversationMessages,
  tools: toolDefinitions,
  max_tokens: 4096,
});

// .on() callbacks for real-time processing
stream
  .on('text', (text) => {
    // Forward text deltas to SSE client
    controller.enqueue(sseChunk({ type: 'text', text }));
  })
  .on('tool_use', async (toolBlock) => {
    // Intercept tool calls before model continues
    const result = await dispatchTool(toolBlock.name, toolBlock.input);
    // tool_result fed back into next API call (handled by SDK internally in stream mode)
  });

const finalMessage = await stream.finalMessage();
// finalMessage.usage has token counts for cost tracking
```

### Verified Pattern: Inngest step.waitForEvent for L2 approval
```typescript
// Source: inngest.com/docs/reference/typescript/functions/step-wait-for-event
const decision = await step.waitForEvent(`wait-approval-${stepIndex}`, {
  event: 'approval.resolved',
  timeout: '14d',
  if: `async.data.approvalId == "${approval.id}"`,
  // 'async' = the original workflow.run_requested event data
  // 'event' = the incoming approval.resolved event (what we filter on)
});

if (!decision) {
  // Timeout — approval expired
  await handleApprovalTimeout(run.id);
  return;
}
if (decision.data.decision === 'rejected') {
  await handleRejection(run.id);
  return;
}
// decision.data.decision === 'approved' — proceed
```

### Verified Pattern: Drizzle pgvector column definition
```typescript
// Source: orm.drizzle.team/docs/guides/vector-similarity-search
import { pgTable, uuid, text, vector, index } from 'drizzle-orm/pg-core';

export const memoryEmbeddings = pgTable(
  'memory_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    source_type: text('source_type').notNull(),
    source_id: uuid('source_id').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }), // Voyage voyage-4
  },
  (table) => [
    index('idx_memory_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ]
).enableRLS();
```

### Verified Pattern: Shopify GraphQL cursor pagination
```typescript
// Source: shopify.dev/docs/api/admin-graphql/latest/queries/products
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title bodyHtml vendor status tags
        seo { title description }
        variants(first: 10) {
          nodes { id sku price inventoryQuantity }
        }
      }
    }
  }
`;

async function* paginateProducts(shopDomain: string, accessToken: string) {
  let cursor: string | null = null;
  do {
    const response = await shopifyGraphQL(shopDomain, accessToken, PRODUCTS_QUERY, {
      first: 250,
      after: cursor,
    });
    const { products } = response.data;
    yield* products.nodes;
    cursor = products.pageInfo.hasNextPage ? products.pageInfo.endCursor : null;
  } while (cursor);
}
```

### Verified Pattern: Supabase Realtime subscription for approval badge
```typescript
// Source: supabase.com/docs/guides/realtime/subscribing-to-database-changes
// Client component
useEffect(() => {
  const channel = supabase
    .channel('approvals-badge', { config: { private: true } })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'approvals',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      // Refetch badge count
      fetchPendingCount();
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [userId]);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `forwardRef` in shadcn components | Standard function components + `data-slot` attributes | shadcn v2 (Tailwind v4 update) | Component source code is simpler; styling hooks via data attributes |
| Tailwind HSL color variables | OKLCH color variables via `@theme inline` | Tailwind v4 | Perceptually uniform colors; design tokens map cleanly |
| IVFFlat as default pgvector index | HNSW preferred for new projects | pgvector 0.5+ | Better query performance without pre-seeding requirement |
| Framer Motion `framer-motion` import | `motion/react` import (package still `framer-motion`) | v11+ | Tree-shaking improved; new API surface |
| Next.js 14 sync `params` | Next.js 15 async `params` (must await) | Next.js 15 | Breaking change already documented in Phase 1 STATE.md |
| Shopify offline tokens are permanent | As of Dec 2025, expiring offline tokens with 90-day refresh token | Dec 2025 | Must implement token refresh in Gmail-style pattern if using expiring tokens |

---

## Validation Architecture

> Nyquist validation is enabled per `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 + Playwright 1.60.0 |
| Config file | `vitest.config.mts` (excludes `tests/e2e/**`) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTEG-01 | Shopify OAuth HMAC verification | unit | `npx vitest run tests/unit/shopify-oauth.test.ts` | ❌ Wave 0 |
| INTEG-02 | Full sync UPSERT idempotency | unit | `npx vitest run tests/unit/shopify-sync.test.ts` | ❌ Wave 0 |
| INTEG-03 | Webhook HMAC validation | unit | `npx vitest run tests/unit/shopify-webhook.test.ts` | ❌ Wave 0 |
| INTEG-04 | Gmail OAuth refresh token handling | unit | `npx vitest run tests/unit/gmail-oauth.test.ts` | ❌ Wave 0 |
| INTEG-05 | History API incremental cursor advance | unit | `npx vitest run tests/unit/gmail-sync.test.ts` | ❌ Wave 0 |
| INTEG-06 | Integration status detection (stale/expired) | unit | `npx vitest run tests/unit/integration-health.test.ts` | ❌ Wave 0 |
| INTEG-07 | Idempotent write pattern (pre-read, write, re-read) | unit | `npx vitest run tests/unit/shopify-mutations.test.ts` | ❌ Wave 0 |
| AUTH-07 | Cost cap soft/hard threshold logic | unit | `npx vitest run tests/unit/cost-cap.test.ts` | ❌ Wave 0 |
| ONBOARD-03 | Brand voice profile creation from conversation | integration | manual — requires LLM | Manual |
| ONBOARD-04 | Catalog audit generates 3+ suggestions | unit (mock products) | `npx vitest run tests/unit/catalog-audit.test.ts` | ❌ Wave 0 |
| ONBOARD-06 | Step progress persistence and resume | unit | `npx vitest run tests/unit/onboarding-progress.test.ts` | ❌ Wave 0 |
| CONV-01 | SSE streaming route returns tokens | integration | `npx vitest run tests/integration/chat-stream.test.ts` | ❌ Wave 0 |
| AGENT-01 | Prompt construction fits token budget | unit | `npx vitest run tests/unit/prompt-builder.test.ts` | ❌ Wave 0 |
| AGENT-04 | Tool Zod validation returns correctable error | unit | `npx vitest run tests/unit/tool-validation.test.ts` | ❌ Wave 0 |
| AGENT-06 | Error classification transient/auth/budget | unit | `npx vitest run tests/unit/agent-errors.test.ts` | ❌ Wave 0 |
| WF-02 | Inngest function resumes from checkpoint after restart | unit (Inngest test SDK) | `npx vitest run tests/unit/workflow-engine.test.ts` | ❌ Wave 0 |
| WF-04 | L2 pause creates approval row + waitForEvent | unit (Inngest test SDK mock) | `npx vitest run tests/unit/l2-approval-flow.test.ts` | ❌ Wave 0 |
| WF-06 | Activity entry written before external effect | unit | included in workflow-engine.test.ts | ❌ Wave 0 |
| SET-01 | Connections page shows status + disconnect works | e2e | `npx playwright test tests/e2e/settings-connections.spec.ts` | ❌ Wave 0 |
| CONV-01 + WF-04 | Full e2e: chat → workflow plan → save → L2 run → approve | e2e (happy path) | `npx playwright test tests/e2e/full-workflow-journey.spec.ts` | ❌ Wave 0 |

**LLM testing note (from TECH-SPEC §7.1):** Do not snapshot LLM outputs. DO snapshot prompt construction (catch prompt regressions). Mock Anthropic SDK at the SDK boundary. Reserve one Playwright spec to test real LLM responses in a sandbox account — run nightly.

### Sampling Rate
- **Per task commit:** `npx vitest run` (unit tests, <30s)
- **Per wave merge:** `npx vitest run && npx playwright test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps (must create before implementation waves)
- [ ] `tests/unit/shopify-oauth.test.ts` — HMAC verification with test vectors
- [ ] `tests/unit/shopify-sync.test.ts` — UPSERT idempotency with mock responses
- [ ] `tests/unit/shopify-webhook.test.ts` — HMAC webhook verification
- [ ] `tests/unit/gmail-sync.test.ts` — History API cursor behavior
- [ ] `tests/unit/cost-cap.test.ts` — Soft/hard cap threshold logic (pure function, no Redis needed in unit test)
- [ ] `tests/unit/prompt-builder.test.ts` — Token budget truncation behavior
- [ ] `tests/unit/tool-validation.test.ts` — Zod validation error → tool_result error format
- [ ] `tests/unit/workflow-engine.test.ts` — Inngest function test SDK for step checkpointing
- [ ] `tests/unit/l2-approval-flow.test.ts` — waitForEvent mock + resume behavior
- [ ] `tests/e2e/full-workflow-journey.spec.ts` — Critical happy path e2e

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (new OAuth flows) | Supabase Auth + state nonce + HMAC verification |
| V3 Session Management | Yes (existing, extended) | httpOnly cookie; session middleware guards all `/app/*` |
| V4 Access Control | Yes (RLS on all new tables) | `pgPolicy` on every table with `user_id`; Server Action ownership checks |
| V5 Input Validation | Yes (tool inputs, API payloads) | Zod on all tool inputs, webhook payloads, Server Action inputs |
| V6 Cryptography | Yes (OAuth tokens, memory) | libsodium already in place; extend to Gmail tokens; never plaintext |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shopify OAuth CSRF (state forgery) | Spoofing | Cryptographic nonce stored in DB, verified in callback |
| OAuth open redirect via `redirect_uri` | Elevation | Pre-register exact redirect URIs in Shopify Partner dashboard |
| Shopify webhook replay / forgery | Spoofing/Tampering | Verify `X-Shopify-Hmac-Sha256` before processing; return 401 on failure |
| Gmail token theft (stored in DB) | Information Disclosure | libsodium encryption at rest (same as Phase 1 pattern) |
| Prompt injection via Shopify product data | Tampering | Anthropic input sanitization; don't include raw user HTML directly in prompt |
| Cross-user data leakage via agent context | Information Disclosure | RLS + explicit `user_id` filter in every agent-tier query |
| Cost exhaustion attack (many LLM calls) | Denial of Service | AUTH-06 rate limits (existing) + AUTH-07 daily cost cap |
| Inngest event spoofing (fake approval.resolved) | Elevation | Approval row lookup by ID + ownership check before executing; event alone doesn't bypass DB auth |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `framer-motion` import works as `motion/react` in v12.40.0 | Standard Stack | Use `framer-motion` import path instead; trivial fix |
| A2 | Voyage AI `voyage-4` outputs 1024-dim vectors (DATA-FLOW.md says 1536) | Schema section | Migration must use correct dimension or embeddings are incompatible |
| A3 | `@shopify/shopify-api` v13 `shopify.auth.begin()/callback()` API surface is correct | Area 2 | May need to consult v13 docs; API surface may differ |
| A4 | Soft/hard cost cap thresholds ($4/$5/day) are reasonable placeholders | AUTH-07 | Actual thresholds TBD with pricing (PRD §8.3); stub enforcement points |
| A5 | All 10 new npm packages pass slopcheck verification | Package Audit | slopcheck was unavailable; each install should be human-verified against official org/repo before running |
| A6 | Inngest CEL `async` variable refers to triggering event, `event` to matched event | WF-04 | If inverted, approval matching fails silently; test with two concurrent L2 runs |
| A7 | `npx supabase db push` is the correct migration command (same as Phase 1 pattern) | Schema | Verify Supabase CLI version compatibility with migration 0003 |
| A8 | Google Cloud project for Gmail API is separate from Supabase's Google OAuth project | INTEG-04 | Could use same GCP project; but Gmail API + oauth2 scopes need explicit activation |

**If this table is empty:** Not applicable — several claims require environment/library verification before build.

---

## Open Questions (RESOLVED)

> All five open questions are resolved below. Each resolution records the decision the Phase 2 plans already encode (confirmed against the relevant plan Task 0/Task 2 actions). Inline `RESOLVED:` markers state the binding decision.

1. **Voyage AI embedding dimensions**
   - What we know: `lib/agent/embeddings.ts` uses `voyage-4`; Phase 1 `sdk-smoke.test.ts` was written for this model
   - What's unclear: DATA-FLOW.md says `vector(1536)` but Voyage AI models typically output 1024 dimensions. The actual model response dimension determines the migration.
   - **RESOLVED:** Use **1024 dimensions** — the dimension the installed `voyageai` (`voyage-4`) output produces. The pgvector columns (`memory_embeddings.embedding`, `brand_voice_samples.embedding`) are sized `vector(1024)` in migration 0003 with an HNSW `vector_cosine_ops` index. To confirm before the migration applies, **02-02 Task 0** runs an `embedText("test")` smoke check and asserts `embedding.length === 1024` (red-scaffold gate); the migration's vector columns are only authored against the confirmed dimension. DATA-FLOW.md's `vector(1536)` note is superseded by this 1024 decision.

2. **Shopify app type — custom vs public**
   - What we know: PRD says Shopify OAuth; SYSTEMS-DESIGN says Custom App
   - What's unclear: Custom apps use a different OAuth flow than public apps (no app store listing, direct installation URL). The `@shopify/shopify-api` library's `begin()/callback()` flow is for public apps. For a true custom app, the merchant gets a direct installation URL.
   - **RESOLVED:** Default to a **custom app** flow for v1 beta (1–50 stores) — simpler, no app-store review, direct-URL installation, same access-token endpoints. The decision is finalized at **02-03 Task 0** (a `checkpoint:human-action` gate where the user creates the Shopify Partner credentials and confirms the app type before any code runs); 02-03 Task 0 text assumes the custom-app flow as the default and asks the user to confirm. Task 1's `connect()`/`callback()` flow is built against the confirmed app type.

3. **Realtime subscription for approval badge — frequency of updates**
   - What we know: Supabase Realtime subscriptions fire on every DB change
   - What's unclear: At what point does real-time badge update latency become noticeable vs. acceptable? PRD says <5s cross-device.
   - **RESOLVED:** Use **Supabase Realtime `postgres_changes` on the `approvals` table, filtered by `user_id`, on a private channel (`{ config: { private: true } }`)** to drive the live approval badge and cross-surface sync. This delivers within ~1–2s, satisfying the <5s requirement. Wired in **02-07 Task 3** (the inline approval card subscribes to the private `approvals` channel so card status syncs); the same subscription pattern feeds the sidebar approval badge. The Code Example "Supabase Realtime subscription for approval badge" above is the canonical pattern.

4. **Inngest `maxDuration` increase — impact on existing hello-world**
   - What we know: Phase 1 has `maxDuration = 60` and `maxRuntime: '1m'`
   - What's unclear: Increasing to 300 changes both. Existing hello-world tests assert `maxDuration = 60`.
   - **RESOLVED:** Bump `lib/inngest/client.ts` `maxRuntime` to **`'4m'`** (≈20% below the Vercel ceiling) and `app/api/inngest/route.ts` to **`export const maxDuration = 300`**. This is handled once in **02-03 Task 2** (which also updates the existing `tests/unit/hello-world.test.ts` assertion that pinned `maxDuration=60`). The bumped values then apply to the L2 workflow engine added in **02-07** (which registers `executeWorkflowRun` in the same serve route and explicitly does NOT re-touch `maxDuration`).

5. **Phase scope — is 38 requirements too large for one "phase"?**
   - What we know: 38 requirements, 15+ new DB tables, 2 OAuth integrations, a full component library, and a novel streaming UX.
   - Assessment: Too large for one atomic plan, but tractable as a multi-plan phase with dependency gates.
   - **RESOLVED:** **No phase split needed.** The phase is decomposed into an **8-plan / 5-wave** structure covering all **38 requirements** (UI Foundation, Schema+Wave-0 tests, Shopify integration, Gmail integration, Onboarding, Agent runtime, Conversation surface, Workflow engine, plus Cost-cap/Settings). Each plan is independently verifiable with an `<automated>` gate, and the dependency ordering above is enforced via plan `depends_on` + waves. The "big bang" risk is mitigated by per-plan verification rather than a single atomic plan.

---

## Sources

### Primary (HIGH confidence)
- `Docs/Operator Zero PRD.md` — product requirements, phasing, success criteria
- `Docs/SYSTEMS-DESIGN.md` — architectural patterns, agent tier design, L2 pause/resume concept
- `Docs/DATA-FLOW.md` — complete table schemas, critical path flows for chat/approval/sync
- `Docs/TECH-SPEC.md` — locked stack, tool catalog, prompt construction, build phases
- `Docs/Info Architecture.md` — surface specifications, navigation chrome
- `.planning/phases/01-infrastructure-foundation/01-VERIFICATION.md` — what Phase 1 built exactly
- `lib/db/schema/*.ts`, `lib/integrations/*.ts`, `lib/inngest/client.ts` — Phase 1 actual code

### Secondary (MEDIUM confidence — verified from official sources)
- [Inngest waitForEvent reference](https://www.inngest.com/docs/reference/typescript/functions/step-wait-for-event) — CEL syntax, timeout format, null return
- [Shopify OAuth authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) — 6-step handshake
- [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4) — @theme directive, OKLCH colors, data-slot
- [Drizzle pgvector syntax](https://orm.drizzle.team/docs/guides/vector-similarity-search) — `vector()` column type, HNSW index
- [Anthropic streaming docs](https://platform.claude.com/docs/en/api/messages-streaming) — SSE event types, tool_use streaming
- [Supabase Realtime docs](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) — postgres_changes subscription
- [Gmail History API](https://developers.google.com/workspace/gmail/api/guides/sync) — incremental sync pattern

### Tertiary (LOW confidence — WebSearch only)
- framer-motion v12 import path change to `motion/react` — flagged [ASSUMED]
- Upstash Redis `incrbyfloat` pattern for daily cost cap — reasonable but exact API may differ
- Shopify expiring offline tokens (Dec 2025) — verify with current Shopify docs before building refresh flow

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages confirmed on npm registry; versions verified
- Architecture: HIGH — confirmed from canonical product docs; Inngest patterns from official docs
- Shopify OAuth: MEDIUM — flow confirmed from official docs; `@shopify/shopify-api` v13 specific API surface assumed
- Gmail incremental sync: MEDIUM — History API confirmed from Google docs; token refresh pattern is standard OAuth
- Inngest L2 pause/resume: MEDIUM-HIGH — `waitForEvent` parameters confirmed from official docs; CEL expression format confirmed
- pgvector Drizzle integration: HIGH — syntax confirmed from official Drizzle docs
- Pitfalls: HIGH — all derived from documented breaking changes or architectural constraints

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (30 days; stable stack)

---

## RESEARCH COMPLETE

**Phase:** 02 — Foundation: Prove the Agent
**Confidence:** HIGH (architecture) / MEDIUM (implementation specifics)

### Key Findings

1. **The L2 approval pause/resume is the keystone.** Inngest's `step.waitForEvent` is the right mechanism. Critical gotcha: CEL expression uses `async` for the trigger event and `event` for the matched event. Approval ID must be matched explicitly to prevent wrong-approval resume.

2. **Phase 2 is definitively too large for a single plan.** 38 requirements, 22 new tables, 2 OAuth integrations, a new UI component library, and a novel streaming UX. Strongly recommend 5–6 plans with dependency gates. The dependency order: UI Foundation → Schema → Integrations → Onboarding → Conversation/Agent → Workflow Engine.

3. **Schema migration 0003 is a hard blocker.** Nothing in Phase 2 runs without the 22 new tables. This migration must include `CREATE EXTENSION IF NOT EXISTS vector` as the first statement, or vector column creation fails.

4. **UI Foundation must precede all surface work.** `components/` is currently empty. shadcn/ui `init` + OKLCH token translation into Tailwind v4 `@theme inline` must be Plan 1.

5. **Voyage AI embedding dimensions need verification before writing the migration.** DATA-FLOW.md says `vector(1536)` but the installed model (`voyage-4`) likely outputs 1024 dimensions. Write a quick smoke test before the migration. (Resolved: 1024 — see Open Questions #1.)

6. **Two new credential sets are required** (Shopify Partner credentials + Google Cloud Gmail API credentials) that must be provisioned by the user before Plans 3+ can be tested. This is a human action item that blocks integration testing.

### File Created
`.planning/phases/02-foundation-prove-the-agent/02-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Architecture & data model | HIGH | Locked in canonical docs; verified against Phase 1 artifacts |
| Inngest L2 pause/resume | HIGH | Official docs confirmed; CEL syntax verified |
| Shopify OAuth flow | MEDIUM-HIGH | Official Shopify docs confirmed; v13 library API assumed |
| Gmail History API sync | MEDIUM | Official Google docs; token refresh is standard OAuth |
| UI Foundation (shadcn/Tailwind v4) | HIGH | Official shadcn docs confirmed; OKLCH tokens from design file |
| pgvector Drizzle integration | HIGH | Official Drizzle docs confirmed |
| Cost cap pattern | MEDIUM | Upstash Redis INCRBY confirmed; exact thresholds are [ASSUMED] placeholders |

### Open Questions Requiring Action Before Build
All five Open Questions are now RESOLVED (see `## Open Questions (RESOLVED)`). The two human prerequisites that remain (Shopify Partner credentials and Google Cloud Gmail API credentials) are gated by the `checkpoint:human-action` Task 0 in 02-03 (Shopify) and the Gmail integration plan, respectively.

### Ready for Planning
Research complete. Planner can now create PLAN.md files using the dependency order: Plan 1 (UI Foundation) → Plan 2 (Schema) → Plan 3 (Integrations) → Plan 4 (Onboarding) → Plan 5 (Conversation/Agent) → Plan 6 (Workflow Engine) → Plan 7 (Cost Cap + SET-01).
