# Phase 3: Ownership — The Portfolio - Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 20 new/modified files
**Analogs found:** 18 / 20

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/app/workflows/page.tsx` | route (RSC page) | request-response | `app/app/settings/page.tsx` | exact |
| `app/app/workflows/[id]/page.tsx` | route (RSC page, dynamic) | request-response | `app/app/chat/[threadId]/page.tsx` | exact |
| `app/app/activity/page.tsx` | route (RSC page) | request-response | `app/app/settings/page.tsx` | exact |
| `app/app/home/page.tsx` | route (thin redirect) | request-response | `app/app/chat/page.tsx` | exact |
| `lib/actions/workflows.ts` | service (Server Actions) | request-response + CRUD | `app/app/approvals/actions.ts` | exact |
| `lib/actions/activity.ts` | service (Server Actions) | request-response + CRUD | `app/app/approvals/actions.ts` | exact |
| `lib/workflows/versions.ts` | utility (transaction helper) | CRUD | `lib/workflows/approvals.ts` | role-match |
| `lib/workflows/revert.ts` | utility (pure function + executor) | CRUD | `lib/workflows/activity.ts` | role-match |
| `supabase/migrations/0005_activity_indexes.sql` | migration | batch | `supabase/migrations/0004_realtime_authz.sql` | exact |
| `components/workflows/inline-editable-text.tsx` | component (client) | request-response | `components/chat/inline-approval-card.tsx` (useState pattern) | role-match |
| `components/workflows/workflow-row.tsx` | component (client) | request-response | `components/chat/inline-approval-card.tsx` | role-match |
| `components/workflows/recent-activity-strip.tsx` | component (client, Realtime) | event-driven | `components/chat/inline-approval-card.tsx` | exact (Realtime pattern) |
| `components/workflows/run-now-dialog.tsx` | component (client, dialog) | request-response | `app/app/settings/_connections.tsx` (Dialog pattern) | role-match |
| `components/workflows/version-history-panel.tsx` | component (client) | CRUD | `components/chat/workflow-visualizer.tsx` | role-match |
| `components/activity/activity-row.tsx` | component (client, virtual) | event-driven | `components/chat/message-stream.tsx` (list row pattern) | role-match |
| `components/activity/activity-filters.tsx` | component (client) | request-response | `app/app/settings/_connections.tsx` | role-match |
| `components/activity/activity-detail.tsx` | component (client) | request-response | `components/chat/inline-approval-card.tsx` | role-match |
| `components/activity/bulk-revert-modal.tsx` | component (client, dialog) | request-response | `app/app/settings/_connections.tsx` (Dialog + confirm pattern) | role-match |
| `components/activity/revert-tooltip.tsx` | component (client) | request-response | no close analog | none |
| `lib/auth/middleware.ts` | middleware | request-response | self (modify existing) | self |

---

## Pattern Assignments

### `app/app/workflows/page.tsx` (RSC page, request-response)

**Analog:** `app/app/settings/page.tsx`

**Why:** Same pattern: RSC, onboarding gate via `getOrCreateProfile()`, parallel data fetches with `Promise.all()`, passes data to named client-component sections via props.

**Imports pattern** (lines 1–5, settings/page.tsx):
```typescript
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
// Phase 3 additions:
import { listWorkflows } from "@/lib/actions/workflows";
import { getStripStats } from "@/lib/actions/workflows";
```

**Auth + onboarding gate** (lines 25–32, settings/page.tsx):
```typescript
export default async function SettingsPage() {
  const profile = await getOrCreateProfile();
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }
  const userId = profile.user_id;
```

**Parallel data fetch** (lines 37–42, settings/page.tsx):
```typescript
  const [shopifyHealth, gmailHealth] = await Promise.all([
    getIntegrationHealth(userId, "shopify"),
    getIntegrationHealth(userId, "gmail"),
  ]);
```
For My Workflows, fetch workflows + strip stats in parallel in the same pattern.

**Page shell + data-testid** (lines 43–68, settings/page.tsx):
```tsx
  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)]">
      <div className="border-b-[0.5px] border-[var(--border)] bg-[var(--bg)] px-10 py-7">
        <div className="mx-auto max-w-[800px]">
          <div className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            Settings
          </div>
          <h1 className="display mt-1 text-[36px] tracking-[-0.015em] text-[var(--text)]">
            Tune the operator.
          </h1>
