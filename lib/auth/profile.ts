/**
 * lib/auth/profile.ts
 * getOrCreateProfile — single Drizzle read/create of the signed-in user's row.
 *
 * This is the /app/home walking-skeleton DB round-trip:
 *   1. Resolve user_id from getClaims().sub (JWT-validated — T-1-04-01).
 *   2. SELECT user_profiles WHERE user_id = claims.sub via the RLS-enforced db client.
 *   3. If absent: INSERT a minimal row with that user_id; return it.
 *   4. If present: return the existing row unchanged (no duplicate insert — T-1-04-07).
 *
 * SECURITY:
 *   - Uses db (RLS-enforced) — NEVER serviceDb (T-1-04-06 / T-1-04-07).
 *   - user_id keyed strictly on claims.sub — no user-supplied override.
 *   - RLS policy (SELECT auth.uid()) = user_id is the database-layer safety net.
 *
 * MULTI-TENANT: Every query is scoped to the calling user's user_id via RLS.
 */
import { createClient } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
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

  // 2. Attempt to SELECT the existing user_profiles row.
  //    The RLS policy ensures only the calling user's row is visible.
  const existing = await db
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
  const inserted = await db
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
}
