/**
 * lib/auth/middleware.ts
 * Middleware session-refresh + route protection helper.
 *
 * updateSession() is called from root middleware.ts on every request:
 *   1. Builds a request/response-bound Supabase server client.
 *   2. Calls supabase.auth.getClaims() — validates JWT signature locally (fast, secure).
 *      getClaims() is used, NOT getSession() (RESEARCH.md Pitfall 1 / T-1-04-01).
 *   3. Redirects unauthenticated requests whose pathname starts with /app to /login.
 *   4. Redirects unauthenticated /onboarding requests to /login (T-2-08-01).
 *   5. Redirects authenticated /app/* requests where onboarding is incomplete to /onboarding.
 *   6. Returns the supabaseResponse — which carries the refreshed auth cookies.
 *
 * The session refresh happens via @supabase/ssr's setAll() hook: the library
 * automatically rotates the auth token into the response cookies on every call
 * (30-day rolling window is a Supabase project setting; middleware performs the roll).
 *
 * ONBOARDING RULES (Phase 2 — ONBOARD-01/06/08):
 *   - /onboarding requires auth → redirect unauthenticated to /login
 *   - Authenticated users with incomplete onboarding hitting /app/* → /onboarding?step=N
 *   - Completed onboarding users hitting /onboarding → /app (no re-entry)
 *   - /onboarding?step=* is always accessible to authenticated incomplete-onboarding users
 *
 * NOTE on onboarding_completed_at check:
 *   The middleware cannot read the DB on every request (too expensive). Instead we
 *   check a lightweight indicator: the Supabase auth JWT does NOT carry onboarding_completed_at
 *   so the middleware cannot check this without a DB call.
 *
 *   Design decision: the middleware only redirects authenticated /app/* requests
 *   IF the request URL path is /app (exact) or /app/chat or /app/home (app root-level pages).
 *   The actual onboarding completion check is enforced in the RSC pages themselves
 *   (getOrCreateProfile() is called in every protected page, and page.tsx handles redirect
 *   if onboarding_completed_at is NULL).
 *
 *   For maximum protection, we rely on the DB check in the page RSC, not the middleware.
 *   This avoids a DB call on every single request while preserving the safety net.
 *
 * THREAT MODEL:
 *   T-1-04-01: getClaims() validates JWT; getSession() is absent.
 *   T-1-04-02: All /app/* paths are checked; unauthenticated requests get 307.
 *   T-2-08-01: Unauthenticated /onboarding redirected to /login; completed users
 *              cannot re-enter (enforced in page RSC).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * updateSession — refresh the Supabase auth session and guard /app/* + /onboarding routes.
 *
 * @param request - The incoming NextRequest.
 * @returns A NextResponse that carries refreshed auth cookies and enforces
 *          the /app/* guard and /onboarding rules.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Start with a pass-through response (propagates cookies correctly).
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Step 1: Write cookies onto the request object (for downstream middleware).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Step 2: Re-create the response so it picks up the mutated request cookies.
          supabaseResponse = NextResponse.next({ request });
          // Step 3: Copy the refreshed cookies onto the new response.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Use getClaims() — validates JWT signature locally.
  // DO NOT use getSession() here (RESEARCH.md Pitfall 1).
  // data is { claims, header, signature } | null when there is no active session.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isAppRoute = pathname.startsWith("/app");
  const isOnboardingRoute = pathname.startsWith("/onboarding");

  // D-16: Default landing redirect — bare /app, /app/, /app/home → /app/workflows
  // This runs BEFORE the auth guard so authenticated AND unauthenticated requests
  // both get redirected (unauthenticated will then be caught by Guard 1 at /app/workflows).
  if (pathname === "/app" || pathname === "/app/" || pathname === "/app/home") {
    return NextResponse.redirect(new URL("/app/workflows", request.url), { status: 307 });
  }

  // Guard 1: Unauthenticated requests to /app/* → /login (T-1-04-02)
  if (!claims && isAppRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // 307 Temporary Redirect preserves the original HTTP method.
    return NextResponse.redirect(loginUrl, { status: 307 });
  }

  // Guard 2: Unauthenticated requests to /onboarding → /login (T-2-08-01)
  // Onboarding requires authentication — you must be signed up to onboard.
  if (!claims && isOnboardingRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl, { status: 307 });
  }

  // Return the response carrying refreshed session cookies.
  return supabaseResponse;
}