```
Replicate the `px-10 py-7` header + `max-w` content container for My Workflows page header.

---

### `app/app/workflows/[id]/page.tsx` (RSC page, dynamic segment)

**Analog:** `app/app/chat/[threadId]/page.tsx`

**Why:** Identical pattern: Next.js 15 dynamic route, `params` is a `Promise` that must be awaited, onboarding gate, parallel data loads, passes `id` to a client view component.

**Critical Next.js 15 pattern — params is a Promise** (lines 19–31, chat/[threadId]/page.tsx):
```typescript
interface ChatThreadPageProps {
  params: Promise<{ threadId: string }>;
}

export default async function ChatThreadPage({ params }: ChatThreadPageProps) {
  const profile = await getOrCreateProfile();
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  // MUST await params — Next.js 15 requirement
  const { threadId } = await params;
```
For Workflow Detail: replace `threadId` with `id`, fetch workflow + versions + recent runs after awaiting `id`.

**Client view delegation** (lines 38–46, chat/[threadId]/page.tsx):
```tsx
  return (
    <div className="flex h-full overflow-hidden" data-testid="chat-thread-page">
      <ChatThreadView threadId={threadId} />
    </div>
  );
```
Workflow Detail RSC passes fetched data down to a `WorkflowDetailView` client shell.

---

### `app/app/activity/page.tsx` (RSC page, request-response)

**Analog:** `app/app/settings/page.tsx`

**Why:** Same RSC structure. Onboarding gate, single parallel-fetch for page 1 + filter defaults from `searchParams`, pass to client shell.

**searchParams in RSC** — Activity uses URL search params for filters. Copy the `settings/page.tsx` signature and add:
```typescript
interface ActivityPageProps {
  searchParams: Promise<Record<string, string>>;
}
export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  // await searchParams — Next.js 15 requirement (same as params)
  const filters = await searchParams;
```

---

### `app/app/home/page.tsx` (thin redirect — modify existing)

**Analog:** Self (existing file at `app/app/home/page.tsx`)

**Current state** (full file, 64 lines): Renders a profile details page.

**Required change** — replace body with a redirect:
```typescript
import { redirect } from 'next/navigation';
export default function HomePage() {
  redirect('/app/workflows');
}
```
The `next/navigation` import is already in the project. The existing `getOrCreateProfile()` import and rendering logic should be removed.

---

### `lib/actions/workflows.ts` (Server Actions, CRUD + Inngest trigger)

**Analog:** `app/app/approvals/actions.ts`

**Why:** Exact match. Both are `"use server"` files with: Zod input schemas at the top, a local `requireUserId()` helper (same implementation), `withUserRls()` for DB access, `inngest.send()` for one action (runNow mirrors approveItem), `revalidatePath()` at the end, typed return `{ success: true } | { error: string }`.

**Canonical `"use server"` + Zod + requireUserId shape** (lines 1–53, approvals/actions.ts):
```typescript
"use server";

import { z } from "zod";
import { createClient } from "@/lib/auth/server";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";

// ─── Input schemas ────────────────────────────────────────────────────────────

const EditWorkflowSchema = z.object({
  workflowId: z.string().uuid("Invalid workflow ID"),
  patch: z.object({
    name: z.string().min(1).max(256).optional(),
    description: z.string().max(2000).optional(),
    automation_level: z.enum(["L1", "L2", "L3"]).optional(),
    trigger_type: z.string().optional(),
    trigger_config: z.record(z.unknown()).optional(),
  }),
});

// ─── requireUserId helper ─────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Not authenticated");
  }
  return userId;
}
```
Copy this exact `requireUserId()` shape — it appears in `approvals/actions.ts` lines 45–53 and is the canonical form.

**Canonical action shape** (lines 75–118, approvals/actions.ts — approveItem):
```typescript
export async function approveItem(
  approvalId: string,
  path: "inline" | "inbox"
): Promise<ApproveResult> {
  // 1. Validate
  const parsed = ApproveSchema.safeParse({ approvalId, path });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  // 2. Authenticate
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Not authenticated" };
  }
  // 3. Business logic (ownership check + DB + Inngest)
  // ...
  // 4. revalidatePath
  revalidatePath("/app/approvals");
  return { success: true };
}
```
Every action in `lib/actions/workflows.ts` and `lib/actions/activity.ts` follows this exact shape: validate → authenticate → business logic → revalidatePath → return typed result.

**inngest.send pattern** (lines 107–112, approvals/actions.ts):
```typescript
  await inngest.send({
    name: "approval.resolved",
    data: { approvalId, decision: "approved" },
  });
