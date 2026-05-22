---
phase: 01-infrastructure-foundation
reviewed: 2026-05-21T00:00:00Z
depth: standard
files_reviewed: 50
files_reviewed_list:
  - .github/workflows/ci.yml
  - app/(auth)/login/actions.ts
  - app/(auth)/login/page.tsx
  - app/(auth)/signup/actions.ts
  - app/(auth)/signup/page.tsx
  - app/api/health/route.ts
  - app/api/inngest/route.ts
  - app/app/actions.ts
  - app/app/home/page.tsx
  - app/app/layout.tsx
  - app/auth/callback/route.ts
  - app/global-error.tsx
  - app/globals.css
  - app/layout.tsx
  - app/page.tsx
  - drizzle.config.ts
  - instrumentation-client.ts
  - instrumentation.ts
  - lib/agent/anthropic.ts
  - lib/agent/embeddings.ts
  - lib/auth/client.ts
  - lib/auth/middleware.ts
  - lib/auth/profile.ts
  - lib/auth/server.ts
  - lib/db/client.ts
  - lib/db/index.ts
  - lib/db/schema/index.ts
  - lib/db/schema/integrations.ts
  - lib/db/schema/users.ts
  - lib/inngest/client.ts
  - lib/inngest/functions/hello-world.ts
  - lib/integrations/adapter.ts
  - lib/integrations/crypto.ts
  - lib/integrations/gmail/client.ts
  - lib/integrations/shopify/client.ts
  - lib/rate-limit.ts
  - middleware.ts
  - next.config.ts
  - sentry.edge.config.ts
  - sentry.server.config.ts
  - supabase/migrations/0001_initial_schema.sql
  - tests/e2e/auth-skeleton.spec.ts
  - tests/unit/adapters.test.ts
  - tests/unit/crypto.test.ts
  - tests/unit/hello-world.test.ts
  - tests/unit/middleware.test.ts
  - tests/unit/rate-limit.test.ts
  - tests/unit/schema.test.ts
  - tests/unit/sdk-smoke.test.ts
  - tests/unit/smoke.test.ts
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: clean
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-21
**Depth:** standard
**Files Reviewed:** 50
**Status:** issues_found

## Summary

The security-sensitive surfaces (crypto, RLS wrapper, open-redirect guard, middleware JWT validation, rate-limit keying) are all correctly implemented at their cores. No hardcoded secrets, no NEXT_PUBLIC_ prefix on service keys, no `getSession()` in middleware, no `serviceDb` reachable from web-request code. The RLS policies and the multi-tenant schema are correctly structured.

Three critical findings surfaced: the `/api/health` diagnostic endpoint is unauthenticated and allows any external actor to inflate Sentry error quotas and trigger structured log emissions on demand; the signup action silently redirects users to a protected route without a session when Supabase email confirmation is enabled; and the CI pipeline has no `push` trigger on main, meaning direct commits to the main branch bypass all type-check, test, and build gates. Five warnings and three info items follow.

## Critical Issues

### CR-01: Unauthenticated Sentry-triggering endpoint at `/api/health?testError=1`

**File:** `app/api/health/route.ts:6-25`
**Issue:** The `testError=1` query parameter is handled without any authentication check or environment guard. Any unauthenticated actor — including automated scanners — can POST or GET this URL repeatedly, forcing Sentry to ingest fabricated exceptions and the Axiom log drain to capture artificial log lines. This is a quota-exhaustion and alert-spam vector. The route is publicly reachable (middleware passes it through because it carries no `/app/` prefix), and there is no `NODE_ENV === 'development'` gate or token requirement.
**Fix:** Add an environment guard and/or a secret token check before the Sentry capture path:
```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const testError = searchParams.get("testError");

  if (testError === "1") {
    // Only allow in non-production, or require a secret probe token.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    // ... existing Sentry capture + log
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
```
If the probe must work in production (for smoke-test pipelines), gate it on a `HEALTH_PROBE_SECRET` header comparison instead of removing it entirely.

---

### CR-02: Signup silently fails with no user feedback when email confirmation is enabled

**File:** `app/(auth)/signup/actions.ts:54-62`
**Issue:** `supabase.auth.signUp()` returns `{ data: { user, session: null }, error: null }` when the Supabase project requires email confirmation. The action currently checks only `error`; finding none, it calls `redirect("/app/home")`. The middleware then has no session and issues a 307 back to `/login`. The user experiences: fill form → submit → land on login page with no explanation. No "check your email" message is ever shown. This is silent data-loss from the user's perspective (they may believe signup failed or never happened).
**Fix:** Inspect `data.session` after `signUp()` to detect the confirmation-pending state:
```typescript
const supabase = await createClient();
const { data, error } = await supabase.auth.signUp({ email, password });

if (error) {
  return { error: error.message };
}

// session is null when email confirmation is required
if (!data.session) {
  return {
    error:
      "Account created — please check your email to confirm your address before signing in.",
  };
}

redirect("/app/home");
```

