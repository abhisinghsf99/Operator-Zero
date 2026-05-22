# Phase 2: Foundation — Prove the Agent — Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 52 new/modified files (across 7 plans)
**Analogs found:** 38 / 52 (14 greenfield UI — no in-repo analog)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/globals.css` | config | — | `app/globals.css` (replace) | exact — rewrite |
| `app/layout.tsx` | config | — | `app/layout.tsx` (extend) | exact — extend |
| `lib/utils.ts` | utility | transform | `lib/integrations/crypto.ts` (utility pattern) | role-match |
| `lib/db/schema/workflows.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/workflow-versions.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/workflow-runs.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/activity-entries.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/approvals.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/threads.ts` | model | CRUD | `lib/db/schema/users.ts` | exact |
| `lib/db/schema/messages.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/memory-items.ts` | model | CRUD | `lib/db/schema/users.ts` | exact |
| `lib/db/schema/memory-embeddings.ts` | model | CRUD | `lib/db/schema/integrations.ts` + pgvector | exact |
| `lib/db/schema/brand-voice.ts` | model | CRUD | `lib/db/schema/users.ts` | exact |
| `lib/db/schema/autonomy-thresholds.ts` | model | CRUD | `lib/db/schema/users.ts` | exact |
| `lib/db/schema/shopify-mirror.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/gmail-mirror.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/telemetry.ts` | model | CRUD | `lib/db/schema/integrations.ts` | exact |
| `lib/db/schema/index.ts` | config | — | `lib/db/schema/index.ts` (extend) | exact — extend |
| `supabase/migrations/0003_phase2_tables.sql` | migration | — | `supabase/migrations/0001_initial_schema.sql` + `0002_schema_hardening.sql` | exact |
| `lib/integrations/shopify/client.ts` | service | request-response | `lib/integrations/shopify/client.ts` (flesh out) | exact — extend |
| `lib/integrations/shopify/sync.ts` | service | batch | `lib/inngest/functions/hello-world.ts` | role-match |
| `lib/integrations/shopify/mutations.ts` | service | CRUD | `lib/integrations/shopify/client.ts` | role-match |
| `lib/integrations/shopify/webhooks.ts` | middleware | request-response | `app/auth/callback/route.ts` | role-match |
| `lib/integrations/gmail/client.ts` | service | request-response | `lib/integrations/gmail/client.ts` (flesh out) | exact — extend |
| `lib/integrations/gmail/sync.ts` | service | batch | `lib/inngest/functions/hello-world.ts` | role-match |
| `lib/integrations/gmail/classify.ts` | service | transform | `lib/agent/anthropic.ts` | role-match |
| `app/api/integrations/shopify/connect/route.ts` | route | request-response | `app/auth/callback/route.ts` | exact |
| `app/api/integrations/shopify/callback/route.ts` | route | request-response | `app/auth/callback/route.ts` | exact |
| `app/api/integrations/gmail/connect/route.ts` | route | request-response | `app/auth/callback/route.ts` | exact |
| `app/api/integrations/gmail/callback/route.ts` | route | request-response | `app/auth/callback/route.ts` | exact |
| `app/api/webhooks/shopify/route.ts` | route | event-driven | `app/api/health/route.ts` + inngest | role-match |
| `app/api/chat/[threadId]/send/route.ts` | route | streaming | `app/api/inngest/route.ts` | role-match |
| `app/api/inngest/route.ts` | config | — | `app/api/inngest/route.ts` (extend maxDuration) | exact — extend |
| `lib/inngest/client.ts` | config | — | `lib/inngest/client.ts` (extend maxRuntime) | exact — extend |
| `lib/inngest/functions/execute-workflow-run.ts` | service | event-driven | `lib/inngest/functions/hello-world.ts` | exact |
| `lib/inngest/functions/shopify-sync.ts` | service | batch | `lib/inngest/functions/hello-world.ts` | exact |
| `lib/inngest/functions/gmail-sync.ts` | service | batch | `lib/inngest/functions/hello-world.ts` | exact |
| `lib/inngest/functions/catalog-audit.ts` | service | batch | `lib/inngest/functions/hello-world.ts` | exact |
| `lib/agent/runtime.ts` | service | streaming | `lib/agent/anthropic.ts` | role-match |
| `lib/agent/prompt.ts` | utility | transform | `lib/agent/embeddings.ts` | role-match |
| `lib/agent/memory.ts` | service | CRUD | `lib/agent/embeddings.ts` | role-match |
| `lib/agent/tools/index.ts` | config | — | `lib/db/schema/index.ts` | role-match |
| `lib/agent/tools/read/*.ts` | service | request-response | `lib/agent/anthropic.ts` | role-match |
| `lib/agent/tools/write/*.ts` | service | CRUD | `lib/agent/anthropic.ts` | role-match |
| `lib/cost-cap.ts` | utility | request-response | `lib/rate-limit.ts` | exact |
| `app/onboarding/page.tsx` | component | request-response | `app/app/home/page.tsx` | role-match |
| `app/onboarding/_steps/*.tsx` | component | request-response | `app/(auth)/login/page.tsx` | role-match |
| `app/app/chat/page.tsx` | component | streaming | `app/app/home/page.tsx` | role-match |
| `app/app/chat/[threadId]/page.tsx` | component | streaming | `app/app/home/page.tsx` | role-match |
| `app/app/settings/page.tsx` | component | request-response | `app/app/home/page.tsx` | role-match |
| `app/app/layout.tsx` | component | — | `app/app/layout.tsx` (extend) | exact — extend |
| `components/ui/*.tsx` | component | — | GREENFIELD — no analog | none |
| `components/chat/*.tsx` | component | streaming | GREENFIELD — no analog | none |
| `components/onboarding/*.tsx` | component | request-response | GREENFIELD — no analog | none |
| `components/layout/*.tsx` | component | — | GREENFIELD — no analog | none |

---

## Pattern Assignments

### `lib/db/schema/workflows.ts` (and all other Phase 2 schema files)

**Analog:** `lib/db/schema/integrations.ts`

**Imports pattern** (lines 1–29):
```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgPolicy,
  unique,
  index,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";
```

For `memory-embeddings.ts` and `brand-voice-samples.ts` (vector columns), add:
```typescript
import { vector } from "drizzle-orm/pg-core";
```

**Table definition pattern** (from `integrations.ts` lines 32–107):
```typescript
export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),          // ALWAYS present, ALWAYS notNull
    // ... domain columns with inline comments matching DATA-FLOW.md column names verbatim
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_workflows_user_id").on(table.user_id),  // index on user_id for every table
    pgPolicy("workflows_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
```

**pgvector column pattern** (for `memory-embeddings.ts`, `brand-voice-samples.ts`):
```typescript
import { vector, index } from "drizzle-orm/pg-core";

// In table columns:
embedding: vector("embedding", { dimensions: 1024 }),  // voyage-4 = 1024 dims, NOT 1536

// In table config callback (replaces btree index):
index("idx_memory_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
```

**Special case — user_id-as-PK tables** (`brand_voice_profiles`, `autonomy_thresholds`):
```typescript
// Follow users.ts pattern: user_id is BOTH primaryKey and tenant discriminator
user_id: uuid("user_id").primaryKey(),
```

**Special case — composite PK mirror tables** (`shopify_products`, `gmail_threads`, etc.):
```typescript
// Composite PKs use primaryKey() on columns or a separate constraint
// No .defaultRandom() — PK comes from the external system (product_gid, etc.)
user_id: uuid("user_id").notNull(),
product_gid: text("product_gid").notNull(),
// In table config: primaryKey({ columns: [table.user_id, table.product_gid] })
```

**Inline doc comment header** (copy from `integrations.ts` lines 1–19):
- First lines: file path + table purpose
- `MULTI-TENANT:` note (user_id + RLS enforcement)
- `SECURITY CRITICAL:` / `THREAT MODEL:` notes if relevant (encrypted columns, etc.)

---

### `lib/db/schema/index.ts` (extend)

**Analog:** `lib/db/schema/index.ts` (lines 1–9)

**Current file:**
```typescript
export { userProfiles } from "./users";
export { integrations } from "./integrations";
```

**Pattern for extension:** append one `export { ... } from "./<module>"` line per new schema file. No wildcard re-exports — named exports only, matching the table const name exactly.

---

### `supabase/migrations/0003_phase2_tables.sql`

**Analogs:** `supabase/migrations/0001_initial_schema.sql` + `0002_schema_hardening.sql`

**Header pattern** (from `0001`, lines 1–6):
```sql
-- Phase 2 Plan 02: Phase 2 tables migration
-- Tables: [list all 22 new tables]
-- Generated by: hand-authored from Drizzle schemas (drizzle-kit generate then adapted)
-- Applied via: npx supabase db push
-- DO NOT run drizzle-kit migrate against Supabase
--
-- Cross-schema FKs to auth.users added manually (Drizzle cannot cross schemas)
```

**Extension pattern** — first statement in file (Pitfall 3):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Table creation pattern** (from `0001`, lines 11–36):
```sql
CREATE TABLE IF NOT EXISTS "workflows" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- ... columns
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

**RLS enable + policy pattern** (from `0001`, lines 38–46):
```sql
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows_user_policy" ON "workflows"
  AS PERMISSIVE FOR ALL TO "authenticated"
  USING ((SELECT auth.uid()) = "workflows"."user_id")
  WITH CHECK ((SELECT auth.uid()) = "workflows"."user_id");
```

**updated_at trigger pattern** (from `0002`, lines 19–31 — apply to every table with `updated_at`):
```sql
-- Reuse the function created in 0002 (already exists):
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**HNSW index pattern** (from RESEARCH.md — apply to `memory_embeddings`, `brand_voice_samples`):
```sql
CREATE INDEX idx_memory_embeddings_hnsw ON memory_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**CHECK constraint pattern** (from `0002`, lines 34–39 — apply to enum-like text columns):
```sql
ALTER TABLE workflows
  ADD CONSTRAINT workflows_automation_level_check
    CHECK (automation_level IN ('L1', 'L2', 'L3')),
  ADD CONSTRAINT workflows_status_check
    CHECK (status IN ('active', 'paused', 'draft', 'archived'));
```

---

### `lib/integrations/shopify/client.ts` (flesh out from stub)

**Analog:** `lib/integrations/shopify/client.ts` (existing stub, lines 1–28) + `lib/integrations/crypto.ts`

**Imports pattern** (extend existing):
```typescript
import type { IntegrationAdapter } from "../adapter";
import { decryptToken, encryptToken } from "../crypto";
import { serviceDb } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
```

**Constructor + token-load pattern** (extend existing `constructor(private readonly userId: string)`):
```typescript
private async loadCredentials(): Promise<{ accessToken: string; shopDomain: string }> {
  const [row] = await serviceDb
    .select()
    .from(integrations)
    .where(and(eq(integrations.user_id, this.userId), eq(integrations.provider, "shopify")))
    .limit(1);
  if (!row) throw new Error(`No Shopify integration for user ${this.userId}`);
  const accessToken = await decryptToken(row.access_token_encrypted);
  return { accessToken, shopDomain: row.provider_account_id! };
}
```

**Crypto reuse pattern** (from `lib/integrations/crypto.ts`):
- `encryptToken(plaintext)` / `decryptToken(encrypted)` are the ONLY path to/from stored tokens
- Plaintext tokens NEVER enter the DB — mirror the `integrations.ts` schema comment: `"SECURITY CRITICAL: access_token_encrypted is ALWAYS ciphertext"`

---

### `lib/integrations/gmail/client.ts` (flesh out from stub)

**Analog:** Same as Shopify client — `lib/integrations/gmail/client.ts` stub + `lib/integrations/crypto.ts`

**Token refresh pattern** (from RESEARCH.md Area 3 — `access_type=offline` is critical):
```typescript
async refreshToken(): Promise<void> {
  const [row] = await serviceDb.select().from(integrations)
    .where(and(eq(integrations.user_id, this.userId), eq(integrations.provider, "gmail")))
    .limit(1);
  const refreshTokenPlain = await decryptToken(row!.refresh_token_encrypted!);
  // Call Google token endpoint with grant_type=refresh_token
  // Encrypt new access_token, update integrations row
  // Update integrations.expires_at
}
```

---

### `app/api/integrations/shopify/connect/route.ts` and `callback/route.ts`

**Analog:** `app/auth/callback/route.ts` (lines 1–107)

**Imports pattern** (from callback route, lines 22–25):
```typescript
import { createClient } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
```

**Auth guard pattern** (from `lib/auth/profile.ts` lines 43–54):
```typescript
const supabase = await createClient();
const { data: claimsData } = await supabase.auth.getClaims();
const claims = claimsData?.claims ?? null;
if (!claims?.sub) {
  return NextResponse.redirect(`${origin}/login`);
}
const userId = claims.sub;
```

**Route Handler structure** (from callback route, lines 80–107):
```typescript
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  // ... param extraction
  const origin = request.nextUrl.origin;
  // ... validate, exchange, store, redirect
  return NextResponse.redirect(`${origin}/onboarding?step=2`);
}
```

**Next.js 15 async params** (from RESEARCH.md Pitfall 4):
```typescript
// Dynamic route segments MUST be awaited in Next.js 15:
export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
```

**Security pattern for OAuth callback** (from `app/auth/callback/route.ts` lines 44–73 — `validateNextParam` shows the open-redirect guard idiom to apply to `shop` param validation):
- Validate `shop` is a `.myshopify.com` domain before using it in any URL
- Verify HMAC before any DB writes
- Return `400` on HMAC mismatch (not redirect)

---

### `app/api/webhooks/shopify/route.ts`

**Analog:** `app/api/health/route.ts` (route handler structure) + inngest send pattern

**Route Handler pattern** (from `app/api/health/route.ts` lines 4–33):
```typescript
export async function POST(request: NextRequest) {
  // 1. HMAC verify first — return 401 immediately on failure
  // 2. return NextResponse.json({ ok: true }, { status: 200 }) IMMEDIATELY
  //    (Shopify retries if no 200 within ~5s — Pitfall 2)
  // 3. Push to Inngest AFTER returning 200 via inngest.send()
}
```

---

### `app/api/chat/[threadId]/send/route.ts`

**Analog:** `app/api/inngest/route.ts` (maxDuration pattern) + `lib/agent/anthropic.ts`

**maxDuration + dynamic config** (from RESEARCH.md Area 5):
```typescript
export const dynamic = "force-dynamic";
export const maxDuration = 60; // SSE routes need extended timeout
```

**SSE ReadableStream pattern** (from RESEARCH.md Area 5 — verified against Anthropic streaming docs):
```typescript
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    // ... anthropic.messages.stream(...)
    controller.close();
  },
});
return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  },
});
```

**Rate limit check** (from `lib/rate-limit.ts` lines 13–20 — apply before any LLM call):
```typescript
const { success } = await chatRateLimit.limit(userId);
if (!success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
```

---

### `lib/inngest/client.ts` (extend)

**Analog:** `lib/inngest/client.ts` (lines 1–11)

**Current:**
```typescript
export const inngest = new Inngest({ id: "operator-zero", maxRuntime: "1m" });
```

**Phase 2 extension** (RESEARCH.md Area 6 — must increase for workflow execution):
```typescript
export const inngest = new Inngest({
  id: "operator-zero",
  maxRuntime: "4m",  // 80% of 300s Vercel max; update test assertion in hello-world.test.ts
});
```

---

### `app/api/inngest/route.ts` (extend)

**Analog:** `app/api/inngest/route.ts` (lines 1–16)

**Phase 2 extension**:
```typescript
export const maxDuration = 300; // Increased from 60 for long-running workflow execution
// Add all Phase 2 functions to the serve() call:
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    executeWorkflowRun,
    shopifyFullSync,
    shopifyPoll,
    gmailInitialSync,
    gmailIncrementalPoll,
    catalogAudit,
  ],
});
```

---

### `lib/inngest/functions/execute-workflow-run.ts`

**Analog:** `lib/inngest/functions/hello-world.ts` (lines 1–36)

**Function signature pattern** (from `hello-world.ts` lines 10–36):
```typescript
export const executeWorkflowRun = inngest.createFunction(
  {
    id: "execute-workflow-run",
    triggers: [{ event: "workflow.run_requested" }],
    concurrency: {
      limit: 1,
      key: "event.data.userId",  // serialize per user — same as hello-world
    },
    retries: 3,
  },
  async ({ event, step }) => {
    // All logic inside step.run() calls — never raw async outside step.run
  }
);
```

**step.run() pattern** (from `hello-world.ts` lines 23–35):
```typescript
// Each step.run() ID must be deterministic (Pitfall 6):
const result = await step.run("load-and-create-run", async () => {
  // ... DB work
});
// Step IDs for loop steps must include the index and a stable identifier:
await step.run(`execute-step-${i}-${workflowStep.id}`, async () => { ... });
```

**step.waitForEvent() pattern** (from RESEARCH.md Area 6 — CEL Pitfall 1):
```typescript
const decision = await step.waitForEvent(`wait-approval-${i}`, {
  event: "approval.resolved",
  timeout: "14d",
  // 'async' = original triggering event data; 'event' = the incoming matched event
  if: `async.data.approvalId == "${approval.id}"`,
});
if (!decision) { /* timeout */ return; }
if (decision.data.decision === "rejected") { /* rejected */ return; }
// Approved — proceed
```

**serviceDb usage** (from `lib/db/client.ts` lines 68–73 — Inngest functions use serviceDb, not withUserRls):
```typescript
import { serviceDb } from "@/lib/db";
// ALWAYS include explicit user_id filter — RLS is bypassed:
await serviceDb.update(workflowRuns)
  .set({ status: "running" })
  .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.user_id, userId)));
