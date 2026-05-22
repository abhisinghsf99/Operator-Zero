# Phase 4: Polish — Effortless Daily Use - Research

**Researched:** 2026-05-22
**Domain:** Approvals UI, Settings (brand voice / autonomy / memory / sessions / export / delete), Mobile parity, WCAG 2.1 AA, Performance
**Confidence:** HIGH (core stack and patterns verified against live code and official docs; session registry and Realtime sync patterns verified; low-confidence items explicitly flagged)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Edit = inline-editable preview inside the inline card and the Inbox detail. NOT a bounce-to-chat.
- **D-02:** Snooze = quick presets (1h / this evening / tomorrow / pick a time). Snoozed items hidden by default behind a toggle; reappear sorted to top at return time.
- **D-03:** Stale/drift: on open, re-read current underlying state. If drifted, show "data changed since proposed" banner and require re-confirm. Hard-expired approvals (14d) auto-withdraw quietly.
- **D-04:** Reject reason → durable memory item (`lib/agent/memory.ts` + `memory-items`/`memory-embeddings`), surfaces in "What I Remember" (SET-04).
- **D-04b:** Inbox revert (APRV-07) reuses `canRevert()` (`lib/workflows/revert.ts`). ≤24h items: revert from Inbox. Older: route to Activity.
- **D-05:** Autonomy override set is fixed: price, product status/retirement, redirects, inventory, send-customer-email, page/content. No "discount codes". Not user-extensible in v1.
- **D-06:** Overrides are one-directional — only ADD friction. Can never auto-approve something a workflow would gate.
- **D-07:** Default automation level applies to new workflows only. No retroactive bulk changes.
- **D-07b:** Override enforcement lives in `execute-workflow-run.ts` (workflow engine), before a write executes.
- **D-08:** Export (SET-06) = durable background Inngest job. Initiates in <60s; assembles JSON, stores in Supabase Storage, surfaces download link. Avoids Vercel function timeouts.
- **D-09:** Delete account (SET-07) = lock-now / purge-at-7d. Cancel on sign-in during grace. Blocked while any run is mid-execution.
- **D-10:** Sessions (AUTH-04/05) = custom session registry table. Record device/browser (UA), coarse location (IP geo, labeled approximate), last-seen on login/activity. Per-session revoke + "Sign out everywhere" with confirmation.
- **D-11:** Two-pane surfaces collapse to drill-down on mobile (Approvals, Settings): list/nav first → full-screen detail with back affordance. No read-only stripping.
- **D-12:** Batch triage uses select-mode toggle + bulk-action bar (from Phase 3 Activity D-07 pattern). Touch-friendly, no hover dependency.
- **D-13:** Inline card + Inbox adopt keyboard model: `A` approve / `R` reject / `E` edit / `S` snooze / `↑↓` next — plus text equivalents.

### Claude's Discretion
- **Brand Voice (SET-02):** Markdown editor + live preview; "Regenerate from examples" produces a draft + confirm-before-replace. Changes read fresh on next agent action. Stored encrypted at rest.
- **Memory (SET-04):** Inline edit/add; delete = soft-delete with 24h recoverable window via undo toast (Sonner). Categorized list per design's `MemoryPanel`.
- **Notifications (SET-08):** Only in-app sidebar badge + "coming soon" placeholder. No non-functional toggles.
- **Cross-surface sync (APRV-05):** Realtime vs. poll — left to research. Target <5s cross-device including sidebar badge decrement.
- **Performance (UX-04):** Targets fixed (app shell <1.5s, nav <300ms, My Workflows <500ms p50). Caching/RSC/index strategy is implementation discretion.
- **Stale re-validation read source per `target_type`:** Follow Phase 3 `canRevert()`'s fresh-fetch approach.

### Deferred Ideas (OUT OF SCOPE)
- Meta/Instagram connection in Settings (v2 — render with disabled "v2" badge)
- Full notification surface (v2 NOTIF-01) — v1 ships badge + "coming soon" only (SET-08)
- Reject-reason behavioral influence beyond memory recall (future)
- Passkey / WebAuthn / 2FA (not in v1 AUTH-04/05 scope)
- User-extensible autonomy overrides (v1 fixed set D-05)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APRV-01 | Approval Inbox lists pending L2 items (action type, stakes, preview, reasoning, est. review time), sorted stakes-desc then recency | Design contract `surface-approvals.jsx`; `approvals` table schema verified with stakes/preview/reasoning_summary columns |
| APRV-02 | Approve/edit/reject/snooze single item; reject captures optional reason → memory | `resolveApprovalRow` + `approveItem`/`rejectItem` live; extend with `snoozeItem`/`editItem`; D-04 memory path via `storeMemoryItem` |
| APRV-03 | Bulk-select and batch approve/reject/snooze — 10+ items in 2 clicks | Phase 3 select-mode pattern (D-12) ports directly; new `bulkResolve` Server Action |
| APRV-04 | Full-fidelity inline approval cards: approve/edit/reject/snooze without leaving Conversation | `surface-conversation.jsx` ~L396–555 `InlineApprovalCard`; `message.inline_block_type='approval_card'` wiring already in engine |
| APRV-05 | One row, two views — resolving either updates both + decrements sidebar badge in real time (<5s cross-device) | Supabase Realtime Postgres Changes on `approvals` table with `filter: user_id=eq.${userId}`; Realtime authz migration 0004 already sets up `approval:<uuid>` private channel policy; recommendation: Broadcast from Database via trigger for badge count |
| APRV-06 | Snoozed items hidden by default with toggle; expired/stale handled without dumping | `snoozed_until` column already in schema; snooze presets via `snoozeItem` Server Action; filter on `status='pending' AND (snoozed_until IS NULL OR snoozed_until <= now())` |
| APRV-07 | Revert recently-approved (≤24h) from Inbox detail; older → Activity | `canRevert()` from `lib/workflows/revert.ts` reused; `executeRevertEffect` stub needs Shopify wiring (Phase 3 stub) |
| APRV-08 | Empty state: "All clear" with no CTA | Design-locked `ApprovalsEmpty` component; pure UI with gentle "see what's been running" link |
| SET-02 | Brand Voice: editable markdown + preview; "regenerate from examples" = draft + confirm-before-replace; encrypted at rest | `brand_voice_profiles.profile_markdown` column exists; `lib/integrations/crypto.ts` pattern for encryption; markdown editor + preview component needed |
| SET-03 | Autonomy Thresholds: global default level + curated per-action overrides | `autonomy_thresholds` table exists with `default_level` + `per_action_overrides` JSONB; enforcement point in `execute-workflow-run.ts` (D-07b) |
| SET-04 | "What I Remember": memory items by category; inline edit/delete (24h reversible)/add | `memoryItems` schema + `storeMemoryItem`/`updateMemoryItem`/`softDeleteMemoryItem` all live in `lib/agent/memory.ts` |
| SET-05 | Profile: edit name, email, password, avatar | `user_profiles.display_name` + `avatar_url` exist; Supabase Auth `updateUser` for email/password |
| SET-06 | Export: JSON bundle initiated <60s; background job | Inngest `step.run` + Supabase Storage `upload` + `createSignedUrl`; D-08 locked |
| SET-07 | Delete account: 7-day grace, cancellable on signin, blocked during mid-run | `user_profiles.deletion_requested_at` column already exists; Inngest `cancelOn` for grace cancel; D-09 locked |
| SET-08 | Notifications: in-app badge + "coming soon" placeholder only | Pure UI — badge already in sidebar nav; placeholder component |
| AUTH-04 | View active sessions (device, location, last seen) + per-session revoke | Custom `user_sessions` table required (Supabase Auth API does not expose per-session device metadata); D-10 locked |
| AUTH-05 | "Sign out all devices" with confirmation | Supabase `auth.signOut({ scope: 'global' })` + custom session table `status='revoked'` flush |
| UX-01 | 5 core surfaces fully functional on mobile — no read-only stripping | D-11 two-pane drill-down; existing `bottom-tabs.tsx` shell |
| UX-02 | All surfaces meet WCAG 2.1 AA | `@axe-core/playwright` automated testing; manual keyboard/SR pass |
| UX-03 | Inline approval cards and workflow visualizer keyboard-accessible with text equivalents | D-13 keyboard model A/R/E/S/↑↓ |
| UX-04 | App shell <1.5s p50, surface nav <300ms, My Workflows <500ms p50 | RSC partial prerendering, `unstable_cache`, DB indexes; Vercel Speed Insights measurement |
</phase_requirements>