```
`runNow` uses this exact pattern with `name: "workflow.run_requested"`.

---

### `lib/actions/activity.ts` (Server Actions, CRUD + transaction)

**Analog:** `app/app/approvals/actions.ts`

**Why:** Same `"use server"` + Zod + `requireUserId()` + `withUserRls()` shape. `revertActivity` maps cleanly to `approveItem` (ownership check → DB write → external effect → revalidatePath).

**CRITICAL difference from approvals pattern:** `revertActivity` and `bulkRevertActivity` call `withUserRls()` directly (not `resolveApprovalRow`) because they need Drizzle transactions. Copy the `withUserRls()` callback pattern from `app/app/chat/actions.ts` lines 91–106:
```typescript
  const [row] = await withUserRls(claims as Record<string, unknown>, async (tx) => {
    return tx
      .insert(threads)
      .values({ ... })
      .returning();
  }) as Array<{ id: string }>;
```
Note: `withUserRls` takes `claims` as first arg (not `userId`). Claims come from `supabase.auth.getClaims()`.

**Important note on `withUserRls` signature** — the function signature in `lib/db/client.ts` line 95 is:
```typescript
export async function withUserRls<T>(
  claims: Record<string, unknown>,
  fn: (tx: RlsTx) => Promise<T>
): Promise<T>
```
Not `userId` — must pass the full claims object from `supabase.auth.getClaims()`. This is the pattern in `chat/actions.ts`, not the simplified `requireUserId()` + `serviceDb` pattern in `approvals/actions.ts`. For Phase 3 Server Actions, use the `chat/actions.ts` approach: get claims, then pass to `withUserRls`.

---

### `lib/workflows/versions.ts` (transaction helper, CRUD)

**Analog:** `lib/workflows/approvals.ts`

**Why:** Same pattern: server-only module, receives `userId` + inputs, performs multi-step DB operation, returns a typed result. `createApproval` (lines 69–103) is the closest shape — INSERT → return ID.

**Server-only module header** (lines 1–18, approvals.ts):
```typescript
/**
 * lib/workflows/versions.ts
 * ...
 * SECURITY:
 *   - Uses withUserRls context — every call MUST be inside a withUserRls() callback
 *   - Server-only module.
 */
```

**Multi-step DB operation with serviceDb** (lines 76–102, approvals.ts):
```typescript
  const [row] = await serviceDb
    .insert(approvals)
    .values({ ... })
    .returning();

  if (!row) {
    throw new Error("createApproval: insert returned no rows");
  }

  return row.id;
```
`createWorkflowVersion` uses `db.transaction()` (a Drizzle tx from `withUserRls`) rather than `serviceDb` — but the insert+returning+null-check pattern is identical.

**Ownership check shape before write** (lines 120–135, approvals.ts):
```typescript
  const [existing] = await serviceDb
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)))
    .limit(1);

  if (!existing) {
    return null;
  }
```
`createWorkflowVersion` does the same: SELECT current version, null-check, then proceed. Copy this exact ownership-before-write pattern.

---

### `lib/workflows/revert.ts` (utility — pure function + executor)

**Analog:** `lib/workflows/activity.ts`

**Why:** Same module type — server-only utility with explicit `userId` parameter. `writeActivity` is the entry point for writing revert_* entries (the revert flow calls `writeActivity()` directly from `lib/workflows/activity.ts`).

**The `is_revertable: false` flag** (line 101, activity.ts):
```typescript
      is_revertable: input.is_revertable ?? true,
```
Revert entries MUST pass `is_revertable: false` when calling `writeActivity`. This is the sole new caller convention introduced in Phase 3.

**Explicit userId, never inferred** (lines 80–83, activity.ts):
```typescript
export async function writeActivity(
  userId: string,
  input: WriteActivityInput
): Promise<void> {
```
`canRevert()` itself is a pure function (no DB, no userId). The `revertActivity` executor that wraps it follows this same explicit-userId signature.

**No-op on conflict** (line 104, activity.ts):
```typescript
    .onConflictDoNothing();
```
Revert entries use the same idempotency — if Inngest retries, the second `writeActivity` call for the revert_* entry is a no-op.

---

### `supabase/migrations/0005_activity_indexes.sql` (migration)

**Analog:** `supabase/migrations/0004_realtime_authz.sql`

**Why:** Exact same file format: header comment block with phase/purpose, `ALTER TABLE IF EXISTS ... ENABLE ROW LEVEL SECURITY`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `realtime.topic()` regex pattern for RLS policy USING clause.

**File header pattern** (lines 1–17, 0004_realtime_authz.sql):
```sql
-- 0005_activity_indexes.sql
-- Phase 3: composite indexes for Activity log filter performance (ACT-07)
--          + Realtime RLS policies for activity:<userId> and runs:<workflowId> channels.
-- Applied via: npx supabase db push (never drizzle-kit migrate)
-- Forward-only. Idempotent (CREATE INDEX IF NOT EXISTS, drop-if-exists then create).
```

**Realtime RLS policy shape** (lines 22–36, 0004_realtime_authz.sql):
```sql
ALTER TABLE IF EXISTS "realtime"."messages" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authn can receive own thread channel" ON "realtime"."messages";
CREATE POLICY "authn can receive own thread channel"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^thread:[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = (split_part(realtime.topic(), ':', 2))::uuid
        AND t.user_id = (SELECT auth.uid())
    )
  );
