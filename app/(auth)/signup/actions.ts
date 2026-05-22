"use server";

/**
 * app/(auth)/signup/actions.ts
 * Server Action: email + password sign-up.
 *
 * Calls supabase.auth.signUp() and redirects to /app/home on success.
 * On failure, returns the error message to the form (no silent swallow).
 *
 * EMAIL CONFIRMATION:
 *   When the Supabase project requires email confirmation, signUp() returns
 *   { data: { user, session: null }, error: null }. In that case we return a
 *   user-facing "check your email" message instead of redirecting to /app/home
 *   (which would result in a silent redirect loop back to /login with no feedback).
 *
 * SECURITY:
 *   - Uses server-side createClient() — never exposes auth state to the browser.
 *   - Password is transmitted server-side only (Server Action POST body is not in the URL).
 *   - Zod validates email format + password minimum length before calling Supabase.
 *
 * MULTI-TENANT: auth.users row is created by Supabase; user_profiles row is
 * created on first visit to /app/home by getOrCreateProfile().
 */
import { createClient } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be at most 128 characters."),
});

/**
 * signUp — Server Action bound to the signup form.
 *
 * Returns an error string on validation/auth failure.
 * Redirects to /app/home on success (never returns on success).
 */
export async function signUp(
  formData: FormData
): Promise<{ error: string } | never> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  // Validate inputs with Zod (RESEARCH.md: Zod on all external inputs).
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid input.";
    return { error: firstError };
  }

  const { email, password } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  // session is null when the Supabase project requires email confirmation.
  // Redirecting to /app/home in this case would silently loop back to /login
  // because the middleware finds no session. Show a user-facing message instead.
  if (!data.session) {
    return {
      error:
        "Account created — please check your email to confirm your address before signing in.",
    };
  }

  // Session established (email confirmation disabled) — redirect to the guarded home page.
  // The Supabase session cookie is written by @supabase/ssr via the server client.
  redirect("/app/home");
}
