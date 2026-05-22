# Phase 4: Polish — Effortless Daily Use - Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 22 new/modified files
**Analogs found:** 22 / 22

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/app/approvals/page.tsx` | page (RSC) | request-response | `app/app/activity/page.tsx` | exact |
| `app/app/approvals/_list.tsx` | component | request-response | `app/app/activity/_activity-view.tsx` | role-match |
| `app/app/approvals/_detail.tsx` | component | request-response | `app/app/activity/_activity-view.tsx` | role-match |
| `app/app/approvals/_inline-card.tsx` | component (client) | event-driven | `app/app/settings/_connections.tsx` | role-match |
| `app/app/approvals/_realtime-sync.tsx` | hook (client) | event-driven | `app/app/settings/_connections.tsx` (useTransition pattern) | partial |
| `app/app/approvals/actions.ts` (extend) | server-action | CRUD | `app/app/approvals/actions.ts` (self — extend) | exact |
| `app/app/settings/page.tsx` (extend) | page (RSC) | request-response | `app/app/settings/page.tsx` (self — extend) | exact |
| `app/app/settings/_brand-voice.tsx` | component (client) | CRUD | `app/app/settings/_connections.tsx` | role-match |
| `app/app/settings/_autonomy.tsx` | component (client) | CRUD | `app/app/settings/_connections.tsx` | role-match |
| `app/app/settings/_memory.tsx` | component (client) | CRUD | `app/app/settings/_connections.tsx` | role-match |
| `app/app/settings/_profile.tsx` | component (client) | CRUD | `app/app/settings/_connections.tsx` | role-match |
| `app/app/settings/_sessions.tsx` | component (client) | CRUD | `app/app/settings/_connections.tsx` | role-match |
| `app/app/settings/_danger.tsx` | component (client) | CRUD | `app/app/settings/_connections.tsx` | role-match |
| `app/app/settings/_notifications.tsx` | component (client) | request-response | `app/app/settings/_connections.tsx` | role-match |
| `app/app/settings/actions.ts` (extend) | server-action | CRUD | `app/app/settings/actions.ts` (self — extend) | exact |
| `lib/db/schema/user-sessions.ts` | model | CRUD | `lib/db/schema/memory-items.ts` | exact |
| `lib/inngest/functions/export-account-data.ts` | service | batch | `lib/inngest/functions/execute-workflow-run.ts` | role-match |
| `lib/inngest/functions/purge-account.ts` | service | event-driven | `lib/inngest/functions/execute-workflow-run.ts` | role-match |
| `lib/inngest/functions/execute-workflow-run.ts` (extend) | service | event-driven | self — extend autonomy override gate | exact |
| `lib/workflows/approvals.ts` (extend) | service | CRUD | self — extend | exact |
| `components/layout/sidebar.tsx` (extend) | component (client) | event-driven | self — extend badge | exact |
| `supabase/migrations/0006_*.sql` | migration | — | `supabase/migrations/0004_realtime_authz.sql` | exact |

---

## Pattern Assignments

### `app/app/approvals/page.tsx` (RSC, request-response)

**Analog:** `app/app/activity/page.tsx`

**Imports pattern** (lines 20–32):
```typescript
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/auth/server";
import { withUserRls } from "@/lib/db/client";
// + domain-specific imports (approvals schema, fetchPendingApprovals)
```

**Auth/gate pattern** (lines 44–57):
```typescript
const profile = await getOrCreateProfile();
if (!profile.onboarding_completed_at) {
  redirect("/onboarding");
}
const userId = profile.user_id;
const supabase = await createClient();
const { data } = await supabase.auth.getClaims();
const claims = data?.claims ?? null;
if (!claims?.sub) { redirect("/login"); }
```

**Core RSC pattern** (lines 80–115):
```typescript
// Await searchParams (Next.js 15)
const params = await searchParams;
// Parallel data load — pending approvals + badge count
const [pendingApprovals, pendingCount] = await Promise.all([
  fetchPendingApprovals(userId, { showSnoozed: false }),
  fetchPendingCount(userId),
]);
// Pass down to client island
return (
  <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)]" data-testid="approvals-page">
    <ApprovalsView userId={userId} initialApprovals={pendingApprovals} initialCount={pendingCount} />
  </div>
);
```

**Layout/header pattern** — settings/page.tsx lines 43–67 (two-column shell with SurfaceHeader):
```typescript
// Approvals uses same max-w-[800px] centering for detail panel;
// two-pane uses flex layout per design contract: 380px list + flex-1 detail
<div className="flex h-full">
  <div className="hidden md:block w-[380px] shrink-0 border-r border-[var(--border)]">
    {/* list panel */}
  </div>
  <div className="flex-1 overflow-y-auto">{/* detail panel */}</div>
