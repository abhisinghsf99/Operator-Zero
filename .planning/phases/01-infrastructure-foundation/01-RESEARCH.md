# Phase 1: Infrastructure Foundation - Research

**Researched:** 2026-05-21
**Domain:** Next.js 15 + Supabase Auth + Drizzle ORM + Inngest + Anthropic SDK + Voyage AI + Sentry + Axiom + CI
**Confidence:** HIGH (stack locked; most findings verified via official docs or npm registry)

---

## Summary

Phase 1 is the Walking Skeleton: no user-facing UI surfaces except a single placeholder protected page, but every production rail must exist and be verifiable. The locked stack (Next.js 15 App Router / Supabase / Inngest / Anthropic / Voyage AI / Drizzle / Sentry / Axiom) is well-integrated and each component has clear, current documentation.

The trickiest correctness area is Supabase Auth with Next.js 15 App Router. The `@supabase/ssr` package (v0.10.3, May 2026) has switched from `getSession()` to `getClaims()` for server-side JWT validation — this is a security-critical change that contradicts older tutorials and some of the existing TECH-SPEC examples. The planner must use `getClaims()` everywhere in server code, never `getSession()`.

The second important finding is Drizzle vs Supabase migrations: the two systems have separate migration folders (`drizzle/` vs `supabase/migrations/`). The recommended reconciliation for this project is **generate with Drizzle Kit, copy SQL into `supabase/migrations/`, apply via Supabase CLI** — keeping Supabase CLI as the single source of truth for what runs against the database, and Drizzle as the schema-definition source of truth. This matches the DATA-FLOW.md statement that migrations live in `supabase/migrations/`.

The third key finding is embeddings: DATA-FLOW.md hardcodes `vector(1536)` in schema, but the current Voyage AI model lineup defaults to **1024 dimensions**. The `voyage-4` family (released Jan 2026) and `voyage-3` both default to 1024 dims. This is a schema flag the planner must address before schema is locked in — either change the schema to `vector(1024)` or explicitly request 2048 dimensions from Voyage at call time. Defaulting to 1024 and updating the schema is the right call.

**Primary recommendation:** Follow the order in TECH-SPEC §8.1 exactly — project setup → Sentry/Axiom → Inngest → auth → schema/migrations/RLS → encrypted tokens → SDK wiring → adapter skeleton → CI. The Walking Skeleton verification (placeholder `/app/home` page + encrypted token round-trip + Inngest hello-world + SDK smoke test) proves every rail before Phase 2 touches any of them.

---

## Project Constraints (from CLAUDE.md)

