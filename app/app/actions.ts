/**
 * app/app/actions.ts
 * Server Actions for the authenticated app shell.
 *
 * signOut — clears the Supabase session and returns to /login.
 *   Runs as a Server Action (not a Server Component), so it CAN write the
 *   response cookies that supabase.auth.signOut() needs to clear the httpOnly
 *   session cookie. The middleware then redirects subsequent /app/* requests
 *   to /login.
 */
"use server";

import { createClient } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