---

## Summary

Phase 4 is a polish phase on top of a well-built foundation. The critical data layer is substantially complete (approvals schema, brand voice, autonomy thresholds, memory items, `snoozed_until` column, `deletion_requested_at` column, drift/revert helpers, nav shell). The primary engineering novelty is in five areas: (1) cross-surface real-time sync for the approval badge and inbox, (2) the session registry (custom table required — Supabase Auth does not expose per-session device/location metadata via public API), (3) the Inngest export + purge background jobs, (4) the WCAG AA conformance pass across all surfaces, and (5) the mobile drill-down for two-pane surfaces. Each has a clear implementation path documented below.

The Settings surface is a template extension problem: the existing `app/app/settings/page.tsx` + `ConnectionsSection` pattern is the shell; each new section (BrandVoice, Autonomy, Memory, Profile, Sessions, Danger, Notifications) is a new Server Component section + matching Client Component + Server Actions.

For cross-surface sync the recommendation is **Supabase Realtime Postgres Changes** (not polling) with `filter: user_id=eq.${userId}` on the `approvals` table, consumed in a `"use client"` hook that maintains badge count and invalidates the inbox list. The existing migration 0004 already established the `approval:<uuid>` private channel policy; the approval count badge can use a separate `approvals_badge` channel with a `user_id=eq` filter rather than per-approval channels.

**Primary recommendation:** Build in thin vertical slices: (1) Approval Inbox surface + inline sync, (2) Settings sections (Brand Voice → Autonomy → Memory → Profile → Sessions → Danger), (3) Mobile + A11y pass across all surfaces, (4) Performance audit + targeted fixes. Wave 0 must add the `user_sessions` table migration and an export/purge bucket in Supabase Storage.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Approval Inbox UI (list + detail) | Frontend Server (RSC) | Browser/Client | Initial list renders server-side; real-time updates handled client-side via Realtime hook |
| Inline approval card (Conversation) | Browser/Client | API | Card state (editing, snoozed) is ephemeral; approve/reject/snooze are Server Actions |
| Cross-surface sync / badge decrement | Browser/Client | Database trigger | Realtime subscription in Client Component; triggered by DB change |
| Snooze / Edit / Bulk approve Server Actions | API (Server Actions) | Database | Ownership-checked, Zod-validated, auth-gated same as existing approveItem/rejectItem |
| L2 pause/resume + autonomy override gate | Agent Tier (Inngest) | Database | `execute-workflow-run.ts` already enforces gate; Phase 4 wires override read from `autonomy_thresholds` |
| Settings sections UI | Frontend Server (RSC) | Browser/Client | RSC for initial data; Client Components for editable forms |
| Brand Voice regeneration | API (Server Action) → Agent Tier | Database | Claude call for generation → draft returned to client → confirm → save |
| Memory CRUD | API (Server Actions) | Database | `storeMemoryItem`/`updateMemoryItem`/`softDeleteMemoryItem` already exist |
| Session registry (AUTH-04/05) | Database + API | Browser/Client | Custom `user_sessions` table; login middleware writes row; revoke Server Action |
| Export job (SET-06) | Agent Tier (Inngest) | Supabase Storage | Background function assembles JSON, uploads, creates signed URL |
| Delete account scheduling (SET-07) | Agent Tier (Inngest) | Database | `step.sleep("7d")` + `cancelOn` login event; lock in DB immediately |
| Mobile two-pane drill-down | Browser/Client | — | Client-side navigation state; URL-driven (route segments) preferred over useState |
| WCAG AA conformance | All tiers | — | Markup/ARIA in RSC; keyboard handlers in Client Components; tested with axe-core |
| Performance (shell / nav / My Workflows) | Frontend Server (RSC) | Database indexes | PPR static shell + `unstable_cache` + index additions |

---

## Standard Stack

### Core (locked — do not change)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.6 (in repo) | App Router RSC + Server Actions | Locked tech stack |
| React | 19.1.0 | UI | Locked |
| TypeScript | ~5.8 strict | Type safety | Locked |
| Supabase JS SDK | 2.106.1 [VERIFIED: npm registry] | Auth + Realtime + Storage | Locked |
| Inngest | 4.4.0 [VERIFIED: npm registry] | Durable background jobs | Locked |
| Drizzle ORM | 0.45.2 | DB queries | Locked |
| Zod | ~3.24 | Input validation | Locked |
| Tailwind + shadcn/ui + Radix | in repo | UI primitives | Locked |
| Framer Motion | ~12.40 | Animations | Locked |
| Sonner | ~2.0.7 | Toast notifications | Locked |

### New Dependencies for Phase 4
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@axe-core/playwright` | 4.11.3 [VERIFIED: npm registry] | Automated WCAG AA testing in Playwright CI | Add to devDependencies; run in existing Playwright suite |

**No additional production dependencies required.** All Phase 4 work uses the existing locked stack.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Realtime Postgres Changes | Polling (setInterval) | Polling is simpler but adds 5-30s latency, wastes connections, harder to scale. Realtime hits <5s target reliably. |
| Realtime Postgres Changes | Broadcast from Database trigger | Broadcast is better for high-traffic tables (batches, sanitized payloads). For this app's single-tenant per-channel model, Postgres Changes with `filter: user_id=eq.${userId}` is sufficient and simpler. |
| Inngest step.sleep for delete grace | pg_cron scheduled job | Inngest is already in the stack and provides built-in `cancelOn` for the grace-cancel pattern; pg_cron adds infra complexity. |

**Installation (new devDependency only):**
```bash
npm install --save-dev @axe-core/playwright
```

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time. Registry verification and provenance performed manually.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@axe-core/playwright` | npm | 4+ yrs (Deque Systems) | 500k+/wk | github.com/dequelabs/axe-core-npm | [ASSUMED] | Approved — Deque Systems official package, widely used in accessibility tooling |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time; `@axe-core/playwright` is tagged `[ASSUMED]` but has strong provenance (official Deque Systems package, 468 published versions, no postinstall script). Planner should add a `checkpoint:human-verify` before install.*

---

## Architecture Patterns

### System Architecture Diagram

