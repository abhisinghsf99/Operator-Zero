/**
 * lib/auth/server.ts
 * Supabase Auth server client — use in Server Components, Route Handlers, Server Actions.
 *
 * Creates a server-side Supabase client that reads/writes the auth session via
 * httpOnly cookies managed by Next.js. Per RESEARCH.md Pattern 1, we must:
 *   1. Await cookies() — Next.js 15 makes cookies() async (Pitfall 5).
 *   2. Use getAll/setAll (not individual get/set) — required by @supabase/ssr 0.10.x.
 *   3. Use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — NOT the service role key (T-1-04-06).
 *
 * SECURITY NOTE: Never use supabase.auth.getSession() in server code — it does not
 * re-validate the JWT signature. Always use supabase.auth.getClaims() instead (T-1-04-01).
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * createClient — async factory for the server-side Supabase auth client.
 * Must be called (and awaited) in every Server Component, Route Handler, or
 * Server Action that needs auth context.
 *
 * The client automatically reads/refreshes the httpOnly session cookie.
 * In Server Components the setAll() call is a no-op (components cannot write cookies);
 * cookie refresh happens in middleware.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll() in a Server Component context throws because RSCs cannot
            // write response cookies. Middleware handles the rolling refresh.
            // Silently ignore — this is expected behaviour.
          }
        },
      },
    }
  );
}