```

---

### `lib/inngest/functions/shopify-sync.ts` and `gmail-sync.ts`

**Analog:** `lib/inngest/functions/hello-world.ts`

**Cron trigger pattern** (from RESEARCH.md Area 2):
```typescript
export const shopifyPoll = inngest.createFunction(
  { id: "shopify-poll", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    // step.run() for each user with active Shopify integration
  }
);
```

---

### `lib/agent/runtime.ts`

**Analog:** `lib/agent/anthropic.ts` (lines 1–27) + `lib/agent/embeddings.ts`

**Imports pattern** (from `anthropic.ts` lines 1–11):
```typescript
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "./anthropic";         // reuse singleton
import { embedText } from "./embeddings";        // reuse Voyage client
import { serviceDb } from "@/lib/db";
import { chatRateLimit } from "@/lib/rate-limit";
```

**Server-only guard** (from `anthropic.ts` comment — both `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are server-only):
```typescript
// SECURITY: This module is server-only. Never import in Client Components.
// No NEXT_PUBLIC_ env vars are read here.
```

**Error classification pattern** (from RESEARCH.md Area 5 AGENT-06):
```typescript
import Anthropic from "@anthropic-ai/sdk";
try {
  const stream = anthropic.messages.stream({ ... });
} catch (err) {
  if (err instanceof Anthropic.APIStatusError && err.status === 401) {
    return { type: "auth_error" };
  }
  if (err instanceof Anthropic.APIStatusError && err.status === 529) {
    return { type: "transient" }; // Inngest will retry
  }
  throw err; // unknown — let Inngest handle retry
}
```