```
User (browser / mobile)
      │
      ├─ GET /app/approvals ──→ RSC (Server): load pending approvals (DB query, filtered by user_id)
      │                                └─ streams HTML + initial count to client
      │
      ├─ [Client] useApprovalsSync hook
      │        └─ supabase.channel('approvals-badge')
      │             .on('postgres_changes', { event: '*', table: 'approvals', filter: 'user_id=eq.<uid>' })
      │             .subscribe()
      │             └─ on change: update badge count, invalidate list (router.refresh() or SWR)
      │
      ├─ POST approveItem / rejectItem / snoozeItem / editItem (Server Actions)
      │        ├─ Zod validate → getClaims() → resolveApprovalRow (ownership)
      │        ├─ DB update (status, snoozed_until, edited payload)
      │        ├─ inngest.send('approval.resolved') → resumes Inngest run
      │        ├─ storeMemoryItem (reject reason → memory, D-04)
      │        └─ revalidatePath('/app/approvals') + revalidatePath('/app/chat')
      │
      └─ Supabase Realtime (WebSocket)
               └─ approval table change → client hook → badge decrement + list refresh

Agent Tier (Inngest):
  execute-workflow-run.ts  ─→  check autonomy_thresholds override  ─→  L2 gate
  export-account-data      ─→  query all user tables → JSON → Storage.upload → createSignedUrl
  purge-account            ─→  step.sleep('7d') → hard delete (cancelOn: user.signed_in)
```

### Recommended Project Structure (additions only)
```
app/app/
├── approvals/
│   ├── page.tsx              # RSC: initial load, server data
│   ├── _list.tsx             # ApprovalList RSC
│   ├── _detail.tsx           # ApprovalDetail RSC
│   ├── _inline-card.tsx      # InlineApprovalCard (Client Component)
│   ├── _realtime-sync.tsx    # "use client" Realtime hook for badge + list refresh
│   └── actions.ts            # (exists) extend with snoozeItem, editItem, bulkResolve, revertApproved
├── settings/
│   ├── page.tsx              # (exists) extend shell with new sections
│   ├── _brand-voice.tsx      # BrandVoiceSection (Client: markdown editor + preview)
│   ├── _autonomy.tsx         # AutonomySection (Client: level toggle + override rows)
│   ├── _memory.tsx           # MemorySection (Client: list + inline edit + soft-delete)
│   ├── _profile.tsx          # ProfileSection (Client: name, email, password, avatar)
│   ├── _sessions.tsx         # SessionsSection (Client: session list + revoke)
│   ├── _danger.tsx           # DangerSection (Client: export + delete)
│   ├── _notifications.tsx    # NotificationsSection (UI: badge + coming soon)
│   └── actions.ts            # All Settings Server Actions
lib/
├── db/schema/
│   └── user-sessions.ts      # NEW: user_sessions table (AUTH-04/05)
├── inngest/functions/
│   ├── export-account-data.ts   # NEW: D-08 export job
│   └── purge-account.ts         # NEW: D-09 purge job
└── workflows/
    └── approvals.ts          # (exists) extend: snoozeApproval, editApproval, bulkResolve
```

---

## Open Technical Questions — Research Answers

### 1. Cross-Surface Sync (APRV-05): Realtime vs. Polling

**Recommendation: Supabase Realtime Postgres Changes** with a `user_id` filter. [VERIFIED: supabase.com/docs/guides/realtime/postgres-changes]

**Pattern:**
```typescript
// "use client" — _realtime-sync.tsx
import { createClient } from "@/lib/auth/client"; // browser client
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
        (payload) => {
          // Re-fetch count or compute from payload
          router.refresh(); // triggers RSC re-render with fresh data
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return { pendingCount };
}
```

**Multi-tenant RLS:** The `approvals` table has RLS enabled (migration 0003). Realtime Postgres Changes respects RLS for SELECT policies on the authenticated user — the `user_id=eq.${userId}` filter is defense-in-depth on top of RLS. [VERIFIED: supabase.com/docs/guides/realtime/postgres-changes]

**How badge decrements:** On any `UPDATE` or `DELETE` event on `approvals`, call `router.refresh()` to trigger an RSC re-render of the layout that holds the badge. The badge count is computed server-side from a fast `COUNT(*)` query. Alternatively, maintain client-side count delta (subtract 1 on approve/reject/snooze payload). `router.refresh()` is simpler and avoids count drift.

**Sidebar badge wiring:** Add a `BadgeCount` Client Component wrapper around the Approvals nav item in `sidebar.tsx` that receives initial count as prop from the server layout and subscribes via the Realtime hook. The server layout fetches `SELECT COUNT(*) FROM approvals WHERE user_id = $userId AND status = 'pending' AND (snoozed_until IS NULL OR snoozed_until <= now())`.

**RLS + Realtime on the private channel (migration 0004):** The existing `approval:<uuid>` private channel policy (migration 0004) is per-approval-row, intended for the inline card. The badge channel (`approvals-badge`) uses a standard `postgres_changes` subscription (not a private broadcast channel), which is gated by the table's RLS policy. This is correct and consistent with what migration 0003 established.

**<5s latency:** Supabase Realtime WebSocket delivers changes typically in <1s on the same region. Cross-device is bounded by Supabase's global infra latency, well within the 5s target. [CITED: supabase.com/docs/guides/realtime]

---

### 2. Session Registry (AUTH-04/05): Custom Table Required

**Finding:** Supabase Auth does NOT expose a public API to list per-session device metadata (browser/UA, coarse location, last-seen) or per-session revoke. [VERIFIED: supabase.com/docs/guides/auth/sessions — confirmed only session_id claim + auth.sessions table reference; no device/location columns in public API]

**Recommendation: Custom `user_sessions` table.** [ASSUMED - schema design; architecture is research-verified]

D-10 (locked decision) explicitly requires this approach.

**Schema:**
```sql
-- migration 0006_user_sessions.sql
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "supabase_session_id" text,          -- session_id JWT claim, for correlation
  "refresh_token_hash" text,           -- hash of refresh token for revoke lookup
  "device_label" text NOT NULL,        -- parsed from UA: "Chrome on macOS"
  "raw_ua" text,                       -- full user-agent string
  "ip_geo_label" text,                 -- "New York, US (approximate)" — coarse only
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone   -- set on per-session revoke
);
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "idx_user_sessions_user" ON "user_sessions" ("user_id", "last_seen_at" DESC);
-- RLS policy
CREATE POLICY "user_sessions_user_policy" ON "user_sessions"
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "user_id")
  WITH CHECK ((SELECT auth.uid()) = "user_id");
```

**Write on login:** In the auth middleware or a Server Action called post-login, insert a row with UA parsed to a human label + IP geo (coarse, from request headers — use a lightweight lookup, NOT a third-party API call in the hot path; if no geo available, label as "Unknown location"). [ASSUMED — IP geo library selection deferred to planner]

**Per-session revoke:** Set `revoked_at = now()` on the target row. Then call `supabase.auth.admin.signOut(userId, { scope: 'others' })` from a Server Action using the service role key — this revokes all refresh tokens for all non-current sessions. For more precise single-session revocation: set `revoked_at` in our DB + rely on refresh token hash matching. Full single-session JWT revocation is not possible before JWT expiry (15-minute window); the approach is consistent with Supabase's documented behavior. [CITED: supabase.com/docs/guides/auth/signout]

**Sign out everywhere:** `supabase.auth.signOut({ scope: 'global' })` from the client terminates all sessions. Mark all rows `revoked_at = now()` in `user_sessions` for the user. [VERIFIED: supabase.com/docs/guides/auth/signout]

