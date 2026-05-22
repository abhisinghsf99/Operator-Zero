/**
 * app/(app)/home/page.tsx
 * Guarded home page — Server Component.
 *
 * This is the walking-skeleton's end-to-end proof:
 *   1. Middleware has already validated the JWT (getClaims) before this renders.
 *   2. getOrCreateProfile() performs the single live DB round-trip:
 *      - First visit: INSERTs a user_profiles row via the RLS-enforced db client.
 *      - Subsequent visits: SELECTs the existing row (no duplicate insert).
 *   3. Renders a data-testid="home-greeting" element with the user's ID or display name.
 *
 * SECURITY:
 *   - getOrCreateProfile() uses the RLS-enforced db client (T-1-04-06 / T-1-04-07).
 *   - user_id is derived from getClaims().sub inside getOrCreateProfile() — not from
 *     any user-supplied input.
 *
 * MULTI-TENANT: RLS ensures only the signed-in user's user_profiles row is visible.
 */
import { getOrCreateProfile } from "@/lib/auth/profile";

export default async function HomePage() {
  // Perform the single live user_profiles round-trip.
  // Create-on-first-visit, read-thereafter (no duplicate inserts on reload).
  const profile = await getOrCreateProfile();

  const displayIdentifier = profile.display_name ?? profile.user_id;

  return (
    <div className="mx-auto max-w-2xl">
      <div
        data-testid="home-greeting"
        className="rounded-lg border border-green-200 bg-green-50 px-6 py-8 text-center"
      >
        <h1 className="mb-2 text-2xl font-semibold text-green-900">
          Welcome to Operator Zero
        </h1>
        <p className="text-sm text-green-700">
          Signed in as:{" "}
          <span className="font-mono font-medium">{displayIdentifier}</span>
        </p>
        <p className="mt-4 text-xs text-green-600">
          Walking skeleton verified — auth rail, session middleware, and
          user_profiles round-trip all working.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white px-6 py-4">
        <h2 className="mb-2 text-sm font-medium text-gray-900">
          Profile details
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-600">
          <dt className="font-medium">User ID</dt>
          <dd className="font-mono">{profile.user_id}</dd>
          <dt className="font-medium">Display name</dt>
          <dd>{profile.display_name ?? "—"}</dd>
          <dt className="font-medium">Shopify store</dt>
          <dd>{profile.shopify_shop ?? "—"}</dd>
          <dt className="font-medium">Account created</dt>
          <dd>{profile.created_at?.toISOString() ?? "—"}</dd>
        </dl>
      </div>
    </div>
  );
}
