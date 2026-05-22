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
import { serviceDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
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

  // ── Nonce generation + storage (T-2-04-01) ────────────────────────────────
  const nonce = generateNonce();

  // Store nonce as a pending integration row.
  // access_token_encrypted stores `nonce:<value>` as placeholder — replaced on successful callback.
  await serviceDb
    .insert(integrations)
    .values({
      user_id: userId,
      provider: "gmail",
      provider_account_id: null,
      status: "pending",
      access_token_encrypted: `nonce:${nonce}`,
      scopes: [],
      last_error: null,
    })
    .onConflictDoUpdate({
      target: [integrations.user_id, integrations.provider],
      set: {
        status: "pending",
        access_token_encrypted: `nonce:${nonce}`,
        last_error: null,
      },
    });

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