---

### `lib/agent/prompt.ts`

**Analog:** `lib/agent/embeddings.ts` (utility module pattern, lines 1–41)

**Module structure pattern** (from `embeddings.ts`):
```typescript
// lib/agent/prompt.ts
// Server-only. No NEXT_PUBLIC_ env vars.
import { serviceDb } from "@/lib/db";

export async function buildSystemPrompt(userId: string, query?: string): Promise<string> {
  const [memoryItems, brandVoice, storeContext, semanticRecall] = await Promise.all([
    loadMemoryItems(userId),
    loadBrandVoiceProfile(userId),
    loadStoreContext(userId),
    query ? querySemanticMemory(userId, query) : Promise.resolve([]),
  ]);
  // assemble; truncate oldest first to fit token budget
}
```

---

### `lib/agent/memory.ts`

**Analog:** `lib/agent/embeddings.ts` (lines 1–41)

**embedText() reuse** (from `embeddings.ts` lines 27–41):
```typescript
import { embedText } from "./embeddings";  // reuse existing Voyage client

export async function storeMemoryItem(userId: string, content: string, category: string) {
  const embedding = await embedText(content, "document");
  // Insert memory_items row, then memory_embeddings row with the vector
}

export async function recallMemory(userId: string, query: string, topK = 5) {
  const queryVec = await embedText(query, "query");
  // Use Drizzle cosineDistance() to query memory_embeddings HNSW index
}
```