---

### CR-03: CI pipeline does not run on direct pushes to `main`

**File:** `.github/workflows/ci.yml:3-7`
**Issue:** The workflow is triggered only by `pull_request`. A direct `git push` to `main` (force or otherwise) skips all type checks, unit tests, and the build gate entirely. Given the security sensitivity of this foundation (RLS, encryption, auth middleware), allowing untested code to land on main without CI running is a meaningful quality and security risk. Branch protection rules alone do not substitute for a push trigger.
**Fix:** Add a `push` trigger for the `main` branch:
```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
      - "**"
```

---

## Warnings

### WR-01: `validateNextParam` does not reject backslash-prefixed paths

**File:** `app/auth/callback/route.ts:41-59`
**Issue:** The function correctly rejects `//`, `http:`, `https:`, and paths not starting with `/`. It does not reject paths starting with `/\` (backslash after the leading slash). When `next = "/\evil.example.com"` passes validation and is concatenated with `origin`, the WHATWG URL constructor normalizes the backslash to a forward slash: `http://localhost:3000//evil.example.com`. The host remains `localhost`, so this is not a complete open redirect in the standard sense — but it produces a double-slash path, and some HTTP clients (curl, older browser implementations, certain CDN edge layers) may re-interpret `//evil.example.com` as a protocol-relative URL in the Location header before parsing the full URL. The safe posture is to reject paths that would normalize to `//`.

**Fix:** Add a backslash check after the `//` check:
```typescript
// Reject paths with a backslash immediately after "/":
// /\host normalizes to //host in the WHATWG URL parser.
if (next.startsWith("/\\") || next.startsWith("/%5C") || next.startsWith("/%5c")) {
  return DEFAULT_NEXT;
}
```
Or, stronger: URL-decode the `next` parameter once before validation, then re-apply all checks against the decoded value.

---

### WR-02: `user_profiles.updated_at` has no auto-update trigger

**File:** `supabase/migrations/0001_initial_schema.sql:35`, `lib/db/schema/users.ts:48-51`
**Issue:** `updated_at` is declared `DEFAULT now() NOT NULL` in both the migration and the Drizzle schema, but there is no `BEFORE UPDATE` trigger to keep it current on subsequent `UPDATE` statements. Application code that updates a profile row without explicitly setting `updated_at = now()` will leave the column stale — it will still hold the row's creation timestamp. In an auditing-oriented product ("Trust through transparency" is a core value), stale `updated_at` values corrupt audit visibility. Phase 1 has no update paths yet, but Phase 2 will introduce them, and a missing trigger is a schema-level defect that is cheaper to fix now.

**Fix:** Add to the migration (or a new migration):
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### WR-03: `integrations.provider` and `integrations.status` have no CHECK constraints

**File:** `supabase/migrations/0001_initial_schema.sql:14-25`, `lib/db/schema/integrations.ts:46-49`
**Issue:** Both columns are `text NOT NULL` with no database-level CHECK constraint. Any string can be persisted (e.g., `provider = 'hack'`, `status = 'unknown'`). Application code reading these columns must defensively handle unexpected values. Given the schema comment explicitly documents the valid set (`'shopify' | 'gmail'` for provider; `'active' | 'expired' | 'revoked'` for status), the database should enforce this invariant — particularly since the `serviceDb` bypass-RLS client can write these rows from agent code without passing through a Zod schema.

**Fix:** Add CHECK constraints in a follow-up migration:
```sql
ALTER TABLE integrations
  ADD CONSTRAINT integrations_provider_check
    CHECK (provider IN ('shopify', 'gmail')),
  ADD CONSTRAINT integrations_status_check
    CHECK (status IN ('active', 'expired', 'revoked'));
```
And add Drizzle-level enum or check expressions to `integrations.ts` so the TypeScript types match.

---

### WR-04: Misleading "Resolved lazily" comment contradicts module-load-time evaluation

