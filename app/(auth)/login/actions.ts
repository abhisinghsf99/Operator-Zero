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
 */
import { createClient } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { z } from "zod";

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

  redirect("/app/home");
}
