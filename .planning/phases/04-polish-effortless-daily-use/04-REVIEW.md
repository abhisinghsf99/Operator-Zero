---
phase: 04-polish-effortless-daily-use
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - app/app/approvals/actions.ts
  - app/app/approvals/_list.tsx
  - app/app/approvals/_detail.tsx
  - app/app/approvals/_inline-card.tsx
  - app/app/approvals/_realtime-sync.tsx
  - app/app/approvals/page.tsx
  - app/app/approvals/layout.tsx
  - app/app/settings/actions.ts
  - app/app/settings/page.tsx
  - app/app/settings/_brand-voice.tsx
  - app/app/settings/_autonomy.tsx
  - app/app/settings/_sessions.tsx
  - app/app/settings/_danger.tsx
  - lib/actions/workflows.ts
  - lib/cache-tags/workflows.ts
  - lib/auth/session-registry.ts
  - lib/workflows/approvals.ts
  - lib/workflows/autonomy.ts
  - lib/inngest/functions/execute-workflow-run.ts
  - lib/inngest/functions/export-account-data.ts
  - lib/inngest/functions/purge-account.ts
  - app/api/inngest/route.ts
  - app/(auth)/login/actions.ts
  - app/auth/callback/route.ts
  - components/layout/sidebar.tsx
  - lib/db/schema/user-sessions.ts
  - lib/db/schema/user-exports.ts
  - lib/db/schema/workflow-versions.ts
  - lib/db/schema/index.ts
  - supabase/migrations/0006_phase4_sessions_exports.sql
  - supabase/migrations/0007_workflow_versions_rls.sql
findings:
  critical: 5
  warning: 5
  info: 3
  total: 13
status: fixed
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-22
**Depth:** standard (TypeScript/React/Next.js App Router + Postgres RLS, security-focused)
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 4 introduces the Approvals Inbox polish, Settings surface (brand voice, memory, autonomy, sessions, danger zone), session registry, and account lifecycle (export + purge). The security-critical patterns — Zod validation, `getClaims().sub` for userId, ownership re-checks before DB writes, serviceDb with explicit `user_id` filters, encrypted brand voice, and the CEL `async`/`event` inversion in Inngest — are all correctly implemented. The engine re-reads the approval row from the DB before executing (defeating forged events), the cancelOn CEL is correct, and the 7-day grace period is wired end-to-end.

Five blockers were found. Three are data-loss or correctness bugs: `saveBrandVoice` silently no-ops if the user has no existing profile row; `resolveApprovalRow` lacks a `status='pending'` guard, enabling double-resolution of already-approved/rejected rows; and `getLatestExport` fetches the oldest row instead of the most recent. One is a scoped security issue: `revokeSession` calls `admin.signOut(userId, "others")` which revokes all OTHER sessions for the user, not the single targeted session. One is a multi-tenant scoping gap: `getPendingApprovals` and `fetchPendingCount` accept an arbitrary `userId` from the caller without enforcing that it matches the authenticated user, so any RSC that passes the wrong userId would leak data. The remaining warnings and info items are lower-severity quality issues.

---

## Critical Issues

### CR-01: `saveBrandVoice` silently no-ops when no profile row exists

**File:** `app/app/settings/actions.ts:272-276`
**Issue:** `saveBrandVoice` executes a bare `UPDATE` on `brand_voice_profiles WHERE user_id = userId`. If the user has no existing row (e.g. onboarding wrote to a different table, or the row was deleted), the UPDATE silently matches zero rows and returns without error. The caller receives `undefined` (success), but the encrypted markdown is never persisted. The user sees "Saved" but their brand voice is gone on the next page load.
**Fix:** Convert to an upsert so a missing row is created rather than silently discarded:
```typescript
await serviceDb
  .insert(brandVoiceProfiles)
  .values({
    user_id: userId,
    profile_markdown: encrypted,
    updated_at: new Date(),
  })
  .onConflictDoUpdate({
    target: brandVoiceProfiles.user_id,
    set: { profile_markdown: encrypted, updated_at: new Date() },
  });
```