---

### `lib/cost-cap.ts`

**Analog:** `lib/rate-limit.ts` (lines 1–20) — exact structural match (Upstash Redis utility)

**Imports pattern** (from `rate-limit.ts` lines 10–12):
```typescript
import { Redis } from "@upstash/redis";
// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// These are server-only — never NEXT_PUBLIC_
```

**Redis singleton pattern** (from `rate-limit.ts` line 14):
```typescript
// rate-limit.ts uses Ratelimit.fromEnv() factory
// cost-cap.ts uses Redis directly:
const redis = Redis.fromEnv();
const COST_KEY = (userId: string) =>
  `oz:cost:${userId}:${new Date().toISOString().split("T")[0]}`;
```

---

### `app/onboarding/page.tsx` and `app/app/chat/page.tsx`, `app/app/settings/page.tsx`

**Analog:** `app/app/home/page.tsx` (lines 1–64) — RSC page pattern

**RSC pattern** (from `home/page.tsx` lines 19–64):
```typescript
// Server Component — no "use client"
import { getOrCreateProfile } from "@/lib/auth/profile";

export default async function OnboardingPage() {
  const profile = await getOrCreateProfile(); // validates JWT, enforces RLS
  // ... render with profile data
}
```

**Auth guard in pages** — middleware already guards `/app/*`; for `/onboarding`, add an exception in `lib/auth/middleware.ts`:
```typescript
// In updateSession(), add to the guard:
const isProtectedAppRoute = request.nextUrl.pathname.startsWith("/app");
const isOnboardingRoute = request.nextUrl.pathname.startsWith("/onboarding");
if (!claims && (isProtectedAppRoute || isOnboardingRoute)) {
  // redirect to /login
}
```