- **Tech stack is locked:** Next.js 15 (App Router, React 19) + TypeScript strict on Vercel; Supabase (Postgres 16, pgvector, Auth, Realtime, Storage) Pro tier; Inngest; Anthropic Claude; Voyage AI embeddings; Drizzle ORM; Zod for all external-input validation. Do not suggest alternatives.
- **UI:** Tailwind + shadcn/ui (copied in, not a dep) + Radix + Lucide + Framer Motion + Sonner.
- **Multi-tenant from day one:** every user-data table carries `user_id`, every query filters by it, RLS enforces it.
- **Security baseline:** encrypted-at-rest tokens, RLS, per-user rate limits + cost caps, HMAC on webhooks.
- **Accessibility baseline:** WCAG 2.1 AA (enforced throughout, not just in Phase 4).
- **Mobile parity is a build constraint**, not afterthought — responsive web from day one.
- **Observability is non-negotiable** — Activity log is first-class; every agent action emits a structured event.
- **GSD workflow enforcement:** Code edits must go through GSD commands (gsd-execute-phase); no direct repo edits outside a GSD workflow.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Vercel + Supabase projects provisioned; deploy on merge to main with PR preview deployments + CI tests | §CI / Preview Deploys section; GitHub Actions Vitest workflow pattern documented |
| INFRA-02 | Drizzle schema + forward-only migrations for users, user_profiles, integrations | §Drizzle ORM + Supabase section; exact schema from DATA-FLOW.md §2; Drizzle-Kit generate → copy to supabase/migrations pattern |
| INFRA-03 | RLS policies enforce per-user row access on every user-data table | §RLS section; standard `auth.uid() = user_id` policy patterns verified; Drizzle predefined Supabase roles |
| INFRA-04 | Integration tokens encrypted at rest (libsodium, key from Supabase secret) | §Encrypted Token Storage section; libsodium-wrappers 0.8.4 `crypto_secretbox` pattern |
| INFRA-05 | Inngest configured with local dev server + deploys with the app; a durable hello-world function fires and checkpoints | §Inngest section; serve route, step.run, concurrency pattern all documented |
| INFRA-06 | Anthropic SDK + Voyage embeddings wired and callable from the agent tier | §Anthropic + Voyage section; current model IDs confirmed, dimension flag identified |
| INFRA-07 | Integration adapter interface defined with skeleton Shopify + Gmail clients | §Integration Adapter Interface section; `IntegrationAdapter` interface from TECH-SPEC §6.3 |
| INFRA-08 | Sentry (client + server) + Axiom log aggregation capture errors and structured logs | §Observability section; Sentry Next.js wizard + Axiom Vercel log drain |
| AUTH-01 | User can sign up with email and password | §Supabase Auth section; Supabase email/password flow documented |
| AUTH-02 | User can sign in with Google OAuth | §Supabase Auth section; OAuth callback route pattern documented |
| AUTH-03 | Session persists via httpOnly cookie with 30-day rolling refresh; middleware guards /app/* routes | §Supabase Auth section; `@supabase/ssr` middleware pattern with `getClaims()` |
| AUTH-06 | Per-user rate limits on chat sends and concurrent workflow runs | §Rate Limiting section; Upstash Ratelimit + Inngest concurrency key pattern |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session management + route protection | Frontend Server (middleware) | Database (RLS) | Middleware validates JWT on every request; RLS is the safety net |
| Email/password + Google OAuth flows | Frontend Server (Route Handlers) | Supabase Auth (service) | OAuth callback must be a server Route Handler; Supabase handles identity storage |
| httpOnly session cookie | Frontend Server (middleware + Route Handlers) | — | Server sets cookies; client never touches them |
| Schema definition + migrations | Database (Supabase Postgres) | — | Supabase CLI manages what runs; Drizzle Kit generates SQL |
| RLS policy enforcement | Database (Supabase Postgres) | API / Backend (explicit filters) | Defense-in-depth: DB enforces, code also filters |
| Token encryption/decryption | API / Backend (lib/integrations) | — | Server-side only; plaintext never leaves this layer |
| Durable job execution (Inngest hello-world) | Agent tier (Inngest + Vercel functions) | — | Inngest owns durable state; Vercel function provides compute |
| LLM + embeddings wiring | Agent tier (lib/agent) | — | Called only server-side from Inngest functions or Route Handlers |
| Integration adapter interface | Agent tier (lib/integrations) | — | Skeleton lives server-side; called by agent tier only |
| Error capture (Sentry) | Browser + Frontend Server | — | Both runtimes need separate Sentry config files |
| Log aggregation (Axiom) | Frontend Server (Vercel log drain) | — | Vercel forwards all function logs; no code changes needed |
| Per-user rate limits | API / Backend (Route Handler middleware) | — | Checked in route handler before Anthropic calls |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.6 | App framework with App Router + RSC | Locked in stack |
| `@supabase/ssr` | 0.10.3 | Supabase client for SSR (cookie-based auth) | Only correct way to use Supabase in Next.js App Router |
| `@supabase/supabase-js` | 2.106.1 | Supabase client (browser + realtime) | Primary Supabase client |
| `drizzle-orm` | 0.45.2 | Type-safe ORM for Postgres | Locked in stack |
| `drizzle-kit` | 0.31.10 | Migration/schema tooling for Drizzle | Drizzle's companion CLI |
| `postgres` | 3.4.9 | Postgres driver for Drizzle (Node.js) | Required by Drizzle for server-side |
| `inngest` | 4.4.0 | Durable background functions | Locked in stack |
| `@anthropic-ai/sdk` | 0.97.1 | Anthropic Claude API client | Locked in stack |
| `voyageai` | 0.2.1 | Voyage AI embeddings client (TypeScript SDK) | Anthropic's recommended partner |
| `libsodium-wrappers` | 0.8.4 | Symmetric encryption for integration tokens | Locked in stack (INFRA-04) |
| `@sentry/nextjs` | 10.53.1 | Error tracking (client + server) | Locked in stack |
| `zod` | (latest 3.x) | Runtime validation of all external inputs | Locked in stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@upstash/ratelimit` | 2.0.8 | Per-user rate limiting | AUTH-06: chat send + workflow run limits |
| `@upstash/redis` | 1.38.0 | Redis client for Upstash (required by ratelimit) | Paired with ratelimit |
| `@vercel/analytics` | 2.0.1 | Basic web vitals | Always on Vercel deployment |
| `vitest` | 4.1.7 | Unit + component testing | INFRA-01: CI test runner |
| `@vitejs/plugin-react` | 6.0.2 | React support for Vitest | Required by Vitest in React projects |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@upstash/ratelimit` | Custom in-memory rate limiter | In-memory fails across serverless invocations; Upstash persists state in Redis. Use Upstash. |
| `libsodium-wrappers` | `tweetnacl` | tweetnacl is simpler but TECH-SPEC explicitly names libsodium. Use libsodium. |
| Drizzle-generate → copy to supabase/migrations | Drizzle native migrate | Drizzle native migrate bypasses Supabase CLI's migration tracking. Supabase CLI is safer for Supabase-hosted Postgres. |
| `voyage-4` (1024 dims) | `voyage-4-large` | voyage-4-large is highest quality but same dimension (1024). Either works; voyage-4 balances quality and cost. |

**Installation:**
```bash
npm install next @supabase/ssr @supabase/supabase-js drizzle-orm postgres inngest \
  @anthropic-ai/sdk voyageai libsodium-wrappers @sentry/nextjs zod \
  @upstash/ratelimit @upstash/redis @vercel/analytics
npm install -D drizzle-kit vitest @vitejs/plugin-react
```

**Version verification:** All versions above verified against npm registry on 2026-05-21. [VERIFIED: npm registry]

---

## Package Legitimacy Audit

> slopcheck was not available in this environment. All packages below are tagged [ASSUMED] for provenance; all were confirmed on the npm registry. The planner should verify against official documentation before install.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@supabase/ssr` | npm | 2.5 yrs (Sep 2023) | Very high | github.com/supabase/supabase | N/A | [ASSUMED] — widely used official Supabase package |
| `@supabase/supabase-js` | npm | 5+ yrs | Very high | github.com/supabase/supabase-js | N/A | [ASSUMED] — well-established |
| `drizzle-orm` | npm | 4+ yrs (Sep 2021) | High | github.com/drizzle-team/drizzle-orm | N/A | [ASSUMED] — established ORM |
| `drizzle-kit` | npm | 4+ yrs | High | github.com/drizzle-team/drizzle-orm | N/A | [ASSUMED] — same team as drizzle-orm |
| `postgres` | npm | 5+ yrs | High | github.com/porsager/postgres | N/A | [ASSUMED] — standard Node Postgres driver |
| `inngest` | npm | 3+ yrs (Apr 2022) | High | github.com/inngest/inngest | N/A | [ASSUMED] — established platform |
| `@anthropic-ai/sdk` | npm | 2.5 yrs (Jan 2023) | High | github.com/anthropics/anthropic-sdk-typescript | N/A | [ASSUMED] — official Anthropic SDK |
| `voyageai` | npm | ~1.5 yrs (Jul 2024) | Medium | github.com/voyage-ai/typescript-sdk | N/A | [ASSUMED] — official Voyage AI SDK |
| `libsodium-wrappers` | npm | 11+ yrs (Jan 2015) | High | github.com/jedisct1/libsodium.js | N/A | [ASSUMED] — long-lived WASM crypto |
| `@sentry/nextjs` | npm | 5+ yrs | Very high | github.com/getsentry/sentry-javascript | N/A | [ASSUMED] — official Sentry SDK |
| `@upstash/ratelimit` | npm | 3+ yrs | High | github.com/upstash/ratelimit-js | N/A | [ASSUMED] — official Upstash package |
| `@upstash/redis` | npm | 3+ yrs | High | github.com/upstash/upstash-redis | N/A | [ASSUMED] — official Upstash package |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none identified — all packages have established histories and official organization ownership.

*slopcheck was unavailable at research time. All packages above are tagged `[ASSUMED]` — the planner must gate each install behind a `checkpoint:human-verify` task before the first Wave 0 install step.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser / Mobile Web
        │  HTTPS
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Vercel Edge / Next.js App Router                                │
│                                                                  │
│  middleware.ts ──── getClaims() ──► redirect unauth /app/* →   │
│                                     (auth)/login                │
│                                                                  │
│  app/(auth)/login    ──► [Server Action] → signInWithOAuth()    │
│  app/(auth)/signup   ──► [Server Action] → signUpWithPassword() │
│  app/auth/callback   ──► [Route Handler] → exchangeCodeForSession│
│                                                                  │
│  app/(app)/layout.tsx [RSC, protected shell]                    │
│  app/(app)/home/page.tsx [placeholder, protected]               │
│                                                                  │
│  app/api/inngest/route.ts  ──► [Inngest serve()]                │
│  app/api/health/route.ts   ──► [smoke test endpoint]            │
└──────────────────────┬─────────────────────────────────────────┘
                       │ DB queries (Drizzle)
                       │ Auth (Supabase Auth)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase (Postgres 16 + pgvector + Auth + Realtime + Storage)  │
│                                                                  │
│  auth.users (managed by Supabase)                               │
│  user_profiles ──► RLS: auth.uid() = user_id                    │
│  integrations  ──► RLS: auth.uid() = user_id                    │
│                    access_token_encrypted (libsodium secretbox) │
└─────────────────────────────────────────────────────────────────┘
                       │
                       │ Events (inngest.send)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Agent Tier (Inngest functions, deployed as Vercel functions)   │
│                                                                  │
│  hello-world function                                           │
│    step.run("checkpoint-1") → { checkpointed: true }           │
│    step.run("checkpoint-2") → { finished: true }               │
│                                                                  │
│  lib/agent/anthropic.ts  ── smoke test ──► Anthropic API       │
│  lib/agent/embeddings.ts ── smoke test ──► Voyage AI API       │
│                                                                  │
│  lib/integrations/shopify/client.ts (skeleton)                  │
│  lib/integrations/gmail/client.ts   (skeleton)                  │
└─────────────────────────────────────────────────────────────────┘
                       │ Errors
                       ▼
           Sentry (client + server DSNs)
           Axiom (Vercel log drain → no code changes)
```

### Recommended Project Structure
```
operator-zero/
  app/
    (auth)/
      login/page.tsx
      signup/page.tsx
    (app)/
      layout.tsx         # auth-gated shell (RSC)
      home/page.tsx      # placeholder protected page
    api/
      inngest/route.ts   # Inngest serve() handler
      health/route.ts    # smoke-test endpoint
    auth/
      callback/route.ts  # OAuth code exchange
    global-error.tsx     # Sentry error boundary
  components/            # shared UI (Phase 1: minimal)
  lib/
    db/
      client.ts          # Drizzle instance (service-role for agent, anon for app)
      schema/
        users.ts         # user_profiles table
        integrations.ts  # integrations table
      index.ts           # re-exports schema + db clients
    auth/
      server.ts          # createServerClient (Server Components / Route Handlers)
      client.ts          # createBrowserClient
      middleware.ts      # updateSession() helper
    integrations/
      crypto.ts          # encrypt/decrypt token helpers (libsodium)
      shopify/
        client.ts        # skeleton Shopify adapter
      gmail/
        client.ts        # skeleton Gmail adapter
      adapter.ts         # IntegrationAdapter interface
    agent/
      anthropic.ts       # Anthropic SDK wiring
      embeddings.ts      # Voyage AI embeddings wiring
    inngest/
      client.ts          # Inngest client (export: inngest)
      functions/
        hello-world.ts   # durable hello-world function
  supabase/
    migrations/          # Drizzle-generated SQL, managed by Supabase CLI
    seed.sql
    config.toml
  tests/
    unit/
      crypto.test.ts     # encrypt/decrypt round-trip
      schema.test.ts     # table shape smoke tests
    e2e/                 # Playwright (Phase 2+)
  .github/
    workflows/
      ci.yml             # Vitest + type-check on PR
  middleware.ts           # route protection + session refresh
  inngest.config.ts
  next.config.ts
  drizzle.config.ts
  vitest.config.mts
  package.json
```

### Pattern 1: Supabase Auth Server Client (Server Components + Route Handlers)
**What:** Creates a Supabase client that reads/writes cookies from the Next.js request/response context.
**When to use:** Any Server Component, Route Handler, or Server Action that needs auth or DB access.

```typescript
// lib/auth/server.ts
// Source: https://supabase.com/docs/guides/auth/server-side/creating-a-client
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()  // await needed in Next.js 15

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cannot write cookies here; middleware handles refresh
          }
        },
      },
    }
  )
}
```

### Pattern 2: Middleware Session Refresh + Route Protection
**What:** Refreshes the Auth token on every request, enforces `/app/*` protection.
**When to use:** The single `middleware.ts` at the repo root.

```typescript
// middleware.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Use getClaims(), NOT getSession() — verifies JWT signature
  const { data: { claims } } = await supabase.auth.getClaims()

  // Protect /app/* routes
  if (!claims && request.nextUrl.pathname.startsWith('/app')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Critical:** `getClaims()` validates the JWT signature locally (fast, secure). `getSession()` is not safe for server-side authorization — it does not re-validate. [VERIFIED: https://supabase.com/docs/guides/auth/server-side/nextjs]

### Pattern 3: Drizzle Schema + Migration Workflow
**What:** Define schema in TypeScript with Drizzle, generate SQL, copy to Supabase migrations.
**When to use:** Every schema change in this project.

```typescript
// lib/db/schema/integrations.ts
// Source: DATA-FLOW.md §2.2
import { pgTable, uuid, text, timestamp, pgPolicy } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { sql } from 'drizzle-orm'

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull().references(() => /* auth.users */),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    access_token_encrypted: text('access_token_encrypted').notNull(),
    refresh_token_encrypted: text('refresh_token_encrypted'),
    scopes: text('scopes').array().notNull(),
    provider_account_id: text('provider_account_id'),
    last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
    last_error: text('last_error'),
    connected_at: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    pgPolicy('integrations_user_policy', {
      as: 'permissive',
      for: 'all',
      to: authenticatedRole,
      using: sql`auth.uid() = ${table.user_id}`,
    }),
  ]
).enableRLS()
```

```bash
# Migration workflow (run on every schema change):
npx drizzle-kit generate          # generates drizzle/<timestamp>/migration.sql
# copy generated SQL to: supabase/migrations/<timestamp>_description.sql
supabase db push                  # applies to remote; or: supabase db reset (local)
```

**Why copy, not use Drizzle migrate:** Supabase CLI tracks which migrations have run in a separate table. Using Drizzle's migrate pipeline separately would desync the tracking. [CITED: https://orm.drizzle.team/docs/migrations]

### Pattern 4: Encrypted Token Storage (libsodium secretbox)
**What:** Symmetric encryption of OAuth tokens using a server-side key. Plaintext never stored.
**When to use:** Writing to `integrations.access_token_encrypted` and reading back.

```typescript
// lib/integrations/crypto.ts
// Source: libsodium-wrappers docs; https://www.npmjs.com/package/libsodium-wrappers
import sodium from 'libsodium-wrappers'

