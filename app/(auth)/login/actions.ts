"use server";

/**
 * app/(auth)/login/actions.ts
 * Server Action: email + password sign-in.
 *
 * Calls supabase.auth.signInWithPassword() and redirects to /app/home on success.
 * On failure, returns the error message to the form (no silent swallow).
 *
 * SECURITY:
 *   - Uses server-side createClient() only.
 *   - Zod validates inputs before calling Supabase.
 *   - Supabase errors are surfaced verbatim to the form (they are safe to display
 *     — Supabase error messages do not leak internal state).
 *
 * PHASE 4 (D-10):
 *   On successful sign-in, records a user_sessions row (recordSession) and cancels
 *   any pending account deletion (D-09 grace cancel: signing in during the 7-day
 *   grace period reverses the deletion request by sending account.deletion_cancelled
 *   to Inngest + clearing deletion_requested_at).
 *
 *   UA/IP are stored as display labels only — never used as trust decisions (T-4-04-06).
 *   Session registry failure is logged but does NOT block the login redirect.
 */
import { createClient } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { recordSession, cancelDeletionIfPending } from "@/lib/auth/session-registry";
import { inngest } from "@/lib/inngest/client";
import { getDemoCredentials } from "@/lib/auth/demo";
import { seedDemoFor } from "@/lib/demo/seed";
import { serviceDb } from "@/lib/db/client";
import { sandboxSessions } from "@/lib/db/schema";
import { sandboxCreateRateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Please enter your password."),
});

/**
 * login — Server Action bound to the login form.
 *
 * Returns an error string on validation/auth failure.
 * Redirects to /app/home on success.
 */
export async function login(
  formData: FormData
): Promise<{ error: string } | never> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid input.";
    return { error: firstError };
  }

  const { email, password } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // ── Phase 4: Session registry + D-09 grace cancel ───────────────────────────
  // Record the session and cancel any pending deletion.
  // Non-fatal: errors here must NOT block the login redirect.
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (userId) {
      const sessionId = (claimsData?.claims as Record<string, unknown> | null)?.["session_id"] as string | null ?? null;
      // A4: coarse geo from request headers — no third-party API call
      const headerStore = await headers();
      await recordSession(userId, {
        rawUa: headerStore.get("user-agent"),
        ip: headerStore.get("x-forwarded-for"),
        countryCode: headerStore.get("x-vercel-ip-country"),
        supabaseSessionId: sessionId,
      });
      // D-09: cancel pending deletion if user signed in during grace period
      await cancelDeletionIfPending(userId, inngest);
    }
  } catch (sessionErr) {
    // Log but do not block — session registry failure is not a login blocker
    console.error(JSON.stringify({
      level: "warn",
      event: "auth.login.session_registry_failed",
      error: String(sessionErr),
    }));
  }

  redirect("/app/home");
}

/**
 * enterDemo — Server Action: sign in as the seeded demo user.
 *
 * Reads demo credentials from server-side env vars (DEMO_EMAIL, DEMO_PASSWORD).
 * Credentials never reach the client — this is a server action.
 * On success, records the session and redirects to /app/workflows.
 * On failure, returns { error } (redirect() throws, so never branch is satisfied).
 *
 * SECURITY: getDemoCredentials() reads from process.env server-side only.
 *   The client never sees the credentials — it only calls this server action.
 */
export async function enterDemo(): Promise<{ error: string } | never> {
  const creds = getDemoCredentials();
  if (!creds) return { error: "Demo is not configured." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(creds);
  if (error) return { error: error.message };

  // Mirror the existing login() post-sign-in block: record session + cancel pending deletion.
  // Non-fatal: errors here must NOT block the demo redirect.
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
    console.error(JSON.stringify({
      level: "warn",
      event: "auth.enterDemo.session_registry_failed",
      error: String(sessionErr),
    }));
  }

  // redirect() throws — satisfies the `never` branch; must be outside try/catch
  redirect("/app/workflows");
}

/**
 * enterSandbox — Server Action: start an isolated, throwaway demo sandbox.
 *
 * This is the PUBLIC demo path. Each visitor gets their own anonymous Supabase
 * identity (signInAnonymously) seeded with a private copy of the Wanderbound
 * dataset. RLS makes their data physically unreachable by any other visitor, so
 * concurrent visitors never affect each other or future visitors. The sandbox is
 * torn down on tab-close (beacon) and by the TTL-sweep cron.
 *
 * Flow:
 *   1. Rate-limit by client IP (sandboxCreateRateLimit) — floods create churn.
 *   2. signInAnonymously() — fresh identity + JWT (is_anonymous=true).
 *   3. seedDemoFor(userId) — clone the demo dataset into THIS user's tenant.
 *   4. Register in sandbox_sessions so the sweep can reclaim abandoned sandboxes.
 *   5. redirect to /app/workflows (onboarding already marked complete by the seed).
 *
 * On any failure before step 5, best-effort sign the half-baked user out and
 * return an error — never leave the visitor in a broken half-seeded state.
 */
export async function enterSandbox(): Promise<{ error: string } | never> {
  // 1. Rate-limit per client IP.
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    "unknown";
  const { success } = await sandboxCreateRateLimit.limit(ip);
  if (!success) {
    return {
      error:
        "Too many demo sessions from your network right now. Please try again in a few minutes.",
    };
  }

  // 2. Fresh anonymous identity.
  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error || !signInData?.user) {
    return {
      error:
        error?.message ?? "Could not start the demo sandbox. Please try again.",
    };
  }
  const userId = signInData.user.id;

  // 3 + 4. Seed an isolated dataset + register the sandbox. If anything fails,
  // tear the half-baked identity down rather than stranding the visitor.
  try {
    await seedDemoFor(userId);
    await serviceDb
      .insert(sandboxSessions)
      .values({ user_id: userId })
      .onConflictDoNothing();
  } catch (seedErr) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "auth.enterSandbox.seed_failed",
        userId,
        error: String(seedErr),
      })
    );
    try {
      await supabase.auth.signOut();
    } catch {
      // best-effort — the TTL sweep will reclaim the orphaned identity
    }
    return {
      error: "Could not prepare the demo sandbox. Please try again.",
    };
  }

  // 5. redirect() throws — satisfies the `never` branch; must be outside try/catch.
  redirect("/app/workflows");
}