**JWT caveat:** Access tokens remain valid until expiry (typically 1 hour) even after revocation of refresh tokens. This is a documented Supabase Auth limitation. Display is "last-seen" based, not "currently active" — acceptable for this use case. [CITED: supabase.com/docs/guides/auth/sessions]

---

### 3. Export as Inngest Background Job (SET-06 / D-08)

**Pattern:** Server Action initiates → Inngest `export-account-data` function runs in background → uploads to Supabase Storage → returns signed URL in-app. [VERIFIED: inngest.com/docs and supabase.com/docs/reference/javascript/storage-from-createsignedurl]

```typescript
// lib/inngest/functions/export-account-data.ts
export const exportAccountData = inngest.createFunction(
  { id: "export-account-data", retries: 2 },
  { event: "account.export_requested" },
  async ({ event, step }) => {
    const { userId } = event.data;

    const bundle = await step.run("assemble-bundle", async () => {
      // Query all user-owned tables (workflows, versions, runs, activity, memory, brand_voice)
      // Return a structured JSON object
      return { workflows: [], activity: [], memory: [], brandVoice: {} };
    });

    const { signedUrl } = await step.run("upload-to-storage", async () => {
      const bytes = Buffer.from(JSON.stringify(bundle, null, 2));
      const path = `exports/${userId}/${Date.now()}-export.json`;
      
      // Use service-role Supabase client (serviceDb context)
      const { error } = await supabaseAdmin.storage
        .from("user-exports")
        .upload(path, bytes, { contentType: "application/json", upsert: true });
      
      if (error) throw error;

      const { data } = await supabaseAdmin.storage
        .from("user-exports")
        .createSignedUrl(path, 60 * 60 * 24); // 24h validity
      
      return { signedUrl: data?.signedUrl };
    });

    await step.run("notify-user", async () => {
      // Write to a user_exports table or update a job-status row
      // so the Settings UI can poll or display the link
    });

    return { signedUrl };
  }
);
```

**Initiating Server Action** calls `inngest.send({ name: "account.export_requested", data: { userId } })` and returns `{ status: "initiated" }` within the 60s requirement. The UI shows "Preparing export..." and polls a job-status endpoint or displays the link when it appears in a `user_exports` table row. [ASSUMED — job status polling vs. Realtime notification is planner's choice]

**Supabase Storage bucket:** `user-exports` — private bucket, service-role access only. Signed URL has 24h expiry. [VERIFIED: supabase.com/docs/reference/javascript/storage-from-createsignedurl]

**Vercel timeout avoidance:** Inngest bypasses Vercel function timeouts by checkpointing across `step.run` calls. Each step individually runs within Vercel's timeout; the overall job can run arbitrarily long. [CITED: inngest.com/docs/guides/delayed-functions]

---

### 4. Delete Account Scheduling (SET-07 / D-09)

**Pattern:** `step.sleep("7d")` + `cancelOn` for grace-cancel on sign-in. [VERIFIED: inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events]

```typescript
// lib/inngest/functions/purge-account.ts
export const purgeAccount = inngest.createFunction(
  {
    id: "purge-account",
    retries: 2,
    cancelOn: [{
      event: "account.deletion_cancelled",
      if: "async.data.userId == event.data.userId",
    }],
  },
  { event: "account.deletion_requested" },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Lock account immediately (set deletion_requested_at in user_profiles)
    await step.run("lock-account", async () => {
      await serviceDb
        .update(userProfiles)
        .set({ deletion_requested_at: new Date() })
        .where(eq(userProfiles.user_id, userId));
      // Stop/abort running workflows
    });

    // Step 2: Sleep 7 days (cancellable via cancelOn)
    await step.sleep("grace-period", "7d");

    // Step 3: Hard delete after grace
    await step.run("hard-delete", async () => {
      // Cascade delete via auth.users FK (ON DELETE CASCADE handles app data)
      await supabaseAdmin.auth.admin.deleteUser(userId);
      // Also clean up Storage (user-exports bucket)
    });
  }
);
```

**Initiation gate:** Before sending `account.deletion_requested`, check that no `workflow_runs` rows have `status = 'running'` OR `status = 'paused_for_approval'` for this user. If any exist, return an error to the UI (D-09: blocked while mid-execution). [VERIFIED: pattern is correct per existing schema]

**Cancel on sign-in:** When a user signs in during the grace period, send `inngest.send({ name: "account.deletion_cancelled", data: { userId } })`. Inngest's `cancelOn` will terminate the sleeping purge function. Also clear `deletion_requested_at` in `user_profiles`. [VERIFIED: inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events]

**Idempotency:** `step.run("hard-delete")` wrapped in a try-catch that ignores "user not found" errors handles retry scenarios safely. [VERIFIED: inngest.com/docs/guides/handling-idempotency]

**7-day limit note:** Inngest free plan limits debounce to 7 days but `step.sleep` can go up to 1 year on paid plans. Supabase Pro tier + Inngest paid tier in use → no constraint. [CITED: inngest.com/docs/guides/delayed-functions]

---

### 5. Performance Strategy (UX-04)

**Targets:** app shell <1.5s p50 LCP, surface nav <300ms, My Workflows <500ms p50. [CITED: PRD §5.4.2]

**App Shell (<1.5s):**
- Next.js 15 App Router with Partial Prerendering (PPR): static shell renders from CDN edge instantly; dynamic content streams. The `layout.tsx` must not block on user data — move user-specific data to nested RSC segments. [CITED: nextjs.org/docs/app/getting-started/caching]
- `unstable_cache` wraps any DB query that can be cache-tagged and revalidated (e.g., brand voice profile read). For user-specific data where full RSC streaming is used, keep DB round-trips minimal.
- Sidebar badge count: fetch as a parallel data load in the layout, NOT blocking the shell render.

**Surface Navigation (<300ms):**
- Next.js App Router Router Cache stores RSC payloads in memory (30s static, 5min dynamic). Navigation between the 5 surfaces should feel instant after first visit. No additional work required beyond ensuring route segments are not `force-dynamic` unnecessarily.
- Each surface page should use `loading.tsx` for instant shell + streamed content.

**My Workflows (<500ms):**
- The `workflows` query needs an index on `(user_id, status, updated_at DESC)` — verify existence in migrations. If not present, add in Wave 0.
- Use `unstable_cache` for the grouped workflow list with `revalidateTag('workflows-${userId}')` called from Server Actions that mutate workflows. [CITED: nextjs.org/docs/app/deep-dive/caching]

**Measurement:**
- `@vercel/analytics` already installed (2.0.1) — enable Web Vitals reporting in `next.config` to get real-user LCP/INP/CLS.
- Lighthouse CI in Playwright for synthetic checks.
- PRD §5.4.2 targets are p50, not p95 — focus on median load, which is achievable with RSC + edge caching.

**DB indexes to verify (Wave 0):**
```sql
-- approvals: pending list query
CREATE INDEX IF NOT EXISTS "idx_approvals_user_pending_stakes"
  ON "approvals" ("user_id", "stakes", "created_at" DESC)
  WHERE status = 'pending';

-- workflows: My Workflows surface
CREATE INDEX IF NOT EXISTS "idx_workflows_user_status"
  ON "workflows" ("user_id", "status", "updated_at" DESC);
```
[ASSUMED — verify whether 0005 migration already added these; add if absent]

---

### 6. Mobile Drill-Down (UX-01 / D-11)

**Pattern: URL-driven segment navigation, not useState.** Use Next.js dynamic route segments: `/app/approvals` = list, `/app/approvals/[id]` = detail. On mobile (md: breakpoint), the layout shows only the active segment. On desktop, both columns render. This gives deep-linkable URLs, back-button support, and no read-only stripping. [ASSUMED — route segment approach; alternative is `useRouter + useState` which is harder to deep-link]

```
// app/app/approvals/layout.tsx
// Desktop: 380px list + flex-1 detail (design contract)
// Mobile: show list OR detail based on whether [id] param is present

export default function ApprovalsLayout({ children, list }: ...) {
  return (
    <div className="flex h-full">
      {/* List panel: hidden on mobile when detail is active */}
      <div className="md:w-[380px] md:block [hidden_when_detail_route_active_mobile]">
        {list}
      </div>
      {/* Detail panel: full-width on mobile */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

**Back affordance:** On mobile detail view, render a `← Back` button that navigates to `/app/approvals`. Use `aria-label="Back to approvals list"` for SR. Focus management: on navigation to detail, move focus to the detail panel heading. On back, return focus to the list item that was activated.

**Settings drill-down:** Same pattern: `/app/settings` renders the nav on mobile. Each section lives at `/app/settings/[section]` (or uses a tabbed Client Component on desktop with the URL reflecting the active section).

---

### 7. WCAG 2.1 AA Pass (UX-02/03)

**Concrete requirements for this phase:** [CITED: WCAG 2.1 AA spec; verified against existing component patterns]

| Criterion | Applies | How to Implement |
|-----------|---------|-----------------|
| 1.4.3 Color contrast (4.5:1 text, 3:1 UI) | All surfaces | Audit existing CSS vars; test with Lighthouse or axe-core |
| 1.4.4 Resize text (200% without loss) | All surfaces | Use relative units (rem/em); avoid fixed px heights on text containers |
| 2.1.1 Keyboard: all functionality | Approvals (A/R/E/S/↑↓), Settings forms, Mobile nav | D-13 keyboard model; `tabIndex`, `onKeyDown` handlers |
| 2.4.3 Focus order | All surfaces, especially drill-down | Focus moves to detail panel heading on navigation; returns to list on back |
| 2.4.7 Focus visible | All interactive elements | Existing sidebar uses `focus-visible:ring-2`; extend to all new components |
| 3.3.1 Error identification | Settings forms | Inline Zod validation errors with `aria-describedby` linking error message |
| 4.1.2 Name, Role, Value | Custom components (LevelToggle, StakesIndicator, ApprovalRow) | `role="button"`, `aria-label`, `aria-pressed`, `aria-selected` on custom elements |
| 1.3.3 Sensory (not color alone) | Stakes indicator (High/Med/Low) | Text label + icon; existing `StakesIndicator` per design |

**Keyboard model for Approval Inbox (D-13):**
```typescript
// Keyboard shortcuts for ApprovalDetail
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target !== document.body && !(e.target as HTMLElement).closest('[data-approval-detail]')) return;
    switch(e.key) {
      case 'a': case 'A': handleApprove(); break;
      case 'r': case 'R': handleReject(); break;
      case 'e': case 'E': handleEdit(); break;
      case 's': case 'S': handleSnooze(); break;
      case 'ArrowDown': focusNext(); break;
      case 'ArrowUp': focusPrev(); break;
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, []);
```
Announce shortcuts via `<Kbd>` components (design-locked). Screen reader: `aria-label="Approve (A)"` on buttons.

**Framer Motion reduced-motion:**
```typescript
// Wrap root layout in MotionConfig
import { MotionConfig } from "framer-motion";
<MotionConfig reducedMotion="user">
  {children}
