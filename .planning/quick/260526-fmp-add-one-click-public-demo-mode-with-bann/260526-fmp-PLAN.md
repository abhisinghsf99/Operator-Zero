---
phase: quick-260526-fmp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/auth/demo.ts
  - app/(auth)/login/actions.ts
  - app/(auth)/login/page.tsx
  - components/layout/demo-banner.tsx
  - app/app/layout.tsx
  - app/app/settings/actions.ts
autonomous: true
requirements: [DEMO-01]

must_haves:
  truths:
    - "A visitor on /login can click one prominent button and land authenticated in /app/workflows as the seeded demo user (real Supabase session, no credentials typed)"
    - "While signed in as the demo user, every /app/* page shows a slim, non-dismissible 'Demo' banner at the top"
    - "A non-demo user sees the app shell exactly as before — no banner"
    - "The demo user cannot run destructive settings actions (disconnect integration, request deletion, sign out everywhere, revoke session, update email, update password) — they get the disabled message instead"
    - "Demo credentials never reach the client bundle (server-only env, no NEXT_PUBLIC_, never in a 'use client' file)"
    - "The existing email/password login, Google sign-in, and signup link still work unchanged below the demo CTA"
  artifacts:
    - path: "lib/auth/demo.ts"
      provides: "isDemoUser(), getDemoCredentials(), DEMO_DISABLED_MESSAGE — server-only demo helpers"
      contains: "export function isDemoUser"
    - path: "components/layout/demo-banner.tsx"
      provides: "DemoBanner strip component"
      contains: "DemoBanner"
  key_links:
    - from: "app/(auth)/login/page.tsx"
      to: "enterDemo in app/(auth)/login/actions.ts"
      via: "startTransition onClick of primary CTA"
      pattern: "enterDemo"
    - from: "app/app/layout.tsx"
      to: "isDemoUser in lib/auth/demo.ts"
      via: "getClaims().sub passed to isDemoUser; conditional <DemoBanner/>"
      pattern: "isDemoUser"
    - from: "app/app/settings/actions.ts"
      to: "isDemoUser / DEMO_DISABLED_MESSAGE in lib/auth/demo.ts"
      via: "early-return guard after userId resolution in 6 destructive actions"
      pattern: "isDemoUser\\(userId\\)"
---

<objective>
Add a public, one-click "demo mode": a visitor enters the seeded demo account via a real Supabase
session (real auth + RLS path, no weakening), sees a persistent in-app "this is a demo" banner, and
is blocked from destructive settings actions.

Purpose: Let anyone evaluate Operator Zero end-to-end without credentials, while keeping the auth/RLS
model intact and demo credentials strictly server-only.

Output: A server-only demo helper, an `enterDemo()` server action, a reskinned login page with the
demo CTA as the primary path, a conditional in-app demo banner, and demo guards on 6 destructive
settings actions. TypeScript stays strict-clean and all 351 existing tests stay green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<constraints>
- Demo credentials are SERVER-ONLY. `lib/auth/demo.ts` MUST NOT have "use client", MUST NOT be imported by any client component, and MUST NOT reference NEXT_PUBLIC_ or expose DEMO_PASSWORD to the client.
- Env vars DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER_ID already exist in .env.local + Vercel. Do NOT add, commit, or modify env files. Do NOT touch the seed.
- Do NOT modify middleware.ts, lib/auth/middleware.ts, or any RLS. The visitor becomes the demo user via a real signInWithPassword session — the existing auth model is unchanged.
- TypeScript strict must stay clean: `npx tsc --noEmit`. All tests must stay green: `npx vitest run` (351 pass).
- Use existing design primitives/tokens (components/design/primitives.tsx Button, design tokens var(--...)). Preserve WCAG: label associations, role="alert" region, keyboard order.
</constraints>

<interfaces>
<!-- Extracted from the codebase — use these directly, no exploration needed. -->

From lib/auth/server.ts:
```typescript
export async function createClient(): Promise<SupabaseClient>;
// getClaims usage: const { data } = await supabase.auth.getClaims(); const userId = data?.claims?.sub;
```

