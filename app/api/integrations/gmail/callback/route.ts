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
import { serviceDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

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
  const [existingRow] = await serviceDb
    .select({
      access_token_encrypted: integrations.access_token_encrypted,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.user_id, userId),
        eq(integrations.provider, "gmail")
      )
    )
    .limit(1);

  if (!existingRow || !existingRow.access_token_encrypted.startsWith("nonce:")) {
    return NextResponse.json(
      {
        error:
          "No pending Gmail OAuth session found. Please restart the connect flow.",
      },
      { status: 400 }
    );
  }

  const storedNonce = existingRow.access_token_encrypted.slice("nonce:".length);
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
