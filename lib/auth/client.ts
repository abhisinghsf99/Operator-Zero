/**
 * lib/auth/client.ts
 * Supabase Auth browser client — use ONLY in Client Components.
 *
 * Provides the browser-side Supabase client. This is used exclusively for:
 *   - The "Sign in with Google" OAuth button (signInWithOAuth)
 *
 * All server-side auth (session validation, profile queries, middleware) must use
 * lib/auth/server.ts createClient() instead.
 *
 * SECURITY NOTE: The browser client NEVER has access to SUPABASE_SERVICE_ROLE_KEY.
 * Only NEXT_PUBLIC_* env vars reach the browser bundle (T-1-04-06).
 */
import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";

/**
 * createBrowserClient — factory for the client-side Supabase auth client.
 * Returns a singleton-like instance suitable for use in "use client" components.
 */
export function createBrowserClient() {
  return _createBrowserClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!
  );
}