---

### Server Actions (`app/onboarding/actions.ts`, `app/app/approvals/actions.ts`, etc.)

**Analog:** `app/(auth)/login/actions.ts` (lines 1–55) + `app/app/actions.ts`

**Server Action pattern** (from `login/actions.ts` lines 1–55):
```typescript
"use server";

import { createClient } from "@/lib/auth/server";
import { withUserRls } from "@/lib/db";
import { redirect } from "next/navigation";
import { z } from "zod";

// 1. Validate input with Zod before any DB/API call
const schema = z.object({ ... });

export async function saveOnboardingStep(formData: FormData): Promise<{ error: string } | never> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input." };

  // 2. Get authenticated user claims (never trust user-supplied userId)
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  if (!claims?.sub) return { error: "Not authenticated." };

  // 3. Perform DB writes inside withUserRls (RLS enforced)
  await withUserRls(claims, async (tx) => {
    await tx.update(userProfiles).set({ onboarding_step: parsed.data.step });
  });

  redirect("/onboarding?step=next");
}
```

**Inngest.send() in Server Actions** (from RESEARCH.md Area 6 — approval resume):
```typescript
import { inngest } from "@/lib/inngest/client";
// After DB update, fire the event to resume the paused Inngest function:
await inngest.send({
  name: "approval.resolved",
  data: { approvalId, decision: "approved" },
});
```