// KEY must be 32 bytes from env var (base64-encoded)
// ENCRYPTION_KEY env var set in Supabase project secrets + Vercel env
const getKey = () => Buffer.from(process.env.ENCRYPTION_KEY!, 'base64')

export async function encryptToken(plaintext: string): Promise<string> {
  await sodium.ready
  const key = getKey()
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    key
  )
  // Store as: base64(nonce + ciphertext)
  const combined = new Uint8Array(nonce.length + ciphertext.length)
  combined.set(nonce, 0)
  combined.set(ciphertext, nonce.length)
  return Buffer.from(combined).toString('base64')
}

export async function decryptToken(encrypted: string): Promise<string> {
  await sodium.ready
  const key = getKey()
  const combined = Buffer.from(encrypted, 'base64')
  const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES)
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key)
  if (!plaintext) throw new Error('Decryption failed')
  return sodium.to_string(plaintext)
}
```

**Key generation:** `openssl rand -base64 32` → store in Vercel env (`ENCRYPTION_KEY`) and Supabase project secrets.

### Pattern 5: Inngest Durable Function with Concurrency Key
**What:** A durable function that checkpoints between steps; serialized per user.
**When to use:** All background jobs in the agent tier.

```typescript
// lib/inngest/client.ts
// Source: https://www.inngest.com/docs/getting-started/nextjs-quick-start
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'operator-zero',
  maxRuntime: '1m', // prevent Vercel function timeout mid-step
})