</MotionConfig>
```
This automatically disables transform/layout animations when `prefers-reduced-motion: reduce` is active. Preserves opacity fades. [VERIFIED: motion.dev/docs/react-use-reduced-motion]

**Testing:**
```bash
# axe-core/playwright — add to existing e2e tests
npx playwright test tests/e2e/a11y.spec.ts
```
```typescript
// tests/e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("approvals surface is WCAG AA", async ({ page }) => {
  await page.goto("/app/approvals");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
```
[VERIFIED: @axe-core/playwright exists at 4.11.3 on npm registry; Playwright already in devDependencies]

---

### 8. Brand Voice "Regenerate from Examples" (SET-02)

**Pattern:** Generate draft → surface in editor → user confirms → save replaces. No silent overwrite. [ASSUMED — Claude API call pattern is consistent with existing anthropic.ts usage; encryption pattern from integrations/crypto.ts]

```typescript
// Server Action: regenerateBrandVoice
export async function regenerateBrandVoice(): Promise<{ draft: string } | { error: string }> {
  const userId = await requireUserId();
  
  // Fetch existing brand_voice_samples for the user
  const samples = await /* query brand_voice_samples */;
  
  // Call Claude to generate a draft profile from examples
  const draft = await generateBrandVoiceDraft(samples);
  
  // Return draft to client — do NOT save yet
  return { draft };
}