---

### `app/app/layout.tsx` (extend)

**Analog:** `app/app/layout.tsx` (lines 1–48)

**Layout pattern** (lines 19–48):
```typescript
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">  {/* use bg-bg from new OKLCH tokens */}
      {/* Phase 2: replace minimal header with sidebar nav + bottom-tabs */}
      <components/layout/sidebar.tsx />
      <main className="...">{children}</main>
    </div>
  );
}
```

---

## Shared Patterns

### Authentication (apply to ALL Route Handlers and Server Actions)

**Source:** `lib/auth/server.ts` lines 26–51, `lib/auth/profile.ts` lines 43–54

```typescript
// In Route Handlers:
const supabase = await createClient();
const { data: claimsData } = await supabase.auth.getClaims();
const claims = claimsData?.claims ?? null;
if (!claims?.sub) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const userId = claims.sub;

// NEVER use: supabase.auth.getSession() — does not validate JWT signature
```

### RLS-Enforced DB Access (apply to ALL web-tier code)

**Source:** `lib/db/client.ts` lines 95–109

```typescript
// Web tier (Server Components, Route Handlers, Server Actions):
import { withUserRls } from "@/lib/db";

await withUserRls(claims, async (tx) => {
  await tx.select().from(tableName).where(eq(tableName.user_id, userId));
});

// Agent/Inngest tier:
import { serviceDb } from "@/lib/db";
// ALWAYS add explicit .where(eq(table.user_id, userId)) — RLS does NOT apply
```