login() post-sign-in block to mirror (app/(auth)/login/actions.ts) — recordSession + cancelDeletionIfPending,
wrapped in try/catch that logs but does NOT block, then redirect():
```typescript
import { recordSession, cancelDeletionIfPending } from "@/lib/auth/session-registry";
import { inngest } from "@/lib/inngest/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
// inside the action, after a successful signInWithPassword:
try {
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (userId) {
    const sessionId = (claimsData?.claims as Record<string, unknown> | null)?.["session_id"] as string | null ?? null;
    const headerStore = await headers();
    await recordSession(userId, {
      rawUa: headerStore.get("user-agent"),
      ip: headerStore.get("x-forwarded-for"),
      countryCode: headerStore.get("x-vercel-ip-country"),
      supabaseSessionId: sessionId,
    });
    await cancelDeletionIfPending(userId, inngest);
  }
} catch (sessionErr) {
  console.error(JSON.stringify({ level: "warn", event: "auth.login.session_registry_failed", error: String(sessionErr) }));
}
redirect("/app/workflows");
```

Button (components/design/primitives.tsx): accepts `variant`, `size`, `accent`, `style`, `disabled`,
children, onClick, type. Full-width is done via `style={{ width: "100%" }}` (as the existing Sign in button does).

AuthDivider (components/auth/google-auth-button.tsx): `export function AuthDivider()` — renders a centered "or" hairline divider.

Settings actions return-type contracts (app/app/settings/actions.ts) — match exactly per function:
```typescript
disconnectIntegration(provider: string): Promise<{ error: string } | void>      // userId = claims.sub after getValidatedClaims
requestAccountDeletion(): Promise<{ error: string } | void>                       // userId = claims.sub after getValidatedClaims
signOutEverywhere(): Promise<{ success: true } | { error: string }>               // userId = claims.sub after getValidatedClaims
revokeSession(sessionId: string): Promise<{ success: true } | { error: string }>  // userId = claims.sub AFTER Zod parse
updateEmail(email: string): Promise<{ error: string } | void>                     // resolves claims, no userId var (add const userId = claims.sub as string before guard)
updatePassword(password: string): Promise<{ error: string } | void>              // resolves claims, no userId var (add const userId = claims.sub as string before guard)
```
Note: `{ error: DEMO_DISABLED_MESSAGE }` satisfies BOTH `{ error: string } | void` and `{ success: true } | { error: string }`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server-only demo helper + enterDemo() action + login CTA</name>
  <files>lib/auth/demo.ts, app/(auth)/login/actions.ts, app/(auth)/login/page.tsx</files>
  <action>
Create `lib/auth/demo.ts` (NO "use client" — server-only). Export three things:
  - `isDemoUser(userId: string | null | undefined): boolean` — return true iff `process.env.DEMO_USER_ID` is set (truthy) AND `userId === process.env.DEMO_USER_ID`. Return false otherwise.
  - `getDemoCredentials(): { email: string; password: string } | null` — read `process.env.DEMO_EMAIL` and `process.env.DEMO_PASSWORD`; return `{ email, password }` only if BOTH are present, else `null`.
  - `export const DEMO_DISABLED_MESSAGE = "This action is disabled in the live demo.";`
Do not reference NEXT_PUBLIC_ and never expose DEMO_PASSWORD beyond this server module.

Add `enterDemo()` to `app/(auth)/login/actions.ts` (file already has "use server"):
  - Signature: `export async function enterDemo(): Promise<{ error: string } | never>`.
  - Import `getDemoCredentials` from `@/lib/auth/demo`.
  - `const creds = getDemoCredentials(); if (!creds) return { error: "Demo is not configured." };`
  - `const supabase = await createClient(); const { error } = await supabase.auth.signInWithPassword(creds); if (error) return { error: error.message };`
  - Then mirror the existing `login()` post-sign-in block verbatim in spirit (see <interfaces>): try/catch around getClaims → recordSession({ rawUa, ip, countryCode, supabaseSessionId }) + cancelDeletionIfPending(userId, inngest); log-but-don't-block on failure.
  - `redirect("/app/workflows");` (redirect throws — this is the `never` branch; do not wrap it in the try/catch).
  - Reuse the existing imports already at the top of actions.ts (createClient, redirect, headers, recordSession, cancelDeletionIfPending, inngest); only add the `getDemoCredentials` import. (DEMO-01)

