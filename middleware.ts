/**
 * middleware.ts (root)
 * Next.js middleware — runs on every matched request.
 *
 * Delegates to updateSession() in lib/auth/middleware.ts which:
 *   - Refreshes the Supabase httpOnly session cookie on every request.
 *   - Redirects unauthenticated /app/* requests to /login.
 *   - Uses getClaims() (JWT-validated) — never getSession() (T-1-04-01).
 *
 * MATCHER: Covers all paths except:
 *   - _next/static  — Next.js static asset chunks
 *   - _next/image   — Next.js image optimisation responses
 *   - favicon.ico   — browser favicon request
 *   - Static image assets (svg, png, jpg, jpeg, gif, webp)
 *
 * These are excluded because they do not need auth checks and excluding them
 * avoids unnecessary Supabase calls per request.
 *
 * THREAT MODEL:
 *   T-1-04-02: Root matcher covers all non-static paths (defense-in-depth with RLS).
 */
import { updateSession } from "@/lib/auth/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - _next/static (static chunks)
     *   - _next/image (image optimisation)
     *   - favicon.ico
     *   - Static image extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