---

### CR-02: `resolveApprovalRow` allows double-resolution (approve/reject an already-resolved row)

**File:** `lib/workflows/approvals.ts:127-151`
**Issue:** The ownership lookup at line 128-136 only checks `(id, user_id)` — it does NOT check `status = 'pending'`. A row that is already `'approved'`, `'rejected'`, or `'expired'` will pass the ownership check and be overwritten. This means `approveItem` can re-fire `approval.resolved` for a row that was already approved, sending a duplicate Inngest event and potentially resuming a workflow that already completed. The `bulkResolveApprovals` helper correctly guards with `status = 'pending'`, but `resolveApprovalRow` does not.
**Fix:** Add a pending-only guard in the ownership SELECT:
```typescript
.where(and(
  eq(approvals.id, approvalId),
  eq(approvals.user_id, userId),
  eq(approvals.status, "pending")   // add this
))
```
If `!existing` return null as now — the caller already handles that case. This also implicitly prevents snoozed rows from being resolved without first un-snoozing them.

---

### CR-03: `getLatestExport` returns the oldest row, not the most recent

**File:** `app/app/settings/actions.ts:896-897`
**Issue:** The query uses `.orderBy(userExports.created_at)` (ascending, oldest first) then `.limit(1)`. This returns the oldest export row, not the most recent one. As a result, after a user triggers a second export, the Settings UI will display the stale first export's signed URL — potentially an already-expired 24h link — while the new export's status is never shown.
**Fix:** Reverse the sort order:
```typescript
import { desc } from "drizzle-orm";
// ...
.orderBy(desc(userExports.created_at))
.limit(1);
```

---

### CR-04: `revokeSession` revokes ALL other sessions, not the targeted one

**File:** `lib/auth/session-registry.ts:250-253`
**Issue:** The per-session revoke path calls `admin.auth.admin.signOut(userId, "others")`. The Supabase Admin API's `signOut(uid, "others")` scope revokes ALL OTHER sessions for that user, not the single `supabaseSessionId` in the targeted row. If the user has three active sessions and revokes session B, this call also invalidates session C — a silent over-revocation. The `user_sessions` table row is correctly marked revoked, but the Supabase side-effect is far broader than intended.
**Fix:** Use the session-level signout if `existing.supabase_session_id` is available:
```typescript
if (existing.supabase_session_id) {
  // Revoke this specific Supabase session by its session_id
  // Supabase Admin: no direct per-session signout endpoint in v2 JS client.
  // Safest fallback: call signOut(userId, "others") only if this is NOT
  // the caller's own session; otherwise accept the JWT window (T-4-04-04).
  // Document this limitation clearly in the UI (D-10 honesty).
  await admin.auth.admin.signOut(userId, "others");
} else {
  // No supabase_session_id — cannot target a single session; skip Supabase side-call.
  // Row is already marked revoked; JWT expires within ~15 min window.
}
```
Alternatively, if all sessions have `supabase_session_id` populated, only call signOut when the caller can identify which is the "current" session to avoid collateral invalidation. At minimum, the scope must be documented in the UI more precisely.

---

### CR-05: `getPendingApprovals` and `fetchPendingCount` accept caller-supplied `userId` without re-validating against the authenticated session

**File:** `app/app/approvals/actions.ts:556-630`
**Issue:** Both `getPendingApprovals(userId, opts)` and `fetchPendingCount(userId)` are exported Server Actions that take an arbitrary `userId` as a parameter. They use `serviceDb` (bypasses RLS) and filter by that userId. Because `"use server"` functions are callable from any client context, a crafted call with a different `userId` would silently return another user's pending approvals or count. The page RSC currently passes `profile.user_id` from `getOrCreateProfile()`, which is safe. But because these are exported from the actions file, they are callable as standalone Server Action endpoints with any payload.

