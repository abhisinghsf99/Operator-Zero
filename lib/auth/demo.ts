/**
 * lib/auth/demo.ts
 * Server-only helpers for the public demo mode.
 *
 * SECURITY:
 *   - This module MUST NOT have "use client" — it is server-only.
 *   - DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER_ID are read from process.env
 *     server-side only — never exposed to the client bundle or NEXT_PUBLIC_ vars.
 *   - getDemoCredentials() and isDemoUser() are imported exclusively by server
 *     actions and server components — never by client components.
 */

/**
 * DEMO_DISABLED_MESSAGE — returned by destructive settings actions when the
 * authenticated user is the demo user.
 */
export const DEMO_DISABLED_MESSAGE = "This action is disabled in the live demo.";

/**
 * isDemoUser — returns true iff the given userId matches DEMO_USER_ID.
 *
 * Safe to call with null/undefined — returns false in those cases.
 *
 * @param userId - the authenticated user's UUID (from getClaims().sub)
 */
export function isDemoUser(userId: string | null | undefined): boolean {
  const demoUserId = process.env.DEMO_USER_ID;
  if (!demoUserId) return false;
  return userId === demoUserId;
}

/**
 * getDemoCredentials — read demo credentials from server-side env vars.
 *
 * Returns { email, password } only when BOTH DEMO_EMAIL and DEMO_PASSWORD are set.
 * Returns null otherwise (demo is not configured).
 *
 * SECURITY: The returned value MUST NOT be sent to the client. It is used
 * exclusively inside the enterDemo() server action to sign in via Supabase.
 */
export function getDemoCredentials(): { email: string; password: string } | null {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}