// lib/inngest/functions/hello-world.ts
export const helloWorld = inngest.createFunction(
  {
    id: 'hello-world',
    concurrency: {
      limit: 1,
      key: 'event.data.userId',  // per-user serialization
    },
    retries: 3,
  },
  { event: 'dev/hello.world' },
  async ({ event, step }) => {
    const result1 = await step.run('checkpoint-1', async () => {
      return { checkpointed: true, userId: event.data.userId }
    })

    const result2 = await step.run('checkpoint-2', async () => {
      return { finished: true, from: result1 }
    })

    return result2
  }
)

// app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { helloWorld } from '@/lib/inngest/functions/hello-world'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld],
})
export const maxDuration = 60  // must match inngest client maxRuntime
```

**Local dev:** Set `INNGEST_DEV=1` in `.env.local`. Run `inngest dev` in a separate terminal. Access Inngest UI at `http://localhost:8288`. [VERIFIED: https://www.inngest.com/docs/getting-started/nextjs-quick-start]

### Pattern 6: Anthropic SDK + Voyage Embeddings Wiring
**What:** Minimal wiring that proves the SDK is callable from the agent tier.
**When to use:** lib/agent/ module, called from Inngest functions or Route Handlers only.

```typescript
// lib/agent/anthropic.ts
// Source: https://platform.claude.com/docs/en/api/sdks/typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!, // server-only env var (no NEXT_PUBLIC_ prefix)
})

export async function smokeTestAnthropic(): Promise<boolean> {
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Ping' }],
  })
  return msg.content[0].type === 'text'
}

export { anthropic }

// lib/agent/embeddings.ts
// Source: https://platform.claude.com/docs/en/docs/build-with-claude/embeddings
import { VoyageAIClient } from 'voyageai'

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY!,
})

// DIMENSION NOTE: voyage-4 defaults to 1024. Schema must use vector(1024) NOT vector(1536).
// See § Assumptions Log A1.
export async function embedText(
  text: string,
  inputType: 'query' | 'document' = 'document'
): Promise<number[]> {
  const result = await voyage.embed({
    input: text,
    model: 'voyage-4',
    inputType,
  })
  return result.embeddings![0]
}
```

### Pattern 7: IntegrationAdapter Interface + Skeleton Clients
**What:** Typed interface for health-check + token refresh; skeleton clients that compile but perform no real ops.
**When to use:** Any new integration adapter in this project.