Unlike mutation actions, these read-only functions do not call `requireUserId()` to bind the query to the authenticated session. This is the pattern gap: mutation actions all call `requireUserId()` internally; the read functions rely on the caller passing the right userId.
**Fix:** Add an auth check at the top of each function:
```typescript
export async function getPendingApprovals(
  userId: string,
  opts: { showSnoozed?: boolean } = {}
): Promise<PendingApproval[]> {
  // Re-validate: userId must match the authenticated session
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const authedUserId = data?.claims?.sub;
  if (!authedUserId || authedUserId !== userId) {
    return []; // or throw
  }
  // ... rest of query
}
```
Apply the same pattern to `fetchPendingCount`, `getBrandVoice`, `getMemoryItems`, `getAutonomyThresholds`, `listSessions`, and `getLatestExport` in settings/actions.ts — all accept an arbitrary `userId` parameter and use `serviceDb`.

---

## Warnings

### WR-01: `listSessions` sort order is ascending (oldest-first) in both `settings/actions.ts` and `session-registry.ts`

**File:** `app/app/settings/actions.ts:829` and `lib/auth/session-registry.ts:210`
**Issue:** Both `listSessions` implementations use `.orderBy(userSessions.last_seen_at)` without `desc()`. The docstring says "ordered by `last_seen_at` descending (most recently active first)" but the actual sort is ascending (least recently active first). The current active session, which is the most important one to show at the top, will appear at the bottom of the list.
**Fix:**
```typescript
import { desc } from "drizzle-orm";
// ...
.orderBy(desc(userSessions.last_seen_at));
```

---

### WR-02: `export-account-data` re-creates a row on every export via `onConflictDoNothing`; old completed exports are never updated to a failed state on retry

**File:** `lib/inngest/functions/export-account-data.ts:182-193`
**Issue:** The `notify-user` step inserts a new `user_exports` row with `onConflictDoNothing()`. Because there is no unique constraint defined on `user_exports` beyond the primary key `id`, this never conflicts and always inserts a new row on each export run. The `getLatestExport` query (once fixed by CR-03 above) will show the newest row, but there is no cleanup of stale pending rows from prior failed runs. A user who exports twice will accumulate rows with `status='pending'` that never transition to `'failed'`. Combined with CR-03, the current code returns the *oldest* pending row, masking the real latest result indefinitely.
**Fix:** Either add a `UNIQUE(user_id)` constraint and use `onConflictDoUpdate`, or run a preceding `UPDATE ... SET status='superseded'` on prior pending rows before inserting the new one. The `onConflictDoNothing` should be replaced with a proper upsert keyed on `user_id` if only one export per user should be tracked.

---

### WR-03: `recordSession` inserts a new row without `supabase_session_id` on every login flow that lacks a session_id claim

