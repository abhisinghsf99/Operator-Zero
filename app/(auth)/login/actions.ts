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