// Separate action to confirm + save:
export async function saveBrandVoice(markdown: string): Promise<{ success: true } | { error: string }> {
  const userId = await requireUserId();
  // Encrypt markdown before storing (security baseline — CLAUDE.md)
  const encrypted = encrypt(markdown, getKey());
  await serviceDb.update(brandVoiceProfiles)
    .set({ profile_markdown: encrypted, updated_at: new Date() })
    .where(eq(brandVoiceProfiles.user_id, userId));
  return { success: true };
}
```

**Encrypted at rest:** `brand_voice_profiles.profile_markdown` must be encrypted using the same libsodium pattern as integration tokens (`lib/integrations/crypto.ts`). Check whether onboarding already stores it encrypted — if not, add encryption in the Phase 4 save action and migration. [ASSUMED — verify current onboarding writes encrypted or plaintext]

**Live preview:** The markdown editor is a Client Component (`<textarea>` or a light markdown editor). Preview is rendered client-side with `react-markdown` (already in repo, no XSS passthrough per `[02-06]` convention).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background jobs that outlast Vercel function timeout | Custom webhook-based queue | Inngest `step.run` + `step.sleep` | Inngest already in stack; handles retries, checkpointing, `cancelOn` |
| Real-time badge/list updates | SSE polling endpoint | Supabase Realtime Postgres Changes | WebSocket already used in chat; consistent pattern, <5s guarantee |
| JWT session revocation before expiry | Custom token blacklist | Accept 15-min window; mark `revoked_at` in `user_sessions` | Supabase Auth JWTs cannot be revoked before expiry — this is by design |
| Accessibility audit automation | Manual-only QA | `@axe-core/playwright` | Catches 57% of violations automatically; integrates with existing Playwright suite |
| Markdown editor from scratch | Custom contenteditable | `<textarea>` with `react-markdown` preview | `react-markdown` already in repo; no new dependency |
| IP geolocation lookup | Third-party API call in hot path | Parse from `X-Forwarded-For` + coarse country from Vercel headers | Avoids latency/cost; "approximate" label per D-10 |

---

## Runtime State Inventory

> Not a rename/refactor phase — omit per instructions.

---

## Common Pitfalls

### Pitfall 1: Realtime Subscription Memory Leak
**What goes wrong:** Channel not removed on component unmount → multiple subscriptions accumulate → stale handlers update stale state.
**Why it happens:** Missing `return () => supabase.removeChannel(channel)` in `useEffect`.
**How to avoid:** Always return cleanup from `useEffect`. Use a single channel per surface, not per approval row.
**Warning signs:** Badge shows stale count after navigation; console shows multiple subscription warnings.

### Pitfall 2: resolveApprovalRow Called After Firing Inngest Event
**What goes wrong:** Inngest resumes the workflow before the DB row is updated → engine re-reads `status = 'pending'` and halts.
**Why it happens:** Wrong ordering of DB update and `inngest.send`.
**How to avoid:** `resolveApprovalRow` (DB update) MUST complete BEFORE `inngest.send`. Already enforced in `approveItem`/`rejectItem` — maintain this ordering in all new actions (snooze, edit, bulk).
**Warning signs:** Workflow run stuck in `paused_for_approval` after user approved.

### Pitfall 3: Snooze Filter Missing in Pending Query
**What goes wrong:** Snoozed items appear in the pending inbox.
**Why it happens:** `WHERE status = 'pending'` without checking `snoozed_until`.
**How to avoid:** Query: `WHERE status = 'pending' AND (snoozed_until IS NULL OR snoozed_until <= now())`. The index `idx_approvals_user_pending` covers `status`; add `snoozed_until` to the partial index if performance requires.
**Warning signs:** Items user snoozed still show up in the list immediately.

### Pitfall 4: Delete Account While Run is Mid-Execution
**What goes wrong:** Hard delete fires while an Inngest function is executing → orphaned Inngest run with no DB context → crashes/errors.
**Why it happens:** Initiation gate check races with a run that starts just after the check.
**How to avoid:** Gate check queries `workflow_runs WHERE status IN ('running', 'paused_for_approval')`. Also abort/cancel all active runs via `inngest.send('workflow.cancel_all_for_user', { userId })` as part of the lock step. Accept a small race window.
**Warning signs:** Inngest function throws "workflow run not found" after deletion.

### Pitfall 5: Keyboard Shortcut Conflicts with Browser/OS
**What goes wrong:** `A`/`R`/`E`/`S` keys fire when user is typing in a form field.
**Why it happens:** Global `keydown` listener fires on every key, including when focus is in an `<input>` or `<textarea>`.
**How to avoid:** Check `e.target` — skip if target is an input, textarea, or contenteditable. Scope the listener to the approval detail panel via `data-approval-detail` attribute.
**Warning signs:** Typing in the reject reason input accidentally triggers approve/reject.

### Pitfall 6: Brand Voice Encryption Mismatch on Read
**What goes wrong:** Brand voice profile displays as encrypted bytes.
**Why it happens:** Onboarding stores plaintext; Phase 4 expects encrypted; or vice versa.
**How to avoid:** Audit the onboarding `saveBrandVoice` call — if it stores plaintext, the Phase 4 migration must re-encrypt existing rows or handle both cases gracefully with try-catch on decrypt.
**Warning signs:** `profile_markdown` in the Settings editor shows garbled bytes.

### Pitfall 7: CEL `async` vs. `event` Inversion in Inngest (inherited pitfall)
**What goes wrong:** Wrong CEL field in `cancelOn` `if` expression.
**Why it happens:** Same as the existing Pitfall 1 in `execute-workflow-run.ts` — `async` = the waited-for event; `event` = the original trigger.
**How to avoid:** In `purge-account.ts` cancelOn: `if: "async.data.userId == event.data.userId"`. This is the established pattern. [VERIFIED: execute-workflow-run.ts comment in codebase]

---

## Code Examples

### Snooze Server Action (extends existing actions.ts)
```typescript
// app/app/approvals/actions.ts — extension
"use server";
const SnoozeSchema = z.object({
  approvalId: z.string().uuid(),
  snoozedUntil: z.string().datetime(), // ISO8601
});

export async function snoozeItem(
  approvalId: string,
  snoozedUntil: string
): Promise<{ success: true } | { error: string }> {
  const parsed = SnoozeSchema.safeParse({ approvalId, snoozedUntil });
  if (!parsed.success) return { error: "Invalid input" };

  const userId = await requireUserId();
  
  // Verify ownership before update
  const [existing] = await serviceDb
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)))
    .limit(1);
  if (!existing) return { error: "Not found or unauthorized" };

  await serviceDb
    .update(approvals)
    .set({ status: "snoozed", snoozed_until: new Date(snoozedUntil) })
    .where(and(eq(approvals.id, approvalId), eq(approvals.user_id, userId)));

  // Do NOT fire approval.resolved — snoozed != resolved; workflow remains paused
  revalidatePath("/app/approvals");
  revalidatePath("/app/chat");
  return { success: true };
}
```
[ASSUMED — snooze does not fire approval.resolved; the workflow stays paused_for_approval until the item is actioned later]

### Inngest Cancel-on-Signin Pattern
```typescript
// When user signs in after requesting deletion:
// app/app/actions.ts or auth middleware post-signin hook
await inngest.send({
  name: "account.deletion_cancelled",
  data: { userId },
});
// Clear deletion_requested_at in user_profiles
await serviceDb
  .update(userProfiles)
  .set({ deletion_requested_at: null })
  .where(eq(userProfiles.user_id, userId));
```
[VERIFIED: inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events]

### Autonomy Override Check in execute-workflow-run.ts
```typescript
// In step before L2/L3 branch decision:
const thresholds = await serviceDb
  .select()
  .from(autonomyThresholds)
  .where(eq(autonomyThresholds.user_id, userId))
  .limit(1);

const overrides = thresholds[0]?.per_action_overrides ?? {};
const actionType = workflowStep.tool;
const overrideLevel = overrides[actionType]; // e.g., "L2"

// Override can only ADD friction (D-06):
// If override = "L2" and workflow = "L3", enforce L2 gate
const effectiveLevel = overrideLevel
  ? (levelOrder[overrideLevel] < levelOrder[workflow.automation_level]
      ? overrideLevel  // more restrictive — use override
      : workflow.automation_level)
  : workflow.automation_level;