**File:** `lib/auth/session-registry.ts:171-180`
**Issue:** When `input.supabaseSessionId` is null/undefined, the code falls through to an unconditional `insert`. This means each login attempt (including retries after a failed password, token refresh edge cases, or any auth flow that doesn't embed `session_id` in the JWT) will create a new `user_sessions` row with no deduplication key. Over time this creates unbounded row growth for users on certain auth flows. More critically, these orphaned rows are never revoked by `revokeSession` (which looks up by the ORM-managed `id`, not `supabase_session_id`), so they persist until manual cleanup.
**Fix:** For the no-session-id path, either skip the insert entirely (if the session cannot be tracked it should not be shown in the Sessions list) or add a short-circuit that logs a warning and returns:
```typescript
if (!sessionId) {
  // Cannot deduplicate without session_id — skip to avoid unbounded row growth
  console.warn(JSON.stringify({ level: "warn", event: "session.record.no_session_id", userId }));
  return;
}
```

---

### WR-04: `getPendingApprovals` pushes a redundant duplicate `status='pending'` condition into the WHERE clause

**File:** `app/app/approvals/actions.ts:575-579`
**Issue:** Lines 575-578 push a second `eq(approvals.status, "pending")` onto the conditions array with a comment saying "already filtered." This is dead code — the identical condition was already pushed at line 566. The generated SQL will have `WHERE ... AND status = 'pending' AND status = 'pending'`, which is harmless to the database but signals incomplete cleanup during the `expires_at` guard refactor and may confuse future maintainers into thinking it serves a different purpose.
**Fix:** Remove lines 575-579 entirely. The `expires_at > now` post-filter on line 595 is the right place for the expiry gate since the `expires_at` comparison isn't easily expressed as a partial index scan.

---

### WR-05: `_detail.tsx` keyboard shortcut handler references `handleApprove` inside `useEffect` but `handleApprove` is not in the dependency array

**File:** `app/app/approvals/_detail.tsx:103-135`
**Issue:** The keyboard handler closure at line 117 calls `handleApprove()`. `handleApprove` is defined outside the `useEffect` at line 138 and captures `approval.id` and `startTransition` from the outer scope. The `useEffect` dependency array at line 135 only lists `[isPending, approval.id]`, not `handleApprove`. Because `handleApprove` is redefined on every render (it's a plain function, not `useCallback`), the closure inside `useEffect` will always see the stale first render's version of `handleApprove`. In practice this is mostly harmless (the approval and callbacks don't change identity often), but the ESLint disable comment on line 134 explicitly acknowledges this is a suppressed lint warning rather than a deliberate choice. If `handleApprove` were ever extracted to capture additional props, this stale closure would silently use the wrong version.
**Fix:** Wrap `handleApprove` in `useCallback` with `[approval.id, startTransition]` as dependencies, then add it to the `useEffect` dep array and remove the `eslint-disable` comment.

---

## Info

### IN-01: `isNotNull` imported but unused in `settings/actions.ts`

**File:** `app/app/settings/actions.ts:47`
**Issue:** `isNotNull` is imported from `drizzle-orm` but is not used anywhere in the file. This is a dead import.
**Fix:** Remove `isNotNull` from the import:
```typescript
import { eq, and, isNull, inArray } from "drizzle-orm";
```

---

### IN-02: Export job `user_exports` table has no unique constraint but the schema comment implies one-per-user semantics

**File:** `lib/db/schema/user-exports.ts` and `supabase/migrations/0006_phase4_sessions_exports.sql`
**Issue:** The table has no unique constraint beyond the PK. The `onConflictDoNothing()` call in the export job (see WR-02) implies a unique constraint was intended. Without one, the conflict handler is a no-op and each export run always inserts. This is a schema design gap that should be closed before GA to prevent unbounded row accumulation.
**Fix:** Add `UNIQUE(user_id)` to the migration and to the Drizzle schema, or add a `UNIQUE(user_id, created_at::date)` if multiple exports per day are expected.

---

### IN-03: `_detail.tsx` Revert button shown for any item with `resolved_at` set, including rejected items

**File:** `app/app/approvals/_detail.tsx:436-448`
**Issue:** The Revert button renders whenever `approval.resolved_at` is truthy. The `PendingApproval` type includes `resolved_at: Date | null`, and both approved and rejected items can have this set. The server-side `revertApproved` action correctly gates on `existing.status !== "approved"` and returns an error for non-approved items, but the client shows the button for rejected rows too, causing a confusing "Only approved items can be reverted" error on click rather than simply hiding the button.
**Fix:** Condition on both `resolved_at` and the approval status:
```tsx
{approval.resolved_at && approval.status === "approved" && (
  // Revert button
)}
```
Since `PendingApproval` is fetched with `status='pending'` filter via `getPendingApprovals`, this button will rarely render in the inbox view. But if the `PendingApproval` type is ever reused in other surfaces (e.g. showing recently-resolved items), the guard matters.

---

## Summary

Five blockers require fixes before ship: silent brand-voice data loss on first save (CR-01), double-resolution of already-settled approvals (CR-02), stale export link shown to user (CR-03), over-broad session revocation (CR-04), and unauthenticated userId parameter on exported read functions (CR-05). Two warnings affect UX correctness (sessions/exports shown in wrong order). The core security invariants — ownership re-checks, DB-authoritative approval decisions, CEL correctness, encrypted brand voice, and per-user RLS — are all sound.

---

_Reviewed: 2026-05-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
