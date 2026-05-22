/**
 * app/auth/callback/route.ts
 * OAuth code-exchange Route Handler.
 *
 * This route is called by Supabase after the OAuth provider (e.g. Google) redirects
 * back with an authorization code. It:
 *   1. Reads the `code` query parameter.
 *   2. Calls supabase.auth.exchangeCodeForSession(code) — server-side PKCE exchange.
 *   3. Validates the `next` parameter (MUST be a same-origin relative path).
 *   4. Redirects to the validated `next` path (default: /app/home).
 *
 * SECURITY — T-1-04-04 (Open Redirect):
 *   The `next` parameter is user-controlled and MUST be validated before redirect.
 *   We accept ONLY same-origin relative paths (starting with "/" but not "//" or "/\").
 *   Absolute URLs, protocol-relative URLs, and backslash-prefixed paths are silently
 *   replaced with /app/home. This closes the open-redirect attack vector.
 *
 * SECURITY — T-1-04-03 (OAuth CSRF):
 *   Supabase's PKCE flow (exchangeCodeForSession) handles state verification internally.
 *   We do not need to hand-roll state parameter validation.
 */
import { createClient } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Default redirect target when `next` is absent or invalid. */
const DEFAULT_NEXT = "/app/home";

/**
 * validateNextParam — ensure `next` is a safe same-origin relative path.
 *
 * Rules:
 *   - Must start with "/" to be a relative path.
 *   - Must NOT start with "//" (protocol-relative URL — still an open redirect).
 *   - Must NOT start with "/\" or its percent-encoded forms ("/%5C", "/%5c") —
 *     the WHATWG URL parser normalises "/\host" to "//host", which some HTTP
 *     clients re-interpret as a protocol-relative URL in Location headers.
 *   - Must NOT contain a protocol scheme (http:, https:, etc.).
 *   - Falls back to DEFAULT_NEXT for any invalid value.
 *
 * @param next - The raw `next` query parameter value (may be null).
 * @returns A validated same-origin relative path.
 */
export function validateNextParam(next: string | null): string {
  if (!next) return DEFAULT_NEXT;

  // Reject absolute URLs (contain a scheme like "http:", "https:", "javascript:", etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(next)) {
    return DEFAULT_NEXT;
  }

  // Reject protocol-relative URLs (// prefix) — these navigate off-origin.
  if (next.startsWith("//")) {
    return DEFAULT_NEXT;
  }

  // Reject backslash-prefixed paths: /\host normalises to //host in the WHATWG
  // URL parser, which some HTTP clients treat as protocol-relative in Location headers.
  // Also reject percent-encoded variants (/%5C and /%5c).
  if (
    next.startsWith("/\\") ||
    next.toLowerCase().startsWith("/%5c")
  ) {
    return DEFAULT_NEXT;
  }

  // Accept only paths that start with "/" (a genuine relative path).
  if (!next.startsWith("/")) {
    return DEFAULT_NEXT;
  }

  return next;
}

/**
 * GET — OAuth callback handler.
 *
 * Supabase redirects here with ?code=<code>&next=<path> after the OAuth flow.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  // Validate the next param before any redirect (T-1-04-04).
  const next = validateNextParam(rawNext);

  // Build the base URL for redirects (same origin as the incoming request).
  const origin = request.nextUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // Exchange failed — redirect to login with an error indicator.
      // Do not expose the error detail in the URL (may contain sensitive tokens).
      return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
    }

    // Session established — redirect to the validated next path.
    return NextResponse.redirect(`${origin}${next}`);
  }

  // No code present — redirect to login.
  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