**File:** `lib/db/client.ts:44-46`
**Issue:** The comment reads: "Resolved lazily (at first client use), so unit tests that only import schema files don't require DB env to be present." This is misleading in two ways. First, `getConnectionString()` is called at module load time (line 60: `const client = postgres(getConnectionString(), ...)`), so `DATABASE_URL` must exist whenever `lib/db/client.ts` is imported — not deferred. Second, `postgres.js` itself is lazy with respect to TCP connections (it does not connect until the first query), which is the true laziness. The vitest config works around this by providing a stub `DATABASE_URL`. A future developer trusting this comment may incorrectly assume they can omit `DATABASE_URL` in test environments that import `lib/db/client`, and waste time debugging a thrown error.

**Fix:** Replace the comment at lines 44-46:
```typescript
/**
 * Resolve the Postgres connection string.
 *
 * Called at module load time — DATABASE_URL must be present whenever this
 * module is imported. The postgres.js driver itself is lazy: it does NOT
 * open a TCP connection until the first query executes.
 *
 * For unit tests: provide a stub DATABASE_URL in vitest.config.mts env.
 */
```

---

### WR-05: `drizzle.config.ts` derives a connection URL with a hardcoded AWS region

**File:** `drizzle.config.ts:22-24`
**Issue:** The fallback `dbCredentials.url` is constructed by string-manipulating `NEXT_PUBLIC_SUPABASE_URL` and hardcoding `aws-0-us-east-1.pooler.supabase.com`. Supabase projects created in other regions (e.g., `eu-west-2`, `ap-southeast-1`) have pooler hostnames in those regions. If a developer runs `drizzle-kit pull` or `drizzle-kit push` (despite the comment discouraging it), this URL will attempt to connect to the wrong region and fail with a confusing connection error. The `placeholder` password makes the intent clear, but the wrong hostname makes debugging harder.

**Fix:** Simplify the fallback to an explicit placeholder that communicates intent:
```typescript
dbCredentials: {
  // drizzle-kit generate does not connect to the DB — this field is required
  // by the config schema but unused for generate. Use Supabase CLI for live DB ops.
  url: process.env["DATABASE_URL"] ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
},
```
This also avoids re-using `NEXT_PUBLIC_SUPABASE_URL` (a browser env var) for a database credential derivation.

---

## Info

### IN-01: `useState` imported but unused in `app/(auth)/signup/page.tsx`

**File:** `app/(auth)/signup/page.tsx:20`
**Issue:** `useState` is imported from React but never called anywhere in the component. The component uses only `useActionState`. TypeScript strict mode and tsc pass because unused imports are not type errors, but this is dead import code that adds noise.

**Fix:**
```typescript
import { useActionState } from "react";
```

---

### IN-02: Broken `aria-describedby` reference in `app/(auth)/signup/page.tsx`

**File:** `app/(auth)/signup/page.tsx:65, 86`
**Issue:** Both the email and password inputs set `aria-describedby="form-error"` when an error is present, but no element in the DOM has `id="form-error"`. The error banner uses `role="alert"` and `aria-live="polite"` (which is correct for screen-reader announcement), but the `aria-describedby` points to a nonexistent element. Screen readers that rely on `aria-describedby` to read error context when the user focuses an invalid field will find nothing. The `role="alert"` approach already handles announcement on insert — the broken `aria-describedby` should either be wired to a real element or removed.

**Fix:** Either assign the `id` to the error div:
```tsx
{state?.error && (
  <div
    id="form-error"
    role="alert"
    aria-live="polite"
    className="mb-4 ..."
  >
    {state.error}
  </div>
)}
```
Or remove the `aria-describedby` from the inputs (the `role="alert"` already handles screen reader announcement).

---

### IN-03: `console.error` in `GoogleSignInButton` leaks OAuth error strings to browser console in production

**File:** `app/(auth)/login/page.tsx:34-36`
**Issue:** `console.error("Google OAuth error:", error.message)` runs in the browser in production. While Google OAuth error messages from Supabase are not inherently sensitive, any error detail appearing unconditionally in the production console is noise for end users and a low-grade information disclosure. The comment says "On success, the browser follows the OAuth redirect chain" — on failure, the user sees no feedback (the error is only logged, not displayed).

**Fix:** Either surface the error to the user (display an alert/error state in the component) or, at minimum, gate the console output on `process.env.NODE_ENV !== "production"`. Given the UX gap (users see no error when Google OAuth fails), surfacing an inline error message is the better fix:
```typescript
const [oauthError, setOauthError] = useState<string | null>(null);

async function handleGoogleSignIn() {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signInWithOAuth({ ... });
  if (error) {
    setOauthError("Google sign-in failed. Please try again.");
  }
}

// In JSX:
{oauthError && <p role="alert" className="text-sm text-red-600">{oauthError}</p>}
```

---

_Reviewed: 2026-05-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