```
Phase 3's `activity:<userId>` policy simplifies this: no EXISTS subquery needed, just `(split_part(realtime.topic(), ':', 2))::uuid = (SELECT auth.uid())` directly.

**Index DDL pattern** (lines 40–43, 0003_phase2_tables.sql):
```sql
CREATE INDEX IF NOT EXISTS "idx_workflows_user_status" ON "workflows" USING btree ("user_id", "status");
```
All Phase 3 indexes follow this `CREATE INDEX IF NOT EXISTS "name" ON "table" USING btree (cols)` form.

---

### `components/workflows/inline-editable-text.tsx` (client component, click-to-edit)

**Analog:** `components/chat/inline-approval-card.tsx`

**Why:** Best available analog for a client component with `useState` + async handler + `isPending` guard. No click-to-edit component exists yet; the pattern is: `"use client"`, named export, typed props, `useState` for local state, async mutation handler with try/catch, `isPending` guard.

**`"use client"` + useState + async handler shape** (lines 1–30, inline-approval-card.tsx):
```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
// ...

export function InlineApprovalCard({ ... }: InlineApprovalCardProps) {
  const [status, setStatus] = useState<ApprovalStatus>(initialStatus);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

**Async mutation with isPending guard** (lines 186–203, inline-approval-card.tsx):
```typescript
  const handleApprove = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await approveItem(approvalId, "inline");
      if ("error" in result) {
        setError(result.error);
      } else {
        setStatus("approved");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setIsPending(false);
    }
  }, [approvalId, isPending]);
```
`InlineEditableText.handleBlur` uses the same `setIsPending(true) → await onSave() → setIsPending(false)` shape, minus the `useCallback` since blur is a DOM event (not a button handler).

**Accessible button disabled state** (lines 567–572, inline-approval-card.tsx):
```tsx
        <button
          type="button"
          onClick={handleReject}
          disabled={isPending}
          aria-label={`Reject: ${summary}`}
          style={{ cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.5 : 1 }}
        >
```

---

### `components/workflows/recent-activity-strip.tsx` (client component, Realtime)

**Analog:** `components/chat/inline-approval-card.tsx` (Realtime subscription useEffect block, lines 136–181)

**Why:** The `inline-approval-card.tsx` Realtime block is the canonical `createBrowserClient + setAuth + channel.subscribe + cleanup` pattern in the codebase. `recent-activity-strip.tsx` subscribes to two tables (activity_entries + approvals) instead of one, but the hook structure is identical.

**Canonical Realtime subscription pattern** (lines 136–181, inline-approval-card.tsx):
```typescript
  useEffect(() => {
    if (status !== "pending") return; // guard — skip when resolved

    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      channel = supabase.channel(`approval:${approvalId}`, {
        config: { private: true },
      });

      channel
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "approvals",
          filter: `id=eq.${approvalId}`,
        }, (payload) => {
          // handle update
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [approvalId, status]);
```
For `recent-activity-strip.tsx` with `activity_entries`: filter is `user_id=eq.${userId}`, event is `INSERT`, no `{ private: true }` (public channel). Channel name is `activity:${userId}`.

**Also see:** `message-stream.tsx` lines 82–104 for the `thread:<id>` variant using `supabase.removeChannel(channel)` instead of `channel?.unsubscribe()`. Use `removeChannel` (the message-stream variant) — it's the newer cleanup API.

---

### `components/workflows/run-now-dialog.tsx` (client component, dialog)

**Analog:** `app/app/settings/_connections.tsx` (Radix Dialog usage)

**Why:** The `_connections.tsx` file demonstrates the shadcn/Radix Dialog pattern: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose` imports and layout. `run-now-dialog.tsx` is a confirmation dialog before calling `runNow`.

**Dialog import block** (lines 28–36, _connections.tsx):
```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
```

**useTransition for pending state** (line 23, _connections.tsx):
```typescript
import { useState, useTransition } from "react";
```
`run-now-dialog.tsx` uses `useTransition` for the "Running..." pending state after the user confirms.

---

### `components/activity/bulk-revert-modal.tsx` (client component, confirmation dialog)

**Analog:** `app/app/settings/_connections.tsx`

**Why:** Same Dialog primitive usage + destructive confirm pattern. The Settings disconnect confirm dialog is the closest analog — shows a warning, requires confirmation, then calls a Server Action.

**Destructive confirm dialog shape** (from `_connections.tsx`, the ConnectionRow client component's disconnect handler — full component body starting line 80+): uses `Dialog` with `DialogFooter` containing a cancel + destructive button pair.

Copy the same:
- `useState<boolean>` for `open` dialog state
- Cancel button calls `DialogClose`
- Confirm button calls Server Action, is disabled while `isPending`
- Error display inside Dialog body if action returns `{ error }`

---

### `components/activity/revert-tooltip.tsx` (client component, accessible tooltip)

**No close analog** — no Radix Tooltip usage exists in the codebase yet. Use the Radix `@radix-ui/react-tooltip` primitive (already installed via shadcn dependency chain). RESEARCH.md confirms: "Radix Tooltip handles keyboard navigation, focus, aria-describedby automatically."

Pattern from RESEARCH.md — use:
```typescript
import * as Tooltip from "@radix-ui/react-tooltip";

<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <button disabled aria-describedby="revert-reason">Revert</button>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content id="revert-reason">
        {REVERT_REASON_LABELS[reason]}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

---

### `lib/auth/middleware.ts` (modify existing — add redirect)

**Analog:** Self (file at `lib/auth/middleware.ts`)

**Current redirect guard block** (lines 88–98, middleware.ts):
```typescript
  const { pathname } = request.nextUrl;
  const isAppRoute = pathname.startsWith("/app");
  const isOnboardingRoute = pathname.startsWith("/onboarding");

  // Guard 1: Unauthenticated requests to /app/* → /login (T-1-04-02)
  if (!claims && isAppRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl, { status: 307 });
  }
```

**Insert before Guard 1** (new lines to add after `const { pathname } = ...`):
```typescript
  // D-16: Bare /app and /app/home → /app/workflows (default landing flip)
  if (pathname === '/app' || pathname === '/app/' || pathname === '/app/home') {
    return NextResponse.redirect(new URL('/app/workflows', request.url), { status: 307 });
  }
```
This is the only change to `lib/auth/middleware.ts`. The `app/app/home/page.tsx` also becomes a thin `redirect('/app/workflows')` as a belt-and-suspenders.

---

## Shared Patterns

### Authentication — requireUserId() in Server Actions
**Source:** `app/app/approvals/actions.ts` lines 45–53
**Apply to:** All files in `lib/actions/workflows.ts` and `lib/actions/activity.ts`
```typescript
async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Not authenticated");
  }
  return userId;
}
```
Note: `lib/actions/` Server Actions that call `withUserRls()` need the full `claims` object, not just `userId`. Get claims as `const { data } = await supabase.auth.getClaims(); const claims = data?.claims;` then pass `claims as Record<string, unknown>` to `withUserRls`. See `app/app/chat/actions.ts` lines 82–91 for the full pattern.

### RLS-Scoped DB Access — withUserRls
**Source:** `lib/db/client.ts` lines 95–109
**Apply to:** All Server Actions and lib functions in Phase 3 that do web-tier reads/writes
```typescript
export async function withUserRls<T>(
  claims: Record<string, unknown>,
  fn: (tx: RlsTx) => Promise<T>
): Promise<T>
```
Always pass `claims` (from `supabase.auth.getClaims()`), never `userId`. RLS is enforced at DB layer. Code-level `user_id` filters are defense-in-depth, not the primary guard.

### Realtime Subscription — createBrowserClient + setAuth + cleanup
**Source:** `components/chat/inline-approval-card.tsx` lines 136–181 (private channel) and `components/chat/message-stream.tsx` lines 82–104 (public channel)
**Apply to:** `components/workflows/recent-activity-strip.tsx`, Workflow Detail runs panel
```typescript
  useEffect(() => {
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      channel = supabase.channel(`activity:${userId}`)
        .on('postgres_changes', { ... }, handler)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);  // use removeChannel, not unsubscribe
    };
  }, [userId]);
```
The `cancelled` flag prevents the async setup from running after the effect cleanup fires (StrictMode double-mount safety — see RESEARCH.md Pitfall 2).

### Error Handling in Server Actions
**Source:** `app/app/approvals/actions.ts` pattern throughout
**Apply to:** All Server Actions
```typescript
// Return typed union — never throw from a Server Action
export type MyActionResult = { success: true } | { error: string };

// In action body:
try {
  // business logic
  return { success: true };
} catch (err) {
  return { error: String(err) };
}
```
Never throw from a Server Action — always return `{ error: string }`. The client checks `"error" in result`.

### Zod Input Validation
**Source:** `app/app/chat/actions.ts` lines 35–48 and `app/app/approvals/actions.ts` lines 33–42
**Apply to:** All Server Actions in `lib/actions/workflows.ts` and `lib/actions/activity.ts`
```typescript
const MySchema = z.object({
  id: z.string().uuid("id must be a UUID"),
  // ...
});

const parsed = MySchema.safeParse(input);
if (!parsed.success) {
  return { error: parsed.error.errors[0]?.message ?? "invalid input" };
}
```

### revalidatePath after mutations
**Source:** `app/app/approvals/actions.ts` lines 114–115
**Apply to:** All mutating Server Actions
```typescript
  revalidatePath("/app/workflows");
  revalidatePath(`/app/workflows/${workflowId}`);
  revalidatePath("/app/activity");
```
`editWorkflow` revalidates both the list and the detail. `revertActivity` revalidates `/app/activity`.

### Observability-before-effect
**Source:** `lib/workflows/activity.ts` lines 13–15 (module docstring invariant)
**Apply to:** `lib/actions/activity.ts` — `revertActivity` and `bulkRevertActivity`

The `writeActivity()` call for the `revert_*` entry MUST be placed before the call to the external Shopify/Gmail adapter. If the adapter fails and Inngest retries, the second `writeActivity` is a no-op (`onConflictDoNothing`). Violating this ordering breaks the WF-06 invariant.

### CSS Token Convention
**Source:** `app/app/settings/page.tsx` lines 43–57 and `components/chat/inline-approval-card.tsx` throughout
**Apply to:** All Phase 3 components
```tsx
// Use OKLCH token vars — never raw hex except as fallback in inline styles
className="text-[var(--text)] bg-[var(--bg)] border-[var(--border)]"

// Inline styles (legacy components) use CSS var with fallback:
style={{ color: "var(--text, #111827)" }}
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `components/activity/revert-tooltip.tsx` | component | request-response | No Radix Tooltip usage exists in codebase yet; first use of this primitive |

---

## Metadata

**Analog search scope:** `app/app/`, `lib/workflows/`, `lib/actions/` (none yet — Phase 3 creates these), `lib/auth/`, `lib/db/`, `components/chat/`, `components/layout/`, `components/ui/`, `supabase/migrations/`
**Files scanned:** 28
**Pattern extraction date:** 2026-05-22

---

## Key Observations for Planner

1. **`withUserRls` takes `claims`, not `userId`** — this is the most likely place new Server Actions will diverge from the pattern. `approvals/actions.ts` uses a local `requireUserId()` that returns a string, then calls service-layer helpers (`resolveApprovalRow`) that use `serviceDb`. Phase 3 Server Actions call `withUserRls` directly, so they must get the full claims object. See `chat/actions.ts` lines 82–91 for the correct pattern.

2. **Next.js 15: `params` AND `searchParams` are Promises** — both dynamic route params and searchParams must be `await`ed in RSC page.tsx files. The existing `chat/[threadId]/page.tsx` demonstrates this for params. Activity page needs the same for searchParams.

3. **`supabase.removeChannel(channel)` not `channel.unsubscribe()`** — the newer cleanup API in `message-stream.tsx`. Use `removeChannel` consistently in all Phase 3 Realtime components.

4. **No `requireUserId` in `lib/` modules** — `lib/workflows/versions.ts` and `lib/workflows/revert.ts` receive `userId` and `db` (or `claims`) as parameters. Only Server Actions (`lib/actions/`) call `requireUserId()` and `withUserRls()`. The lib utilities are pure/testable functions with explicit inputs.

5. **Dialog component is already shipped** — `components/ui/dialog.tsx` exists from Phase 2. `run-now-dialog.tsx` and `bulk-revert-modal.tsx` import from it directly.