```
[ASSUMED — levelOrder = { L1: 1, L2: 2, L3: 3 }; lower number = more restrictive]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual polling for approval badge | Supabase Realtime Postgres Changes | Supabase Realtime GA | Badge updates sub-second without polling |
| Custom sleep tables for scheduled deletes | Inngest step.sleep + cancelOn | Inngest v3+ | Zero-infra scheduled purge with built-in cancel |
| Manual WCAG audit only | axe-core automated (57% violation detection) + manual | 2023+ | Catches most issues in CI before shipping |
| Next.js 14 Pages Router caching | Next.js 15 App Router RSC + unstable_cache + PPR | Next.js 15 | Static shell from edge, streamed user data |

**Deprecated/outdated:**
- `fetch({ next: { revalidate } })` as the primary cache mechanism: replaced by `unstable_cache` for non-fetch DB calls in Next.js 15.
- `supabase.auth.signOut()` with no scope (global by default): use explicit scope parameter to avoid unintended device sign-outs.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Snooze does NOT fire `approval.resolved` — the Inngest run stays paused for a future approval action | Code Examples (snooze) | If wrong: snooze would resume the workflow, potentially executing before approval. Must verify with CONTEXT.md / product intent. |
| A2 | Brand voice profile is stored as plaintext in current onboarding (not pre-encrypted) | Brand Voice (SET-02) | If wrong (already encrypted): Phase 4 save action does double-encryption. Audit onboarding `saveBrandVoice` path before implementing. |
| A3 | `levelOrder` for autonomy override: L1 < L2 < L3 where lower = more restrictive | Code Examples (autonomy override) | If override logic is inverted, overrides would LOOSEN friction — violating D-06. Must verify with product intent. |
| A4 | IP geolocation done from Vercel request headers (coarse country); no third-party API call in login path | Sessions (AUTH-04) | If coarse country from headers is insufficient for D-10 "coarse location, labeled approximate" — may need IP lookup service (adds latency/cost to login). |
| A5 | The export job status (signed URL readiness) is surfaced via polling a `user_exports` DB row, not via Realtime push | Export (SET-06) | If wrong: Realtime push approach requires a separate channel and RLS policy. Simpler polling is fine for a low-frequency operation. |
| A6 | `idx_workflows_user_status` index does not yet exist; needs Wave 0 migration | Performance (UX-04) | If it already exists: migration is a no-op (IF NOT EXISTS guard). No harm. |
| A7 | slopcheck could not be run; `@axe-core/playwright` legitimacy is based on npm registry verification + Deque Systems provenance check | Package Legitimacy Audit | Risk is low given well-established package history, but not zero. Planner should add checkpoint. |

---

## Open Questions (RESOLVED)

1. **Snoozed approval and Inngest wait timeout**
   - What we know: `step.waitForEvent` in `execute-workflow-run.ts` has a 14d timeout. Snoozed items can come back before that timeout.
   - What's unclear: Does a snooze "return" fire `approval.resolved` (resuming the paused Inngest run) or does the user need to explicitly approve after unsnooze? D-02 says items "reappear at return time sorted to top" — they still need explicit approval.
   - Recommendation: Snooze = DB status update only; do NOT fire `approval.resolved`. The Inngest `waitForEvent` continues waiting. When the snoozed item surfaces and the user approves, that fires `approval.resolved`. Confirm this interpretation with D-09 context before implementing.
   - **RESOLVED (A1/Q1):** Snooze does NOT fire `approval.resolved` — the Inngest run stays paused; only approve/reject resolve it (see 04-02 `snoozeItem`; confirmed against `resolveApprovalRow`). Implementer must NOT halt on this question.

2. **Brand voice encryption: current state**
   - What we know: `brand_voice_profiles` exists. CLAUDE.md security baseline requires encrypted-at-rest for brand voice.
   - What's unclear: Onboarding writes to this table in Phase 2 — is it currently encrypted?
   - Recommendation: Read `app/onboarding` actions or `lib/agent/memory.ts` brand voice write path before writing the Settings save action.
   - **RESOLVED (A2/Q2):** Onboarding writes plaintext brand voice; the Phase 4 read path tolerates legacy plaintext via try-catch on `decryptToken`, and `saveBrandVoice` encrypts going forward (see 04-03 Task 1). Implementer must NOT halt on this question.

3. **Session table write timing**
   - What we know: Session must be written at login. Auth middleware already runs on `/app/*`.
   - What's unclear: Best place to write the session row — middleware (runs on every request, would need dedup) or a dedicated login Server Action / auth callback hook.
   - Recommendation: Write on the `/auth/callback` route (post-OAuth) + on `supabase.auth.signInWithPassword` success, not in middleware (too frequent). Use `INSERT ... ON CONFLICT (supabase_session_id) DO UPDATE SET last_seen_at = now()` for idempotency.
   - **RESOLVED (A3/Q3):** `automation_level` ordering is L1/L2/L3 with lower = stricter; the autonomy override only ADDS friction, wired in `execute-workflow-run.ts` per D-06/D-07b (see 04-04). Implementer must NOT halt on this question.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Realtime (Pro tier) | APRV-05 cross-surface sync | Assumed (Supabase Pro) | 2.106.1 SDK | None — core requirement |
| Inngest (paid plan) | SET-06 export, SET-07 purge (step.sleep > free plan limit) | Assumed (paid per STATE.md) | 4.4.0 | None — locked tech |
| Supabase Storage bucket `user-exports` | SET-06 export job | Not yet created | — | Wave 0: create bucket |
| `@axe-core/playwright` | UX-02 WCAG testing | Not installed (devDep) | 4.11.3 | Manual axe testing only |
| IP geolocation (coarse) | AUTH-04 session location label | Vercel `X-Forwarded-For` header available | — | "Unknown location" label |

**Missing dependencies with no fallback:** Supabase Storage `user-exports` bucket (Wave 0 task: create via Supabase dashboard or migration).

**Missing dependencies with fallback:** `@axe-core/playwright` — fallback is manual axe browser extension testing (acceptable but not CI-gated).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 (unit) + Playwright 1.60 (e2e) |
| Config file | `vitest.config.mts` (excludes `tests/e2e/**`) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APRV-01 | Approval Inbox renders pending items sorted stakes-desc | unit (Server Action / DB query logic) | `npx vitest run tests/unit/approvals.test.ts -t "pending list"` | ❌ Wave 0 |
| APRV-02 | snoozeItem sets status='snoozed' + snoozed_until; rejectItem stores memory | unit | `npx vitest run tests/unit/approvals.test.ts -t "snooze\|reject reason"` | ❌ Wave 0 |
| APRV-03 | bulkResolve updates N rows atomically; only pending rows updated | unit | `npx vitest run tests/unit/approvals.test.ts -t "bulk"` | ❌ Wave 0 |
| APRV-04 | InlineApprovalCard renders pending/editing/approved/rejected/snoozed states | e2e (visual smoke) | `npx playwright test tests/e2e/approvals-inline.spec.ts` | ❌ Wave 0 |
| APRV-05 | Resolving in Inbox decrements badge count; Realtime triggers router.refresh | e2e | `npx playwright test tests/e2e/approvals-sync.spec.ts` | ❌ Wave 0 |
| APRV-06 | Snoozed items hidden in list; toggle shows them; snoozed_until filter correct | unit | `npx vitest run tests/unit/approvals.test.ts -t "snooze filter"` | ❌ Wave 0 |
| APRV-07 | canRevert returns allowed for ≤24h approved item; revertApproved calls executeRevertEffect | unit | `npx vitest run tests/unit/approvals.test.ts -t "revert"` | ❌ Wave 0 |
| SET-02 | saveBrandVoice encrypts content; regenerateBrandVoice returns draft without saving | unit | `npx vitest run tests/unit/settings.test.ts -t "brand voice"` | ❌ Wave 0 |
| SET-03 | Autonomy override correctly tightens L3→L2 (never loosens L2→L3) | unit | `npx vitest run tests/unit/autonomy.test.ts` | ❌ Wave 0 |
| SET-04 | softDeleteMemoryItem sets soft_deleted_at; recallMemory excludes soft-deleted | unit (already tested in Phase 2?) | `npx vitest run tests/unit/memory.test.ts` | ❌ verify |
| SET-06 | exportAccountData Inngest function returns signedUrl | unit (mock Inngest step) | `npx vitest run tests/unit/export.test.ts` | ❌ Wave 0 |
| SET-07 | purgeAccount: cancelOn fires when deletion_cancelled event arrives | unit (Inngest mock) | `npx vitest run tests/unit/purge.test.ts` | ❌ Wave 0 |
| AUTH-04 | revokeSession sets revoked_at; user cannot see revoked session in list | unit | `npx vitest run tests/unit/sessions.test.ts` | ❌ Wave 0 |
| UX-01 | Mobile: all 5 surfaces render without read-only stripping at 375px viewport | e2e | `npx playwright test tests/e2e/mobile.spec.ts --project=mobile-chrome` | ❌ Wave 0 |
| UX-02 | All surfaces pass axe-core WCAG 2.1 AA | e2e | `npx playwright test tests/e2e/a11y.spec.ts` | ❌ Wave 0 |
| UX-03 | Keyboard: A/R/E/S shortcuts trigger correct actions; focus moves correctly | e2e | `npx playwright test tests/e2e/keyboard.spec.ts` | ❌ Wave 0 |
| UX-04 | My Workflows loads < 500ms p50 in Playwright | e2e (timing) | `npx playwright test tests/e2e/perf.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (unit only, <30s)
- **Per wave merge:** `npx vitest run && npx playwright test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/approvals.test.ts` — covers APRV-01 through APRV-07 (snooze, edit, bulk, revert Server Actions)
- [ ] `tests/unit/settings.test.ts` — covers SET-02 (brand voice encrypt/decrypt), SET-03 (autonomy override logic)
- [ ] `tests/unit/export.test.ts` — covers SET-06 Inngest function with mocked step.run
- [ ] `tests/unit/purge.test.ts` — covers SET-07 cancelOn pattern
- [ ] `tests/unit/sessions.test.ts` — covers AUTH-04/05 session registry CRUD
- [ ] `tests/e2e/a11y.spec.ts` — axe-core WCAG 2.1 AA per surface
- [ ] `tests/e2e/mobile.spec.ts` — mobile viewport functional parity
- [ ] `tests/e2e/keyboard.spec.ts` — approval keyboard shortcuts
- [ ] `tests/e2e/perf.spec.ts` — surface load time measurements
- [ ] Framework: `npm install --save-dev @axe-core/playwright` + Playwright `mobile-chrome` project config

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (sessions, sign-out all) | Supabase Auth + custom `user_sessions` table; `signOut({ scope: 'global' })` |
| V3 Session Management | yes (AUTH-04/05) | Custom session registry; revoke sets `revoked_at`; accept JWT 15-min expiry window |
| V4 Access Control | yes (approval ownership, settings mutations) | `resolveApprovalRow` ownership check; `getClaims()` + `serviceDb WHERE user_id` pattern on all new actions |
| V5 Input Validation | yes | Zod schema on every new Server Action (snoozeItem, editItem, bulkResolve, saveBrandVoice, revokeSession, exportAccountData, requestAccountDeletion) |
| V6 Cryptography | yes (brand voice at rest) | libsodium via `lib/integrations/crypto.ts` existing pattern; never hand-roll |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged snooze/edit request (cross-user approval mutation) | Tampering | `getClaims()` + `resolveApprovalRow` ownership check before any DB write (same as approveItem) |
| Bulk approve race condition (approve already-resolved item) | Tampering | `bulkResolve` queries `WHERE status = 'pending'` and uses atomic transaction; non-pending items silently skipped, not errored |
| Export job exposing another user's data | Information Disclosure | Inngest job receives `userId` from event payload; all queries filter by `userId` (serviceDb); RLS not relied upon in Inngest context |
| Session revoke bypass via JWT still valid | Elevation of Privilege | Accept 15-min JWT window per Supabase design; revoke refresh token immediately; display "signed out" in UI |
| Account deletion while active run executes | Tampering / DoS | Gate check before `inngest.send`; abort/cancel active runs in lock step |
| Edit-then-approve sending modified payload to engine | Tampering | Edited `proposed_action` stored in DB row before approval; engine reads from DB row (not event payload) per existing T-2-07-02 defense |

---

## Sources

### Primary (HIGH confidence)
- `lib/workflows/approvals.ts`, `app/app/approvals/actions.ts` — verified live code for approve/reject path, schema, resolve ordering
- `lib/db/schema/approvals.ts` — verified `snoozed_until`, `status` CHECK constraint, `expires_at` columns
- `lib/db/schema/brand-voice.ts`, `autonomy-thresholds.ts`, `memory-items.ts`, `users.ts` — verified Phase 4 schema already migrated; `deletion_requested_at` in `user_profiles`
- `supabase/migrations/0003_phase2_tables.sql`, `0004_realtime_authz.sql` — verified existing Realtime channel authorization policies
- `lib/agent/memory.ts` — verified `storeMemoryItem`/`updateMemoryItem`/`softDeleteMemoryItem` live
- `lib/workflows/revert.ts` — verified `canRevert()` and `executeRevertEffect` stub
- `lib/inngest/functions/execute-workflow-run.ts` — verified CEL pitfall documentation and L2 gate pattern
- [supabase.com/docs/guides/realtime/postgres-changes](https://supabase.com/docs/guides/realtime/postgres-changes) — Realtime subscription API
- [supabase.com/docs/guides/auth/sessions](https://supabase.com/docs/guides/auth/sessions) — session model; confirmed no per-session device API
- [supabase.com/docs/guides/auth/signout](https://supabase.com/docs/guides/auth/signout) — scope parameter for sign-out
- [supabase.com/docs/reference/javascript/storage-from-createsignedurl](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl) — signed URL API
- [inngest.com/docs/guides/delayed-functions](https://www.inngest.com/docs/guides/delayed-functions) — step.sleep pattern
- [inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events](https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events) — cancelOn pattern
- [motion.dev/docs/react-use-reduced-motion](https://motion.dev/docs/react-use-reduced-motion) — Framer Motion reduced-motion

### Secondary (MEDIUM confidence)
- [supabase.com/blog/realtime-broadcast-from-database](https://supabase.com/blog/realtime-broadcast-from-database) — Broadcast from Database pattern (considered, Postgres Changes recommended instead for this use case)
- [supabase.com/docs/guides/realtime/authorization](https://supabase.com/docs/guides/realtime/authorization) — private channel RLS patterns
- [dev.to/lra8dev/building-real-time-magic-supabase-subscriptions-in-nextjs-15](https://dev.to/lra8dev/building-real-time-magic-supabase-subscriptions-in-nextjs-15-2kmp) — Next.js 15 Realtime pattern
- [playwright.dev/docs/accessibility-testing](https://playwright.dev/docs/accessibility-testing) — axe-core/playwright integration
- [nextjs.org/docs/app/deep-dive/caching](https://nextjs.org/docs/app/deep-dive/caching) — unstable_cache and PPR

### Tertiary (LOW confidence — flag for validation)
- IP geolocation from Vercel headers: no official Vercel doc confirmed; based on common Next.js deployment practice
- Brand voice encryption status in current onboarding: not verified against onboarding code (audit required in Wave 0)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — locked by CLAUDE.md; verified versions in package.json
- Architecture (Realtime sync): HIGH — verified against Supabase docs + existing migration 0004
- Architecture (Session registry): HIGH — confirmed custom table needed per official Supabase Auth docs
- Architecture (Inngest jobs): HIGH — verified step.sleep + cancelOn patterns in official docs
- Pitfalls: HIGH — sourced from existing codebase comments (T-2-07-02, CEL pitfall) + new phase-specific analysis
- WCAG AA pass: MEDIUM — requirements well-documented; specific component-level audit depends on implementation

**Research date:** 2026-05-22
**Valid until:** 2026-06-22 (stable stack; Supabase Realtime API is stable)
