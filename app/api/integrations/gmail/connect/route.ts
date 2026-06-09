/**
 * app/api/integrations/gmail/connect/route.ts
 * Gmail OAuth initiation — Step 1 of the OAuth handshake.
 *
 * GET /api/integrations/gmail/connect
 *   1. Require authenticated user (getClaims)
 *   2. Generate a cryptographic state nonce (T-2-04-01)
 *   3. Store nonce as pending integration row (for callback verification)
 *   4. Redirect to Google OAuth2 consent screen (access_type=offline, prompt=consent)
 *
 * SECURITY:
 *   T-2-04-01 (CSRF): state nonce stored in DB tied to user; verified in callback
 *   access_type=offline: requests a refresh token for long-lived access
 *   prompt=consent: forces Google to re-issue a refresh token (required after first grant)
 */
import { createClient } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildGmailAuthUrl } from "@/lib/integrations/gmail/client";
import { storeOAuthNonce } from "@/lib/integrations/oauth-nonce";
import crypto from "crypto";

/** Generate a cryptographically random nonce (32 hex bytes = 64 chars). */
function generateNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  // ── Auth guard ────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  if (!claims?.sub) {
    return NextResponse.redirect(`${origin}/login`);
  }
  const userId = claims.sub as string;

  // ── Sandbox guard ─────────────────────────────────────────────────────────
  // Anonymous sandbox visitors can never wire a real Gmail account into their
  // throwaway tenant — they get a seeded, simulated inbox instead.
  if ((claims as { is_anonymous?: boolean }).is_anonymous === true) {
    return NextResponse.redirect(`${origin}/app/settings`);
  }

  // ── Nonce generation + storage (T-2-04-01) ────────────────────────────────
  // CR-07 FIX: Store the nonce in Redis (TTL=10min) rather than clobbering
  // access_token_encrypted. Clobbering destroys a live token when a user
  // restarts/abandons the connect flow.
  const nonce = generateNonce();
  await storeOAuthNonce(userId, "gmail", nonce);

  // ── Build Google OAuth consent URL ────────────────────────────────────────
  const redirectUri = `${origin}/api/integrations/gmail/callback`;
  const authUrl = buildGmailAuthUrl(nonce, redirectUri);

  console.log(
    JSON.stringify({
      level: "info",
      event: "gmail.oauth.connect.initiated",
      userId,
      timestamp: new Date().toISOString(),
    })
  );

  return NextResponse.redirect(authUrl);
}