Update `app/(auth)/login/page.tsx` (keep "use client"):
  - Import `enterDemo` from `./actions`. Add `useTransition` and a local `demoError` state (`useState<string | null>(null)`) alongside the existing `useActionState`.
  - At the TOP of the card, right after the Brand block and BEFORE the `<h1>Welcome back</h1>`, render the primary demo CTA: a `Button` with `variant="primary" accent="chat" size="lg" style={{ width: "100%" }}`, label `"View the live demo →"` (when pending: `"Entering demo…"`), `disabled={isDemoPending}`. onClick: `setDemoError(null); startTransition(async () => { const res = await enterDemo(); if (res && "error" in res) setDemoError(res.error); });` (success redirects server-side — no success branch needed).
  - Directly beneath the CTA: a muted line at ~12px, color `var(--text-tertiary)`: "This is a portfolio demo of Operator Zero — not the real product. Data is illustrative."
  - Then an `AuthDivider` (already imported) — or a labeled divider reading "Or sign in to your account" — separating the demo CTA from the existing login region.
  - Surface `demoError` in the SAME error presentation as the form: either reuse the existing `role="alert"` block by rendering it when `state?.error || demoError` is set (display whichever is present), or add a second identically-styled `role="alert"` block directly under the CTA. Keep one consistent alert style.
  - Leave the existing `<h1>`, subtitle, email/password form, Sign in button, Google button, and signup link UNCHANGED (same labels, htmlFor associations, keyboard order, actions). The demo CTA is the visual primary; the real login is subordinate but fully functional.

Do NOT place fenced code in the implementation — write the actual TSX/TS in the files.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -30 && grep -c "use client" lib/auth/demo.ts</automated>
  </verify>
  <done>
`npx tsc --noEmit` is clean. `lib/auth/demo.ts` exists with isDemoUser/getDemoCredentials/DEMO_DISABLED_MESSAGE and zero "use client" occurrences (grep returns 0). `enterDemo` is exported from login/actions.ts and redirects to /app/workflows. Login page renders the demo CTA above "Welcome back" with the disclaimer line and a divider, the existing form/Google/signup unchanged, and demo errors shown in a role="alert" region.
  </done>
</task>

<task type="auto">
  <name>Task 2: DemoBanner component + conditional wire into app layout</name>
  <files>components/layout/demo-banner.tsx, app/app/layout.tsx</files>
  <action>
Create `components/layout/demo-banner.tsx` exporting `DemoBanner` (plain/server component, no interactivity, no "use client" needed):
  - A slim, full-width, non-dismissible strip. `role="note"`, `aria-label="Demo notice"`.
  - Copy (exact): "Demo — you're viewing a portfolio demo of Operator Zero with sample data, not the live product."
  - Style with design tokens: background `var(--acc-chat-bg)`, color `var(--text-secondary)`, font-size ~12px, text centered, a 0.5px bottom hairline `var(--border)`, height ~30px, `flex-shrink: 0` (so it never collapses in the column). No buttons, no dismiss control.

