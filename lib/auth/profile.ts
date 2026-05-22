/**
 * lib/auth/profile.ts
 * getOrCreateProfile — single Drizzle read/create of the signed-in user's row.
 *
 * This is the /app/home walking-skeleton DB round-trip:
 *   1. Resolve the validated JWT claims from getClaims() (T-1-04-01).
 *   2. Inside withUserRls() (authenticated role + request.jwt.claims set), SELECT
 *      user_profiles for the caller — RLS limits visibility to their own row.
 *   3. If absent: INSERT a minimal row with that user_id; return it.
 *   4. If present: return the existing row unchanged (no duplicate insert — T-1-04-07).
 *
 * SECURITY:
 *   - Runs via withUserRls (RLS enforced at the DB layer) — NEVER serviceDb (T-1-04-06).
 *   - user_id keyed strictly on claims.sub — no user-supplied override.
 *   - The WITH CHECK ((SELECT auth.uid()) = user_id) policy is the safety net: an
 *     INSERT for any other user_id is rejected by Postgres, not just by code.
 *
 * MULTI-TENANT: Every query runs as the authenticated user with auth.uid() set,
 * so RLS policies scope rows to that user — the explicit user_id filter on the
 * SELECT is belt-and-suspenders defense-in-depth.
 */
import { createClient } from "@/lib/auth/server";
import { withUserRls, userProfiles } from "@/lib/db";
import { eq } from "drizzle-orm";

/** Shape of a user_profiles row as returned by getOrCreateProfile. */
export type UserProfileRow = typeof userProfiles.$inferSelect;

/**
 * getOrCreateProfile — resolves the signed-in user's profile row.
 *
 * Performs exactly ONE SELECT. If no row exists, performs ONE INSERT then returns.
 * Subsequent calls for the same user_id return the existing row (read-path only).
 *
 * Throws if:
 *   - The caller is not authenticated (no valid JWT claims).
 *   - The SELECT or INSERT fails (DB / RLS / network error).
 */
export async function getOrCreateProfile(): Promise<UserProfileRow> {
  // 1. Get the authenticated user's ID from their JWT claims.
  //    getClaims() validates the JWT signature — do NOT use getSession() here.
  //    data is { claims, header, signature } | null when no active session exists.
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;

  if (!claims?.sub) {
    throw new Error(
      "getOrCreateProfile called without valid authentication claims. " +
        "Ensure middleware guards this route with updateSession()."
    );
  }

  const userId = claims.sub;

  // Run the whole round-trip as the authenticated user so RLS is enforced.
  return withUserRls(claims, async (tx) => {
    // 2. SELECT the existing user_profiles row. RLS limits visibility to the
    //    caller's own row; the explicit filter is defense-in-depth.
    const existing = await tx
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.user_id, userId))
      .limit(1);

    if (existing.length > 0) {
      // Row exists — return it without writing (create-once, read-thereafter).
      return existing[0]!;
    }

    // 3. No row exists (first visit) — INSERT a minimal profile row.
    //    Only user_id is required; all other columns have nullable defaults.
    //    The WITH CHECK policy rejects an INSERT for any other user_id.
    const inserted = await tx
      .insert(userProfiles)
      .values({ user_id: userId })
      .returning();

    if (!inserted[0]) {
      throw new Error(
        `Failed to create user_profiles row for user_id=${userId}. ` +
          "Check RLS policies and DB connectivity."
      );
    }

    return inserted[0];
  });
}
