/**
 * lib/auth/middleware.ts
 * Middleware session-refresh + route protection helper.
 *
 * updateSession() is called from root middleware.ts on every request:
 *   1. Builds a request/response-bound Supabase server client.
 *   2. Calls supabase.auth.getClaims() — validates JWT signature locally (fast, secure).
 *      getClaims() is used, NOT getSession() (RESEARCH.md Pitfall 1 / T-1-04-01).
 *   3. Redirects unauthenticated requests whose pathname starts with /app to /login.
 *   4. Returns the supabaseResponse — which carries the refreshed auth cookies.
 *
 * The session refresh happens via @supabase/ssr's setAll() hook: the library
 * automatically rotates the auth token into the response cookies on every call
 * (30-day rolling window is a Supabase project setting; middleware performs the roll).
 *
 * THREAT MODEL:
 *   T-1-04-01: getClaims() validates JWT; getSession() is absent.
 *   T-1-04-02: All /app/* paths are checked; unauthenticated requests get 307.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * updateSession — refresh the Supabase auth session and guard /app/* routes.
 *
 * @param request - The incoming NextRequest.
 * @returns A NextResponse that carries refreshed auth cookies and enforces
 *          the /app/* guard.
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

  // Guard: unauthenticated requests to /app/* are redirected to /login.
  if (!claims && request.nextUrl.pathname.startsWith("/app")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // 307 Temporary Redirect preserves the original HTTP method.
    return NextResponse.redirect(loginUrl, { status: 307 });
  }

  // Return the response carrying refreshed session cookies.
  return supabaseResponse;
}