```typescript
// lib/integrations/adapter.ts
// Source: TECH-SPEC.md §6.3
export interface IntegrationAdapter {
  isHealthy(): Promise<boolean>
  refreshToken(): Promise<void>
}

// lib/integrations/shopify/client.ts
import type { IntegrationAdapter } from '../adapter'

export class ShopifyAdapter implements IntegrationAdapter {
  constructor(private readonly userId: string) {}

  async isHealthy(): Promise<boolean> {
    // TODO Phase 2: verify token by hitting Shopify API
    return false
  }

  async refreshToken(): Promise<void> {
    // TODO Phase 2: Shopify tokens are long-lived; this will handle 401 responses
    throw new Error('Not implemented until Phase 2')
  }
}

// lib/integrations/gmail/client.ts
import type { IntegrationAdapter } from '../adapter'

export class GmailAdapter implements IntegrationAdapter {
  constructor(private readonly userId: string) {}

  async isHealthy(): Promise<boolean> {
    return false
  }

  async refreshToken(): Promise<void> {
    throw new Error('Not implemented until Phase 2')
  }
}
```

### Pattern 8: Sentry Configuration for Next.js 15
**What:** Client + server error tracking, withSentryConfig wrapper.
**When to use:** Run `npx @sentry/wizard@latest -i nextjs` to generate boilerplate, then customize.

Key files generated by the wizard:
- `instrumentation-client.ts` — browser-side init (replaces legacy `sentry.client.config.ts`)
- `sentry.server.config.ts` — server-side init
- `sentry.edge.config.ts` — edge runtime init
- `instrumentation.ts` — detects runtime and loads appropriate config
- `app/global-error.tsx` — React error boundary for Sentry
- `next.config.ts` — wrapped with `withSentryConfig()`