### Token Encryption (apply to ALL integration tokens stored in DB)

**Source:** `lib/integrations/crypto.ts` lines 51–105

```typescript
import { encryptToken, decryptToken } from "@/lib/integrations/crypto";

// On store: encrypt before any DB insert
const encrypted = await encryptToken(accessToken);
await db.insert(integrations).values({ access_token_encrypted: encrypted, ... });

// On read: decrypt after DB fetch
const plaintext = await decryptToken(row.access_token_encrypted);
```

### Zod Input Validation (apply to ALL Server Actions, Route Handler bodies, tool inputs)

**Source:** `app/(auth)/login/actions.ts` lines 20–42

```typescript
import { z } from "zod";

const schema = z.object({ ... });
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const firstError = parsed.error.errors[0]?.message ?? "Invalid input.";
  return { error: firstError };  // return, never throw, from Server Actions
}
```

### Structured Logging (apply to ALL Route Handlers and agent-tier functions)

**Source:** `app/api/health/route.ts` lines 21–29

```typescript
console.log(JSON.stringify({
  level: "info",
  event: "shopify.oauth.callback",
  userId,
  timestamp: new Date().toISOString(),
}));
// Axiom Vercel drain captures structured JSON lines automatically
```

### Inngest serviceDb Pattern (apply to ALL Inngest functions)

**Source:** `lib/db/client.ts` lines 68–73

```typescript
// serviceDb bypasses RLS — EVERY query MUST include explicit user_id filter
import { serviceDb } from "@/lib/db";
await serviceDb.select().from(table).where(eq(table.user_id, userId));
// Never call serviceDb from web-request code (Route Handlers, Server Actions, RSC)
```

---

## Greenfield UI Files (No In-Repo Analog)

The `components/` directory is empty. All UI files are greenfield. The visual contract and implementation conventions are:

| File | Role | Visual Contract | Implementation Convention |
|------|------|-----------------|--------------------------|
| `components/ui/*.tsx` | component | `Operator Zero Design Files/components.jsx` | shadcn/ui copied-in primitives; Radix under the hood; `cn()` from `lib/utils.ts` |
| `components/chat/thread-sidebar.tsx` | component | `Operator Zero Design Files/surface-conversation.jsx` | RSC + client island; Supabase Realtime subscription for badge count |
| `components/chat/message-stream.tsx` | component | `Operator Zero Design Files/surface-conversation.jsx` | Client Component; `EventSource` or `fetch` with `ReadableStream`; `"use client"` |
| `components/chat/composer.tsx` | component | `Operator Zero Design Files/surface-conversation.jsx` | Client Component; `zustand` store for draft state; Sonner for error toasts |
| `components/chat/workflow-visualizer.tsx` | component | `Operator Zero Design Files/surface-conversation.jsx` | Client Component; `motion/react` (from `framer-motion` package); `AnimatePresence` + step-reveal |
| `components/chat/inline-approval-card.tsx` | component | `Operator Zero Design Files/surface-conversation.jsx` | Client Component; Supabase Realtime for status sync; calls Server Action `approveItem` |
| `components/onboarding/progress-rail.tsx` | component | `Operator Zero Design Files/surface-onboarding.jsx` | Client Component; step state from URL search params |
| `components/onboarding/connect-step.tsx` | component | `Operator Zero Design Files/surface-onboarding.jsx` | Client Component; calls Server Action to initiate OAuth redirect |
| `components/layout/sidebar.tsx` | component | `Operator Zero Design Files/index.html` (nav chrome) | RSC shell + client interactivity island; `lucide-react` icons |
| `components/layout/bottom-tabs.tsx` | component | `Operator Zero Design Files/index.html` (mobile nav) | Client Component; mobile breakpoint only; 5 core tabs |

**Tailwind v4 OKLCH token source:** `Operator Zero Design Files/index.html` lines 14–79.
- Copy ALL CSS custom properties from `:root { }` block into `app/globals.css`
- Wire into Tailwind `@theme inline { }` block (see RESEARCH.md Area 1 for the exact mapping)
- Dark theme tokens are in `[data-theme="dark"] { }` block (lines ~97+) in the design file

**shadcn/ui init notes:**
- Run `npx shadcn@latest init` — creates `components/ui/`, `lib/utils.ts` with `cn()`, `components.json`
- shadcn v4 components use `data-slot` attributes instead of `React.forwardRef` — do NOT add `forwardRef` manually
- Translate design file components (`Button`, `Badge`, `LevelToggle`) using shadcn primitives, NOT the inline-styled JSX from `components.jsx`

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `components/ui/*.tsx` | component | — | shadcn/ui components are generated/copied in, not hand-rolled from an existing repo analog |
| `components/chat/*.tsx` | component | streaming | No chat UI exists anywhere in the repo; design file is the visual contract |
| `components/onboarding/*.tsx` | component | request-response | No onboarding UI exists; design file is the visual contract |
| `components/layout/*.tsx` | component | — | No nav chrome exists; design file is the visual contract |
| `lib/agent/tools/read/*.ts` | service | request-response | No tool catalog exists; TECH-SPEC §tool-catalog defines the 11 read tools |
| `lib/agent/tools/write/*.ts` | service | CRUD | No tool catalog exists; TECH-SPEC §tool-catalog defines the 11 write tools |

For all tool files: each tool exports `{ name, description, inputSchema: ZodSchema, execute: async (input, ctx) => ToolResult }`. The Zod-validated input and `tool_result` error-passback pattern is defined in RESEARCH.md AGENT-04 and the TECH-SPEC tool-catalog section.

---

## Metadata

**Analog search scope:** `lib/`, `app/`, `supabase/migrations/`, `Operator Zero Design Files/`
**Files scanned:** 28
**Pattern extraction date:** 2026-05-21