Update `app/app/layout.tsx` (Server Component — change it to `async`):
  - Import `createClient` from `@/lib/auth/server`, `isDemoUser` from `@/lib/auth/demo`, and `DemoBanner` from `@/components/layout/demo-banner`.
  - Make `AppLayout` async. Inside: `const supabase = await createClient(); const { data: claimsData } = await supabase.auth.getClaims(); const isDemo = isDemoUser(claimsData?.claims?.sub as string | undefined);`
  - Restructure the OUTER wrapper into a vertical COLUMN that fills the screen: keep `h-screen overflow-hidden bg-[var(--bg)]` but make it `flex flex-col`. First child: `{isDemo && <DemoBanner />}`. Second child: the EXISTING `flex` row (Sidebar + main + BottomTabs) wrapped in a `<div>` that is `flex flex-1 min-h-0` (so it fills the remaining height and the main area's `overflow-y-auto` scrolling still works). Move the existing `flex` row's classes onto that inner div.
  - Do NOT change Sidebar / BottomTabs / main internals beyond moving them inside the new inner flex-row div. When `isDemo` is false the banner is simply not rendered and the shell looks/behaves exactly as before.
  - Keep the existing `metadata` export and `id="main-content"` / `tabIndex={-1}` on `<main>`.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -30 && grep -c "DemoBanner" app/app/layout.tsx</automated>
  </verify>
  <done>
`npx tsc --noEmit` clean. `components/layout/demo-banner.tsx` exports DemoBanner with role="note" and the exact copy. `app/app/layout.tsx` is async, computes isDemo via isDemoUser(getClaims().sub), wraps the shell in a flex-col with `{isDemo && <DemoBanner/>}` on top and the existing Sidebar/main/BottomTabs row as a flex-1 min-h-0 inner div. Non-demo render is structurally unchanged from before.
  </done>
</task>

<task type="auto">
  <name>Task 3: Guard 6 destructive settings actions for the demo user</name>
  <files>app/app/settings/actions.ts</files>
  <action>
Import `isDemoUser` and `DEMO_DISABLED_MESSAGE` from `@/lib/auth/demo` at the top of `app/app/settings/actions.ts`.

In EACH of the following functions, immediately AFTER the authenticated `userId` is resolved and BEFORE any mutation / Inngest send / Supabase admin / DB write, add:
`if (isDemoUser(userId)) return { error: DEMO_DISABLED_MESSAGE };`

Match each function's exact return type (the `{ error: ... }` shape conforms to both `{ error: string } | void` and `{ success: true } | { error: string }`):
  - `disconnectIntegration` — guard after `const userId = claims.sub as string;` (before the withUserRls delete).
  - `requestAccountDeletion` — guard after `const userId = claims.sub as string;` (before the active-run gate / Inngest send).
  - `signOutEverywhere` — guard after `const userId = claims.sub as string;` (before registrySignOutEverywhere).
  - `revokeSession` — guard after `const userId = claims.sub as string;` (which is resolved AFTER the Zod parse + getValidatedClaims — place the guard there, before registryRevokeSession).
  - `updateEmail` — this function currently does NOT declare a `userId` var; after `getValidatedClaims()` succeeds, add `const userId = claims.sub as string;` then the guard, before `supabase.auth.updateUser({ email })`.
  - `updatePassword` — same as updateEmail: add `const userId = claims.sub as string;` after claims resolve, then the guard, before `supabase.auth.updateUser({ password })`.

Do NOT guard or touch: saveBrandVoice, regenerateBrandVoice, addMemoryItem, editMemoryItem, deleteMemoryItem, undoDeleteMemoryItem, updateProfile, saveAutonomyThresholds, exportAccountData, cancelDeletion — and do NOT touch the approvals actions. Those stay fully interactive for the demo user.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -30 && grep -c "isDemoUser(userId)" app/app/settings/actions.ts</automated>
  </verify>
  <done>
`npx tsc --noEmit` clean. Exactly 6 `isDemoUser(userId)` guards exist (one each in disconnectIntegration, requestAccountDeletion, signOutEverywhere, revokeSession, updateEmail, updatePassword), each returning `{ error: DEMO_DISABLED_MESSAGE }` and each placed before the action's mutation. The non-destructive actions and approvals actions are untouched.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` is clean (no new errors introduced).
- `npx vitest run` — all 351 existing tests still pass.
- `grep -rn "DEMO_PASSWORD\|getDemoCredentials\|DEMO_USER_ID" --include=*.tsx` returns no hits in any "use client" file (demo creds stay server-only).
- middleware.ts, lib/auth/middleware.ts, RLS, seed, and env files are unmodified (`git status` shows only the 6 files in files_modified).
</verification>

<success_criteria>
- Visiting /login shows a prominent "View the live demo →" primary CTA above the existing login form, with the portfolio-demo disclaimer line and a divider; clicking it signs in as the seeded demo user and lands on /app/workflows.
- The existing email/password login, Google sign-in, and signup link remain fully functional and unchanged.
- Every /app/* page shows the slim non-dismissible "Demo" banner when signed in as the demo user; a normal user sees the shell exactly as before.
- The demo user is blocked (with "This action is disabled in the live demo.") from disconnectIntegration, requestAccountDeletion, signOutEverywhere, revokeSession, updateEmail, updatePassword — and can still use all non-destructive settings + approvals actions.
- Demo credentials never appear in the client bundle; auth model, middleware, RLS, seed, and env files are untouched.
- TypeScript strict clean; 351 tests green.
</success_criteria>

<output>
Create `.planning/quick/260526-fmp-add-one-click-public-demo-mode-with-bann/260526-fmp-SUMMARY.md` when done.
</output>