[VERIFIED: https://docs.sentry.io/platforms/javascript/guides/nextjs/]

### Pattern 9: Per-User Rate Limiting
**What:** Upstash Redis-backed rate limiter applied at the Route Handler level.
**When to use:** `/api/chat/[threadId]/send` route (AUTH-06 — max 30 chat sends/min per user).

```typescript
// lib/rate-limit.ts (conceptual — exact implementation in plan)
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const chatRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, '1 m'), // 30 sends per minute
  analytics: true,
  prefix: 'oz:chat:ratelimit',
})
```

### Anti-Patterns to Avoid
- **Using `getSession()` in server code:** Always use `getClaims()` in middleware, Server Components, Route Handlers. `getSession()` does not re-validate the JWT and must never be used for authorization decisions. [VERIFIED: https://supabase.com/docs/guides/auth/server-side/nextjs]
- **Exposing `ANTHROPIC_API_KEY` or `ENCRYPTION_KEY` via `NEXT_PUBLIC_` env vars:** These must never have the `NEXT_PUBLIC_` prefix — they are server-only. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` should be public.
- **Using Drizzle's `migrate` command directly on Supabase:** Drizzle's migrate bypasses Supabase CLI's migration tracking. Generate with Drizzle, apply with Supabase CLI.
- **Using `vector(1536)` in schema with Voyage voyage-4:** voyage-4 returns 1024 dimensions by default. The DATA-FLOW.md schema uses `vector(1536)` — this must be corrected to `vector(1024)` before the migration is run. See Assumptions Log A1.
- **Inngest function without `maxDuration` on the route:** Without `export const maxDuration = 60` on the Inngest serve route, Vercel's default 10s timeout will kill functions mid-step. [CITED: https://www.inngest.com/docs/getting-started/nextjs-quick-start]
- **Running Drizzle Kit `push` in production:** `drizzle-kit push` is for local prototyping only. Never push directly against a production Supabase database.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management | Custom JWT cookies | `@supabase/ssr` createServerClient + middleware | Cookie rotation, secure defaults, httpOnly handled by Supabase |
| Token encryption | Raw crypto module calls | `libsodium-wrappers` `crypto_secretbox_easy` | Key scheduling, nonce generation, authenticated encryption — all error-prone to hand-roll |
| Rate limiting | In-memory counters | `@upstash/ratelimit` | In-memory resets per serverless invocation; Upstash persists across invocations |
| Durable execution + retries | Custom queue system | Inngest `step.run` | Checkpointing, retry policies, event correlation, local dev server — weeks of work otherwise |
| Error tracking | `console.error` pipeline | Sentry | Stack traces, user context, release tracking, source maps |
| Log aggregation | Manual log forwarding | Axiom Vercel log drain | One-click in Vercel dashboard; no code changes required |
| OAuth code exchange | Manual token exchange | Supabase Auth `exchangeCodeForSession` | Handles PKCE, token storage, cookie setting atomically |

**Key insight:** In every case where a library exists for an infrastructure concern, the custom solution gets the security or reliability edge cases wrong. The entire point of Phase 1 is to install these rails correctly, not to build infrastructure.

---

## Common Pitfalls

### Pitfall 1: `getSession()` vs `getClaims()` — Security Regression
**What goes wrong:** Developer uses `getSession()` in middleware or Server Components (as shown in many older tutorials and some of the current TECH-SPEC examples). An attacker who has an invalid/expired JWT can bypass authorization.
**Why it happens:** `getSession()` reads from cookie storage without re-validating the JWT signature. Looks correct in tests, passes in local dev.
**How to avoid:** Use `getClaims()` everywhere in server code. `getClaims()` validates the JWT against Supabase's published public keys on every call.
**Warning signs:** Any server-side auth check that calls `supabase.auth.getSession()`. Grep for `getSession` in server files — all occurrences are bugs.

### Pitfall 2: Drizzle migrations desyncing from Supabase CLI
**What goes wrong:** Developer runs `npx drizzle-kit migrate` against the Supabase database. Supabase CLI's `supabase_migrations.schema_migrations` table is not updated. Future `supabase db push` sees the schema as already applied (conflict) or tries to re-apply (error).
**Why it happens:** Two separate migration tracking tables.
**How to avoid:** Never run `drizzle-kit migrate` against a Supabase DB. Only `drizzle-kit generate` (to get SQL), then copy to `supabase/migrations/`, then `supabase db push`.
**Warning signs:** Migration files in `drizzle/` that don't have matching files in `supabase/migrations/`.

### Pitfall 3: Voyage embeddings dimension mismatch
**What goes wrong:** Schema creates `vector(1536)` columns (per DATA-FLOW.md). Code calls `voyage.embed()` with `voyage-4` model, which returns 1024-dim vectors. INSERT fails: "expected 1536 dimensions, got 1024."
**Why it happens:** DATA-FLOW.md was written before the Voyage 4 model family was released (Jan 2026). Voyage 3 code examples also use 1024 by default.
**How to avoid:** Use `vector(1024)` in all schema definitions. Confirm dimension in embeddings smoke test before any INSERT.
**Warning signs:** Embedding INSERT errors in logs; dimension mismatch in Postgres error messages.

### Pitfall 4: Inngest function timeout on Vercel without maxDuration
**What goes wrong:** Inngest `step.run` callbacks time out after Vercel's default 10-second function limit. Multi-step functions appear to start but never finish; Inngest dashboard shows step errors.
**Why it happens:** Each Inngest step runs within a Vercel serverless function invocation. Without `export const maxDuration = 60`, Vercel terminates the function.
**How to avoid:** Set `export const maxDuration = 60` on the Inngest serve route handler. Set `maxRuntime: '1m'` on the Inngest client.
**Warning signs:** Steps complete individually in dev but fail in preview/production with timeout errors.

### Pitfall 5: Missing `await cookies()` in Next.js 15 server client
**What goes wrong:** `createServerClient` is called with `cookies()` instead of `await cookies()`. TypeScript 5.x strict mode catches this, but if strict mode is partially configured, a type error is silently swallowed. Auth cookies are not read correctly.
**Why it happens:** In Next.js 15, `cookies()` returns a Promise. Older examples (Next.js 14) did not require `await`.
**How to avoid:** Always `await cookies()` before passing to `createServerClient`. Run `npx tsc --noEmit` as part of CI.
**Warning signs:** Session appears to be null even when user is logged in; no auth errors thrown.

### Pitfall 6: Google OAuth redirect URL misconfiguration
**What goes wrong:** OAuth callback fails in Vercel preview deployments because the redirect URL is not whitelisted. Supabase returns an error: "redirect_uri not in allowed list."
**Why it happens:** Vercel preview URLs are dynamic (`*-project.vercel.app`). Supabase Redirect URLs list must include a wildcard pattern.
**How to avoid:** In Supabase dashboard → Authentication → URL Configuration, add: `https://*-operatorzero.vercel.app/**` (or your project slug). Also add `http://localhost:3000/**` for local dev.
**Warning signs:** OAuth works locally and on prod domain, fails on PR previews.

### Pitfall 7: RLS blocking Inngest service-role queries
**What goes wrong:** Inngest functions use a Drizzle instance initialized with the `anon` key (because it was copied from client-side code). RLS blocks all queries since the Inngest function doesn't have a user JWT. All Inngest DB operations return empty results or permission errors.
**Why it happens:** Confusion between two Drizzle clients: one for authenticated app-tier queries (uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` equivalent), one for service-role agent-tier queries (uses `SUPABASE_SERVICE_ROLE_KEY`).
**How to avoid:** `lib/db/client.ts` must export TWO Drizzle instances: `db` (for app-tier, with RLS enforced) and `serviceDb` (for agent-tier Inngest functions, with service-role key, bypasses RLS but always filters by userId explicitly in code).
**Warning signs:** Inngest function steps return empty data or throw permission errors; same queries work fine in server components.

---

## Code Examples

### RLS Policy SQL (run via Supabase migration)
```sql
-- Source: https://supabase.com/docs/guides/database/postgres/row-level-security
-- Enable RLS and add policy for user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_user_policy"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Enable RLS and add policy for integrations
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_user_policy"
  ON integrations
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
```

**Note:** `(SELECT auth.uid())` (with SELECT) is preferred over `auth.uid()` directly — prevents plan cache invalidation on each row. [CITED: https://supabase.com/docs/guides/database/postgres/row-level-security]

### Inngest waitForEvent (Phase 2 preview — documented for awareness)
```typescript
// Not needed in Phase 1, but the pattern the concurrency key enables (TECH-SPEC §4.1)
const decision = await step.waitForEvent(`wait-approval-${stepIndex}`, {
  event: 'approval.resolved',
  timeout: '14d',
  if: `event.data.approvalId == "${approval.id}"`,
})
```

### Environment Variables (required for Phase 1)
```bash
# .env.local (never commit — .gitignored)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>  # server-only, NO NEXT_PUBLIC_
ANTHROPIC_API_KEY=<key>                        # server-only
VOYAGE_API_KEY=<key>                           # server-only
ENCRYPTION_KEY=<32-byte base64>               # server-only; generate with: openssl rand -base64 32
INNGEST_SIGNING_KEY=<signing key>              # from Inngest dashboard
INNGEST_EVENT_KEY=<event key>                  # from Inngest dashboard
INNGEST_DEV=1                                  # local only; remove in Vercel env
SENTRY_DSN=<dsn>                               # from Sentry project settings
SENTRY_AUTH_TOKEN=<token>                      # for source map upload (CI only)
UPSTASH_REDIS_REST_URL=<url>                   # for rate limiting
UPSTASH_REDIS_REST_TOKEN=<token>               # for rate limiting
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getSession()` in server code | `getClaims()` in server code | @supabase/ssr 0.8+ | Security critical — old approach does not validate JWT signature |
| `cookies()` (sync) in Next.js 14 | `await cookies()` (async) in Next.js 15 | Next.js 15.0 | Without await, cookie store returns undefined in strict mode |
| `sentry.client.config.ts` | `instrumentation-client.ts` | @sentry/nextjs 8.x | New file name + export convention for Next.js App Router |
| Voyage `voyage-3` (1024 dims) | Voyage `voyage-4` (1024 dims default) | Jan 2026 | Same dimension, better quality; DATA-FLOW.md vector(1536) is stale |
| Drizzle `pgTable()` | `pgTable().enableRLS()` + `pgPolicy()` | drizzle-orm 0.32+ | RLS can now be expressed in Drizzle schema instead of raw SQL only |
| Legacy Auth Helpers (`@supabase/auth-helpers-nextjs`) | `@supabase/ssr` | 2023 | Auth Helpers are deprecated; `@supabase/ssr` is the replacement |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Deprecated. All new code uses `@supabase/ssr`.
- Voyage `voyage-2` / `voyage-large-2`: Previous generation. Use `voyage-4` family.
- `supabase.auth.getUser()` for middleware authorization: Now `getClaims()` is preferred for speed (avoids network call); `getUser()` still valid but slower.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | DATA-FLOW.md `vector(1536)` must be changed to `vector(1024)` to match Voyage voyage-4 default dimension | Standard Stack, Pitfall 3, Embeddings wiring | Schema created with wrong dimension; all embedding INSERTs fail. Fix: run a corrective migration. |
| A2 | `getClaims()` is the correct API on `@supabase/ssr` 0.10.3 for server-side JWT validation | Supabase Auth patterns | If the correct method name has changed again in 0.10.x, middleware will fail silently. Fix: consult `@supabase/ssr` changelog. |
| A3 | Upstash provides a free/low-cost Redis for rate limiting; no Upstash account may exist yet | Rate Limiting | If Upstash isn't set up, rate limiting (AUTH-06) blocks the plan. Alternative: use a simple in-process Map for Phase 1 with a clear upgrade path. |
| A4 | `voyageai` npm package v0.2.1 maps to the TypeScript SDK with `VoyageAIClient` export | Voyage embeddings wiring | If API surface differs, embeddings wiring code needs adjustment |
| A5 | Inngest free tier supports the hello-world durable function for INFRA-05 verification | Inngest setup | Inngest requires a paid plan for production concurrency limits; free tier is sufficient for development verification |

---

## Open Questions

1. **Voyage dimension in DATA-FLOW.md schema**
   - What we know: DATA-FLOW.md §4.4 says `vector(1536)`. Voyage voyage-4 defaults to 1024 dims.
   - What's unclear: Was `vector(1536)` intentional (planning for a different model)? Or should it be 1024?
   - Recommendation: Change schema to `vector(1024)` and use `voyage-4` as the standard model. If higher quality is needed, `voyage-4-large` also returns 1024 by default. Only if 2048 dimensions are explicitly desired should the schema use `vector(2048)` and set `output_dim: 2048` in the API call. **Planner action required before schema migration is written.**

2. **Supabase project already provisioned?**
   - What we know: No Supabase project ref found in the repo or .planning/.
   - What's unclear: Has a Supabase project been created for this app?
   - Recommendation: Wave 0 of the plan should include a manual checkpoint: "Provision Supabase Pro project, copy URL + keys into .env.local and Vercel environment variables."

3. **Inngest account + event key provisioned?**
   - What we know: No Inngest credentials found in the repo.
   - What's unclear: Has an Inngest account been created?
   - Recommendation: Wave 0 checkpoint: "Create Inngest account, connect to Vercel project, copy INNGEST_SIGNING_KEY + INNGEST_EVENT_KEY."

4. **Upstash Redis account for rate limiting (AUTH-06)**
   - What we know: AUTH-06 requires per-user rate limits on chat sends.
   - What's unclear: Whether an Upstash account exists; whether a free tier is acceptable for Phase 1.
   - Recommendation: Phase 1 rate limiting is preparatory infrastructure; a stub that logs but doesn't block is acceptable for initial deploy if Upstash provisioning is deferred to Phase 2 when chat actually exists.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js / all packages | Yes | 25.6.1 | — |
| npm | Package management | Yes | 11.9.0 | — |
| Vercel CLI | Local deploy / preview | Yes | 50.33.1 | Use Vercel dashboard |
| Git | Version control | Yes | 2.50.1 | — |
| Supabase CLI | Local dev + migrations | No | — | Install: `npm install -g supabase` or `brew install supabase/tap/supabase` |
| Inngest CLI | Local dev server | No | — | Install: `curl -sSfL https://cli.inngest.com/install.sh \| sh` |
| Docker | Supabase local DB | No | — | Use hosted Supabase project (skip local DB; use remote project credentials in dev) |

**Missing dependencies with no fallback:**
- None — all blocking dependencies can be installed.

**Missing dependencies with fallback:**
- Supabase CLI: required for migrations in dev. Can install via npm/brew.
- Inngest CLI: required for local dev server. Can install via curl script.
- Docker: required for `supabase start` (local Postgres). If unavailable, connect to a dedicated Supabase development project instead of a local instance. This is a pragmatic fallback but slightly degrades isolation.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 |
| Config file | `vitest.config.mts` (to be created in Wave 0) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Vercel deploys on merge; PR triggers CI | smoke (CI) | `gh pr create` → CI workflow runs | ❌ Wave 0: `.github/workflows/ci.yml` |
| INFRA-02 | Drizzle schema generates valid SQL; tables exist after migration | unit | `vitest run tests/unit/schema.test.ts` | ❌ Wave 0 |
| INFRA-03 | RLS policy blocks access from a different user_id | integration (Supabase test) | Manual: seed two users, verify cross-user SELECT returns 0 rows | manual-only for Phase 1 |
| INFRA-04 | Encrypt → decrypt round-trip preserves plaintext; encrypted value ≠ plaintext | unit | `vitest run tests/unit/crypto.test.ts` | ❌ Wave 0 |
| INFRA-05 | Inngest hello-world fires and both step.run checkpoints complete | smoke (manual) | Inngest dev UI shows both steps completed; check event log | manual-only (Inngest UI) |
| INFRA-06 | Anthropic SDK returns a message; Voyage embeds returns a 1024-dim vector | unit | `vitest run tests/unit/sdk-smoke.test.ts` | ❌ Wave 0 |
| INFRA-07 | IntegrationAdapter interface compiles; ShopifyAdapter + GmailAdapter instantiate without error | unit | `vitest run tests/unit/adapters.test.ts` | ❌ Wave 0 |
| INFRA-08 | Sentry captures a test error end-to-end; Axiom receives at least one log line | smoke (manual) | Trigger `Sentry.captureException(new Error('test'))` in a test route; verify in Sentry dashboard | manual-only |
| AUTH-01 | User can sign up with email + password; session cookie set | e2e (manual) | Navigate to /signup, complete form, verify redirect to /app/home | manual-only (Phase 1) |
| AUTH-02 | Google OAuth completes; callback exchanges code; session cookie set | e2e (manual) | Click "Sign in with Google"; verify redirect to /app/home | manual-only (Phase 1) |
| AUTH-03 | /app/* returns 302 for unauthenticated requests; authenticated access returns 200 | unit | `vitest run tests/unit/middleware.test.ts` | ❌ Wave 0 |
| AUTH-06 | Rate limit returns 429 after 30 requests within 1 minute | unit | `vitest run tests/unit/rate-limit.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit && npx vitest run` (type check + unit tests)
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** Full suite green + all manual checks documented before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.mts` — configure Vitest with React plugin + path aliases
- [ ] `tests/unit/crypto.test.ts` — encrypt/decrypt round-trip (INFRA-04)
- [ ] `tests/unit/schema.test.ts` — Drizzle table shape assertions (INFRA-02)
- [ ] `tests/unit/sdk-smoke.test.ts` — Anthropic + Voyage SDK callability (INFRA-06)
- [ ] `tests/unit/adapters.test.ts` — adapter instantiation smoke test (INFRA-07)
- [ ] `tests/unit/middleware.test.ts` — route protection unit test (AUTH-03)
- [ ] `tests/unit/rate-limit.test.ts` — rate limiter under/over-limit (AUTH-06)
- [ ] `.github/workflows/ci.yml` — tsc + vitest on PR (INFRA-01)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Supabase Auth (email/password + Google OAuth); `getClaims()` for server validation |
| V3 Session Management | Yes | httpOnly cookie set by `@supabase/ssr`; 30-day rolling refresh via Supabase defaults |
| V4 Access Control | Yes | RLS `auth.uid() = user_id` on every user table; explicit filters in every query |
| V5 Input Validation | Yes | Zod schemas on all Route Handlers, Server Actions, and tool inputs |
| V6 Cryptography | Yes | libsodium secretbox for token encryption; never hand-roll |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Session hijacking via `getSession()` bypass | Spoofing | Always use `getClaims()` in server code — validates JWT signature |
| Token plaintext exposure in DB | Info Disclosure | libsodium secretbox; `ENCRYPTION_KEY` in Vercel secrets only |
| Unauthorized cross-user data access | Elevation of Privilege | RLS + explicit `user_id` filter in every query (defense in depth) |
| OAuth state parameter forgery (CSRF on OAuth) | Spoofing | Supabase PKCE flow handles state generation and verification |
| Service-role key leakage to client | Info Disclosure | `SUPABASE_SERVICE_ROLE_KEY` must NEVER have `NEXT_PUBLIC_` prefix |
| Runaway LLM costs | Denial of Service | Per-user rate limits (AUTH-06) + Inngest concurrency key `{ limit: 1, key: 'event.data.userId' }` |
| Inngest webhook spoofing | Tampering | Inngest `signingKey` verifies requests; never skip this in production |

---

## Sources

### Primary (HIGH confidence)
- [Supabase SSR Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — middleware pattern, getClaims() vs getSession(), cookie client creation
- [Anthropic TypeScript SDK docs](https://platform.claude.com/docs/en/api/sdks/typescript) — streaming, tool use, model IDs, Vercel Edge Runtime support confirmed
- [Anthropic embeddings guide](https://platform.claude.com/docs/en/docs/build-with-claude/embeddings) — confirms Voyage AI as the recommended embeddings provider; voyage-4 dimensions confirmed
- [Inngest Next.js Quick Start](https://www.inngest.com/docs/getting-started/nextjs-quick-start) — serve route, step.run, maxDuration, local dev setup
- [Inngest Concurrency docs](https://www.inngest.com/docs/functions/concurrency) — key-based per-entity concurrency pattern
- [Drizzle ORM Supabase guide](https://orm.drizzle.team/docs/get-started/supabase-new) — connection, migration workflow, prepared statements
- [Drizzle RLS docs](https://orm.drizzle.team/docs/rls) — pgPolicy, enableRLS(), Supabase predefined roles
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — policy patterns, service role bypass
- [Sentry Next.js docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) — wizard setup, instrumentation files, withSentryConfig

### Secondary (MEDIUM confidence)
- [npm registry](https://npmjs.com) — all package versions verified 2026-05-21
- [Voyage AI TypeScript SDK GitHub](https://github.com/voyage-ai/typescript-sdk) — VoyageAIClient API surface
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) — wildcard pattern for Vercel preview deployments

### Tertiary (LOW confidence)
- Various WebSearch results on Upstash rate limiting pattern — confirmed by multiple community sources but not from official Upstash docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry 2026-05-21; official docs consulted for each package
- Architecture: HIGH — directly derived from locked TECH-SPEC, SYSTEMS-DESIGN, and DATA-FLOW docs
- Supabase Auth patterns: MEDIUM-HIGH — getClaims() confirmed as current API; some code examples reconstructed from partial docs
- Drizzle + Supabase migration workflow: MEDIUM — reconciliation pattern confirmed by Drizzle docs; Supabase-specific path verified from Supabase local dev docs
- Pitfalls: HIGH — most sourced directly from official documentation warnings
- Voyage embedding dimension: HIGH — verified directly from Anthropic + Voyage official docs; A1 assumption is the most load-bearing finding

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (30 days; check @supabase/ssr and inngest changelogs before planning if research is older than 2 weeks)