</div>
```

---

### `app/app/approvals/_list.tsx` (RSC component, request-response)

**Analog:** `app/app/activity/_activity-view.tsx`

**SurfaceHeader pattern** (lines 44–99 of _activity-view.tsx):
```typescript
// Reuse same SurfaceHeader shape — kicker / title / subtitle
// kicker: font-mono text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]
// title: display text-[28px] tracking-[-0.015em]
// subtitle: text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]
```

**Select-mode + bulk-bar pattern** (D-12 reuse from Phase 3 Activity D-07):
```typescript
// "use client"
const [selectMode, setSelectMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
// Toggle per-row checkbox when selectMode=true
// Show bulk-action bar (approve/reject/snooze) when selectedIds.size > 0
```

**Filter chip pattern** — map over `['all', 'high', 'catalog', 'seo', 'q_a', 'inventory']`:
```typescript
// FilterChip design primitive from components.jsx
// Active chip: bg-[var(--acc-approval-bg)] text-[var(--acc-approval-ink)]
// Inactive: bg-[var(--bg-elevated)] text-[var(--text-secondary)]
```

---

### `app/app/approvals/_inline-card.tsx` (client component, event-driven)

**Analog:** `app/app/settings/_connections.tsx`

**Client state pattern** (lines 98–101 of _connections.tsx):
```typescript
"use client";
const [isPending, startTransition] = useTransition();
const [error, setError] = useState<string | null>(null);
// + approval-specific: const [editMode, setEditMode] = useState(false);
// + const [snoozPickerOpen, setSnoozPickerOpen] = useState(false);
```

**Action call pattern** (lines 111–121 of _connections.tsx):
```typescript
startTransition(async () => {
  setError(null);
  const result = await approveItem(approvalId, "inline");
  if (result && "error" in result) {
    setError(result.error);
    return;
  }
  // optimistic: card transitions to approved state
});
```

**Confirm dialog pattern** (lines 225–255 of _connections.tsx — reuse for snooze picker and reject-reason):
```typescript
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>...</DialogTitle>
      <DialogDescription>...</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild><Button variant="secondary" size="sm">Cancel</Button></DialogClose>
      <Button variant="primary" size="sm" onClick={handleConfirm} disabled={isPending} aria-busy={isPending}>
        {isPending ? "Saving…" : "Confirm"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**ARIA/accessibility pattern** (lines 140–214 of _connections.tsx):
```typescript
// All buttons: aria-label="Approve (A)" — text equivalent of keyboard shortcut
// Pending state: aria-busy={isPending}
// Error region: role="alert"
// data-testid attributes for Playwright e2e
```

---

### `app/app/approvals/_realtime-sync.tsx` (client hook, event-driven)

**Analog:** `lib/auth/client.ts` (Supabase client) + RESEARCH.md §1 pattern

**Imports pattern:**
```typescript
"use client";
import { createClient } from "@/lib/auth/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
```

**Core Realtime hook pattern** (from RESEARCH.md verified pattern):
```typescript
export function useApprovalsSync(userId: string, initialCount: number) {
  const [pendingCount, setPendingCount] = useState(initialCount);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("approvals-badge")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "approvals",
          filter: `user_id=eq.${userId}`,
        },
        (_payload) => {
          router.refresh(); // RSC re-render picks up fresh badge count
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel); // CRITICAL: prevents memory leak (Pitfall 1)
    };
  }, [userId, router]);

  return { pendingCount };
}
```

---

### `app/app/approvals/actions.ts` — extend with `snoozeItem`, `editItem`, `bulkResolve`, `revertApproved`

**Analog:** `app/app/approvals/actions.ts` lines 1–181 (self)

**File header / "use server" + imports** (lines 1–30):
```typescript
"use server";
import { z } from "zod";
import { createClient } from "@/lib/auth/server";
import { inngest } from "@/lib/inngest/client";
import { resolveApprovalRow } from "@/lib/workflows/approvals";
import { revalidatePath } from "next/cache";
// + for new actions:
import { serviceDb } from "@/lib/db/client";
import { approvals } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storeMemoryItem } from "@/lib/agent/memory";
import { canRevert, executeRevertEffect } from "@/lib/workflows/revert";
```

**Zod schema pattern** (lines 33–41):
```typescript
const SnoozeSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID"),
  snoozedUntil: z.string().datetime(),
});
const BulkResolveSchema = z.object({
  approvalIds: z.array(z.string().uuid()).min(1).max(100),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().max(500).optional(),
});
```

**requireUserId helper** (lines 44–53 — copy verbatim):
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

**Core action pattern** — validate → authenticate → ownership check → DB write → inngest (or not for snooze) → revalidatePath (lines 75–117):
```typescript
export async function snoozeItem(
  approvalId: string,
  snoozedUntil: string
): Promise<{ success: true } | { error: string }> {
  const parsed = SnoozeSchema.safeParse({ approvalId, snoozedUntil });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  let userId: string;
  try { userId = await requireUserId(); }
  catch { return { error: "Not authenticated" }; }
  // Ownership check (same pattern as resolveApprovalRow internals):
  const [existing] = await serviceDb
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)))
    .limit(1);
  if (!existing) return { error: "Approval not found or you do not have permission" };
  await serviceDb
    .update(approvals)
    .set({ status: "snoozed", snoozed_until: new Date(snoozedUntil) })
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)));
  // NOTE: snooze does NOT fire approval.resolved — workflow stays paused (A1 from RESEARCH.md)
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");
  return { success: true };
}
```

**reject-reason → memory pattern** (D-04 — extend rejectItem):
```typescript
// After resolveApprovalRow succeeds and before inngest.send:
if (reason) {
  await storeMemoryItem(userId, reason, "decision_history");
}
```

---

### `app/app/settings/page.tsx` — extend with new sections

**Analog:** `app/app/settings/page.tsx` lines 1–68 (self)

**Extension pattern** — add parallel data fetches + new section components:
```typescript
// In the existing Promise.all block, add:
const [shopifyHealth, gmailHealth, brandVoice, autonomyThresholds, memoryItemsList, profile] =
  await Promise.all([
    getIntegrationHealth(userId, "shopify"),
    getIntegrationHealth(userId, "gmail"),
    getBrandVoice(userId),
    getAutonomyThresholds(userId),
    getMemoryItems(userId),
    getUserProfile(userId),
  ]);

// In JSX, add new sections after ConnectionsSection:
<ConnectionsSection shopifyHealth={shopifyHealth} gmailHealth={gmailHealth} />
<BrandVoiceSection initialMarkdown={brandVoice?.profile_markdown} />
<AutonomySection thresholds={autonomyThresholds} />
<MemorySection items={memoryItemsList} />
<ProfileSection profile={profile} />
<SessionsSection userId={userId} />
<DangerSection userId={userId} />
<NotificationsSection />
```

**Section container pattern** (lines 59–66 of settings/page.tsx):
```typescript
<div className="mx-auto max-w-[800px] px-10 py-8">
  {/* each section is wrapped in <section aria-labelledby="..."> */}
</div>
```

---

### `app/app/settings/_brand-voice.tsx` through `_notifications.tsx` (client components, CRUD)

**Analog:** `app/app/settings/_connections.tsx` lines 1–322

**Section structure pattern** (lines 44–79 of _connections.tsx):
```typescript
"use client";
export function BrandVoiceSection({ initialMarkdown }: { initialMarkdown: string }) {
  return (
    <section aria-labelledby="brand-voice-heading">
      <div className="mb-5">
        <h2 id="brand-voice-heading" className="display text-[28px] tracking-[-0.015em] text-[var(--text)]">
          Brand Voice
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">...</p>
      </div>
      {/* section content */}
    </section>
  );
}
```

**Card/row container** (lines 136–141 of _connections.tsx):
```typescript
<div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-[18px] py-[18px]">
  {/* row content */}
</div>
```

**Error display pattern** (lines 214–221 of _connections.tsx):
```typescript
{error && (
  <p className="mt-3 text-[12.5px] text-[var(--danger)]" role="alert">
    {error}
  </p>
)}
```

**Pending/transition pattern** (lines 101–102, 248–249 of _connections.tsx):
```typescript
const [isPending, startTransition] = useTransition();
// On button: disabled={isPending} aria-busy={isPending}
// Button label: {isPending ? "Saving…" : "Save"}
```

**Danger confirm dialog** (lines 225–255 of _connections.tsx — mirror for delete account):
```typescript
// DangerSection delete account: Dialog with 2-step confirm (type "delete" to confirm)
// Same Radix Dialog pattern with focus-trap
```

---

### `app/app/settings/actions.ts` — extend with all new Settings Server Actions

**Analog:** `app/app/settings/actions.ts` lines 1–141 (self)

**File header / "use server" + imports** (lines 1–38):
```typescript
"use server";
import { createClient } from "@/lib/auth/server";
import { withUserRls, integrations } from "@/lib/db";
import { serviceDb } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
// + new schema imports for Phase 4 tables
import { brandVoiceProfiles, autonomyThresholds, memoryItems, userProfiles, userSessions } from "@/lib/db/schema";
import { encryptToken, decryptToken } from "@/lib/integrations/crypto";
import { inngest } from "@/lib/inngest/client";
```

**getValidatedClaims helper** (lines 45–53 of settings/actions.ts — copy verbatim):
```typescript
async function getValidatedClaims() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  if (!claims?.sub) {
    return { claims: null, error: "Not authenticated." };
  }
  return { claims, error: null };
}
```

**Core action pattern** (lines 69–111 of settings/actions.ts):
```typescript
export async function saveBrandVoice(
  markdown: string
): Promise<{ error: string } | void> {
  // 1. Validate input
  const parsed = BrandVoiceSchema.safeParse({ markdown });
  if (!parsed.success) return { error: "Invalid input" };
  // 2. Get authenticated user claims
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) return { error: error ?? "Not authenticated." };
  const userId = claims.sub as string;
  // 3. Encrypt before storing (security baseline)
  const encrypted = await encryptToken(parsed.data.markdown);
  // 4. Upsert via serviceDb with explicit user_id filter
  await serviceDb
    .update(brandVoiceProfiles)
    .set({ profile_markdown: encrypted, updated_at: new Date() })
    .where(eq(brandVoiceProfiles.user_id, userId));
  revalidatePath("/app/settings");
}
```

**inngest.send pattern for background jobs** (mirrors approvals/actions.ts lines 108–111):
```typescript
export async function exportAccountData(): Promise<{ status: "initiated" } | { error: string }> {
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) return { error: error ?? "Not authenticated." };
  await inngest.send({ name: "account.export_requested", data: { userId: claims.sub } });
  return { status: "initiated" };
}
```

**Initiation gate + Inngest send for delete** (D-09):
```typescript
export async function requestAccountDeletion(): Promise<{ error: string } | void> {
  const { claims, error } = await getValidatedClaims();
  if (error || !claims) return { error: error ?? "Not authenticated." };
  const userId = claims.sub as string;
  // Gate: no running/paused runs
  const activeRuns = await serviceDb.select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.user_id, userId), inArray(workflowRuns.status, ["running", "paused_for_approval"])))
    .limit(1);
  if (activeRuns.length > 0) return { error: "Cannot delete while a workflow run is in progress." };
  await inngest.send({ name: "account.deletion_requested", data: { userId } });
}
```

---

### `lib/db/schema/user-sessions.ts` (model, CRUD)

**Analog:** `lib/db/schema/memory-items.ts` lines 1–96

**Table definition pattern** (lines 27–96 of memory-items.ts):
```typescript
import { pgTable, uuid, text, timestamp, pgPolicy, index } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),           // FK to auth.users(id) ON DELETE CASCADE in migration SQL
    supabase_session_id: text("supabase_session_id"),
    refresh_token_hash: text("refresh_token_hash"),
    device_label: text("device_label").notNull(),
    raw_ua: text("raw_ua"),
    ip_geo_label: text("ip_geo_label"),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_user_sessions_user").on(table.user_id, table.last_seen_at),
    pgPolicy("user_sessions_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
```

**Schema export pattern** — add to `lib/db/schema/index.ts`:
```typescript
// Phase 4
export { userSessions } from "./user-sessions";
```

---

### `lib/inngest/functions/export-account-data.ts` (service, batch)

**Analog:** `lib/inngest/functions/shopify-sync.ts` lines 37–62 (shopifyFullSync shape) + `execute-workflow-run.ts` step.run pattern

**Function declaration pattern** (lines 37–46 of shopify-sync.ts):
```typescript
export const exportAccountData = inngest.createFunction(
  {
    id: "export-account-data",
    retries: 2,
    // No concurrency key — one export at a time per user is enforced by the gate in the Server Action
  },
  { event: "account.export_requested" },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };
    // All serviceDb queries must filter by userId (serviceDb bypasses RLS)
  }
);
```

**step.run pattern** (lines 51–61 of shopify-sync.ts + execute-workflow-run lines 99–153):
```typescript
const bundle = await step.run("assemble-bundle", async () => {
  // Query all user-owned tables filtered by userId
  // Return structured JSON object
  return { workflows: [], activity: [], memory: [], brandVoice: {} };
});

const { signedUrl } = await step.run("upload-to-storage", async () => {
  const bytes = Buffer.from(JSON.stringify(bundle, null, 2));
  const path = `exports/${userId}/${Date.now()}-export.json`;
  const { error } = await supabaseAdmin.storage
    .from("user-exports")
    .upload(path, bytes, { contentType: "application/json", upsert: true });
  if (error) throw error;
  const { data } = await supabaseAdmin.storage
    .from("user-exports")
    .createSignedUrl(path, 60 * 60 * 24);
  return { signedUrl: data?.signedUrl };
});

await step.run("notify-user", async () => {
  // Update a user_exports row or user_profiles with the signed URL
});

return { signedUrl };
```

**Observability pattern** (from execute-workflow-run.ts comments — WF-06):
```typescript
// Log before any external effect (Storage upload counts as external write)
console.log(JSON.stringify({ level: "info", event: "account.export.started", userId, timestamp: new Date().toISOString() }));
```

---

### `lib/inngest/functions/purge-account.ts` (service, event-driven)

**Analog:** `lib/inngest/functions/execute-workflow-run.ts` lines 83–96 (function declaration + concurrency) + RESEARCH.md §4 pattern

**Function declaration with cancelOn** (critical — CEL field order, Pitfall 7 in RESEARCH.md):
```typescript
export const purgeAccount = inngest.createFunction(
  {
    id: "purge-account",
    retries: 2,
    cancelOn: [{
      event: "account.deletion_cancelled",
      // CRITICAL CEL ORDER: async = the waited-for/cancelled event; event = original trigger
      // Mirrors the execute-workflow-run.ts CEL pattern (Pitfall 1 comment, lines 10–17)
      if: "async.data.userId == event.data.userId",
    }],
  },
  { event: "account.deletion_requested" },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };
  }
);
```

**step.run + step.sleep pattern**:
```typescript
await step.run("lock-account", async () => {
  await serviceDb
    .update(userProfiles)
    .set({ deletion_requested_at: new Date() })
    .where(eq(userProfiles.user_id, userId));
  // + abort active workflow runs
});

await step.sleep("grace-period", "7d");

await step.run("hard-delete", async () => {
  try {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  } catch (err) {
    // Ignore "user not found" on retry (idempotency per execute-workflow-run.ts T-2-07-03)
    if (!(err instanceof Error && err.message.includes("not found"))) throw err;
  }
});
```

---

### `lib/inngest/functions/execute-workflow-run.ts` — autonomy override gate (extend)

**Analog:** self, lines 180–209 (L1/L2 branch decision point)

**Insertion point** — add BEFORE the L2 branch check at line 209 (`if (workflow.automation_level === "L2" && stepResult.requiresApproval)`):
```typescript
// ── Autonomy override gate (D-07b, Phase 4) ──────────────────────────────────
// Read per-action overrides from autonomy_thresholds (serviceDb — filter by userId)
const [thresholdRow] = await serviceDb
  .select()
  .from(autonomyThresholds)
  .where(eq(autonomyThresholds.user_id, userId))
  .limit(1);

const overrides = (thresholdRow?.per_action_overrides ?? {}) as Record<string, string>;
const overrideLevel = overrides[workflowStep.tool]; // e.g. "L2" forces approval on L3 tool

// D-06: overrides can only ADD friction (never loosen)
// levelOrder: L1=1, L2=2, L3=3; lower number = more restrictive
const levelOrder: Record<string, number> = { L1: 1, L2: 2, L3: 3 };
const workflowLevelNum = levelOrder[workflow.automation_level] ?? 2;
const overrideLevelNum = overrideLevel ? (levelOrder[overrideLevel] ?? 2) : workflowLevelNum;
const effectiveAutomationLevel =
  overrideLevelNum < workflowLevelNum
    ? overrideLevel!   // override is more restrictive — use it
    : workflow.automation_level; // workflow level is already tighter (or equal)

// Use effectiveAutomationLevel instead of workflow.automation_level in the L2 branch check:
if (effectiveAutomationLevel === "L2" && stepResult.requiresApproval) {
  // ... existing L2 pause + waitForEvent code ...
}
```

---

### `lib/workflows/approvals.ts` — extend with `snoozeApproval`, `bulkResolveApprovals`

**Analog:** self, lines 105–151 (`resolveApprovalRow`)

**Extension pattern** — new helper below resolveApprovalRow with same structure:
```typescript
export async function snoozeApproval(
  approvalId: string,
  userId: string,
  snoozedUntil: Date
): Promise<string | null> {
  // Ownership check — same pattern as resolveApprovalRow lines 128–136
  const [existing] = await serviceDb
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)))
    .limit(1);
  if (!existing) return null;
  await serviceDb
    .update(approvals)
    .set({ status: "snoozed", snoozed_until: snoozedUntil })
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)));
  return approvalId;
}
```

---

### `components/layout/sidebar.tsx` — badge decrement (extend)

**Analog:** self, lines 1–147

**Badge extension pattern** — wrap the Approvals NavLink to accept and display a count badge:
```typescript
// Extend NAV_ITEMS or add a badge prop to NavLink:
// The Approvals nav item receives pendingCount from the layout (RSC server fetch)
// A "use client" BadgeCount wrapper subscribes to useApprovalsSync

// In the NavLink JSX, after <span className="flex-1 truncate">{item.label}</span>:
{pendingCount > 0 && (
  <span
    className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--acc-approval)] px-1 font-mono text-[10px] text-white"
    aria-label={`${pendingCount} pending approvals`}
  >
    {pendingCount > 99 ? "99+" : pendingCount}
  </span>
)}
```

**focus-visible pattern** (line 77 of sidebar.tsx — already established):
```typescript
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
// All new interactive elements in Phase 4 use this pattern
```

---

### `supabase/migrations/0006_*.sql` (migration)

**Analog:** `supabase/migrations/0004_realtime_authz.sql` (header convention + structure) and `0005_activity_indexes.sql`

**Migration header pattern** (lines 1–17 of 0004_realtime_authz.sql):
```sql
-- 0006_phase4_sessions_exports.sql
-- Phase 4: user_sessions table (AUTH-04/05), performance indexes, storage bucket.
--
-- Closes: D-10 (custom session registry), UX-04 (performance indexes).
-- Forward-only. Idempotent (IF NOT EXISTS guards throughout).
```

**Table creation pattern** — follows `user_sessions` schema above + matching RLS policy.

**Performance index additions** (UX-04, from RESEARCH.md §5):
```sql
-- approvals: pending list query (partial index on status='pending')
CREATE INDEX IF NOT EXISTS "idx_approvals_user_pending_stakes"
  ON "approvals" ("user_id", "stakes", "created_at" DESC)
  WHERE status = 'pending';

-- workflows: My Workflows surface
CREATE INDEX IF NOT EXISTS "idx_workflows_user_status"
  ON "workflows" ("user_id", "status", "updated_at" DESC);
```

**Realtime policy extension** (follows 0004 pattern for new `approvals-badge` postgres_changes):
```sql
-- The existing approvals RLS (migration 0003) already gates postgres_changes
-- subscriptions by table RLS — no new realtime.messages policy needed for
-- the badge channel (uses postgres_changes, not private broadcast).
-- See RESEARCH.md §1: "Postgres Changes with filter: user_id=eq.${userId} is sufficient."
```

---

## Shared Patterns

### Authentication (`requireUserId` / `getValidatedClaims`)

**Source:** `app/app/approvals/actions.ts` lines 44–53 (`requireUserId`) and `app/app/settings/actions.ts` lines 45–53 (`getValidatedClaims`)

**Apply to:** All new Server Actions (snoozeItem, editItem, bulkResolve, revertApproved, saveBrandVoice, regenerateBrandVoice, saveAutonomyThresholds, memory CRUD, revokeSession, signOutEverywhere, exportAccountData, requestAccountDeletion, cancelDeletion)

```typescript
// Variant 1 (throws — for actions that return typed Result union):
async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") throw new Error("Not authenticated");
  return userId;
}

// Variant 2 (returns error object — for actions that return { error } | void):
async function getValidatedClaims() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  if (!claims?.sub) return { claims: null, error: "Not authenticated." };
  return { claims, error: null };
}
```

### Ownership Re-Check Before Write

**Source:** `lib/workflows/approvals.ts` lines 128–137 (`resolveApprovalRow` ownership check) and `app/app/settings/actions.ts` lines 87–96 (withUserRls delete pattern)

**Apply to:** All new approval Server Actions (snoozeItem, editItem, bulkResolve, revertApproved) and settings mutations that touch user-owned rows

```typescript
// Pattern: SELECT by (id + user_id) before any UPDATE/DELETE — return early if not found
const [existing] = await serviceDb
  .select()
  .from(targetTable)
  .where(and(eq(targetTable.id, rowId), eq(targetTable.user_id, userId)))
  .limit(1);
if (!existing) return { error: "Not found or you do not have permission" };
// Then proceed with the write
```

### Zod Input Validation

**Source:** `app/app/approvals/actions.ts` lines 33–41 + `app/app/settings/actions.ts` lines 40–41

**Apply to:** Every new Server Action's first step — validate all inputs before any auth check

```typescript
const Schema = z.object({ ... });
const parsed = Schema.safeParse(input);
if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
```

### Drizzle Table + RLS Pattern

**Source:** `lib/db/schema/memory-items.ts` lines 27–96 (most complete example with index + policy)

**Apply to:** `lib/db/schema/user-sessions.ts` and any other new schema files

```typescript
// Pattern: pgTable + enableRLS() + pgPolicy with (SELECT auth.uid()) form
pgPolicy("table_user_policy", {
  as: "permissive",
  for: "all",
  to: authenticatedRole,
  using: sql`(SELECT auth.uid()) = ${table.user_id}`,
  withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
})
```

### Encryption at Rest

**Source:** `lib/integrations/crypto.ts` lines 51–105 (`encryptToken` / `decryptToken`)

**Apply to:** `saveBrandVoice` Server Action before DB write; `getBrandVoice` Server Action on read

```typescript
import { encryptToken, decryptToken } from "@/lib/integrations/crypto";
// Write: const encrypted = await encryptToken(plaintext);
// Read:  const plaintext = await decryptToken(encrypted);
// Wrap decryptToken in try-catch — throws on tampered ciphertext
```

### Inngest step.run + serviceDb + user_id Filter

**Source:** `lib/inngest/functions/execute-workflow-run.ts` lines 99–153

**Apply to:** `export-account-data.ts` and `purge-account.ts` — every serviceDb query inside step.run MUST include `.where(eq(table.user_id, userId))` (serviceDb bypasses RLS)

```typescript
const result = await step.run("step-name", async () => {
  const rows = await serviceDb
    .select()
    .from(someTable)
    .where(eq(someTable.user_id, userId)) // REQUIRED — serviceDb bypasses RLS
    .limit(n);
  return rows;
});
```

### CEL Async/Event Field Order in cancelOn

**Source:** `lib/inngest/functions/execute-workflow-run.ts` lines 10–17 (critical pitfall comment) + lines 322–328 (`waitForEvent` with `async.data.approvalId`)

**Apply to:** `purge-account.ts` `cancelOn` `if` expression

```typescript
// CORRECT:
if: "async.data.userId == event.data.userId"
// async = the event being waited for / cancelled (account.deletion_cancelled)
// event = the original trigger (account.deletion_requested)
// DO NOT use event.data.userId on both sides — that is a SILENT wrong-cancel bug
```

### revalidatePath After Every Mutation

**Source:** `app/app/approvals/actions.ts` lines 114–115 + `app/app/settings/actions.ts` line 111

**Apply to:** All Server Actions that mutate visible state

```typescript
revalidatePath("/app/approvals");
revalidatePath("/app/chat");  // for approval actions that affect inline cards
// Settings actions: revalidatePath("/app/settings");
```

### WCAG 2.1 AA / Accessibility Baseline

**Source:** `app/app/settings/_connections.tsx` lines 140–255 (aria-label, role="alert", aria-busy, focus-visible, Radix Dialog focus-trap)

**Apply to:** All new client components (approval list rows, detail panel, inline card, settings sections)

```typescript
// Button accessibility:
aria-label="Approve (A)"      // text equivalent of keyboard shortcut
aria-busy={isPending}         // signals loading state to SR
disabled={isPending}

// Error message:
role="alert"                  // announced immediately by SR

// Status badge:
role="status" aria-label="..."  // text label, not color alone

// Focus-visible ring (line 77 of sidebar.tsx):
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"

// Keyboard handler: scope to panel, skip input/textarea targets (Pitfall 5 in RESEARCH.md)
const handler = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
  if (!target.closest("[data-approval-detail]")) return;
  // handle A/R/E/S/ArrowUp/ArrowDown
};
```

---

## No Analog Found

All Phase 4 files have close analogs in the live codebase. The table below notes files where the codebase analog covers the structure but the specific functionality is novel.

| File | Role | Data Flow | Novel Aspect |
|---|---|---|---|
| `app/app/approvals/_realtime-sync.tsx` | hook | event-driven | Supabase Realtime `postgres_changes` — pattern is from RESEARCH.md; no live hook exists yet |
| `lib/inngest/functions/export-account-data.ts` | service | batch | `step.sleep` not yet used; `supabaseAdmin.storage` upload pattern not yet in codebase |
| `lib/inngest/functions/purge-account.ts` | service | event-driven | `cancelOn` not yet used in codebase; pattern from RESEARCH.md + execute-workflow-run CEL comment |

For these three, the RESEARCH.md code examples are the implementation reference; the analog files above provide the surrounding structure (function declaration shape, serviceDb usage, step.run wrapping).

---

## Metadata

**Analog search scope:** `app/app/`, `lib/inngest/functions/`, `lib/db/schema/`, `lib/workflows/`, `lib/agent/`, `lib/integrations/`, `components/layout/`, `supabase/migrations/`
**Files scanned:** 32 source files read across 8 directories
**Pattern extraction date:** 2026-05-22
