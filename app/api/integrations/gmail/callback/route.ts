/**
 * app/api/integrations/gmail/callback/route.ts
 * Gmail OAuth callback — Step 2 of the OAuth handshake.
 *
 * GET /api/integrations/gmail/callback?code=...&state=...
 *   1. Require authenticated user (getClaims)
 *   2. Verify state nonce matches stored nonce (CSRF — T-2-04-01)
 *   3. Exchange code for tokens via googleapis
 *   4. encryptToken(access_token) AND encryptToken(refresh_token) — T-2-04-02
 *   5. UPSERT integrations row (provider='gmail', status='active', both tokens, expires_at)
 *   6. Fire inngest event 'gmail.connected' to trigger 30-day initial sync
 *   7. Redirect to /onboarding?step=3
 *
 * SECURITY:
 *   T-2-04-01: state nonce verified before any token exchange
 *   T-2-04-02: both access + refresh tokens stored only as ciphertext
 */
import { createClient } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { exchangeGmailCode } from "@/lib/integrations/gmail/client";
import { getOAuthNonce, clearOAuthNonce } from "@/lib/integrations/oauth-nonce";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  if (!claims?.sub) {
    return NextResponse.redirect(`${origin}/login`);
  }
  const userId = claims.sub as string;

  // ── Handle user-denied OAuth ────────────────────────────────────────────────
  if (error) {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "gmail.oauth.callback.user_denied",
        userId,
        error,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.redirect(
      `${origin}/onboarding?step=3&gmailError=denied`
    );
  }

  // ── Validate required parameters ────────────────────────────────────────────
  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing required OAuth parameters." },
      { status: 400 }
    );
  }

  // ── State nonce verification (T-2-04-01) — BEFORE any DB write ──────────
  // CR-07 FIX: Read nonce from Redis (not from access_token_encrypted) so we
  // don't require destroying a live token during connect initiation.
  const storedNonce = await getOAuthNonce(userId, "gmail");

  if (!storedNonce) {
    return NextResponse.json(
      {
        error:
          "No pending Gmail OAuth session found. Please restart the connect flow.",
      },
      { status: 400 }
    );
  }

  if (state !== storedNonce) {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "gmail.oauth.callback.nonce_mismatch",
        userId,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "State nonce mismatch. Possible CSRF attempt." },
      { status: 400 }
    );
  }

  // ── Code exchange + token storage ────────────────────────────────────────
  try {
    const redirectUri = `${origin}/api/integrations/gmail/callback`;
    await exchangeGmailCode(userId, code, redirectUri);
    // Clear the nonce after successful exchange
    await clearOAuthNonce(userId, "gmail");
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "error",
        event: "gmail.oauth.callback.token_exchange_failed",
        userId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Token exchange failed." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(`${origin}/onboarding?step=3`);
}
