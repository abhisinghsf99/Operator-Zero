/**
 * app/api/integrations/shopify/connect/route.ts
 * Shopify OAuth initiation — Step 1 of the OAuth handshake.
 *
 * GET /api/integrations/shopify/connect?shop=<shop>.myshopify.com
 *   1. Require authenticated user (getClaims)
 *   2. Validate shop param is a *.myshopify.com domain (T-2-03-03)
 *   3. Generate a cryptographic state nonce
 *   4. Store nonce in integrations table (pending) so callback can verify (T-2-03-01)
 *   5. Redirect to Shopify's OAuth authorize URL
 *
 * SECURITY:
 *   T-2-03-01 (CSRF): nonce stored in DB tied to user; verified in callback before any real write
 *   T-2-03-03 (SSRF/open-redirect): shop validated against /^[a-z0-9-]+\.myshopify\.com$/
 */
import { createClient } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sanitizeShopDomain } from "@/lib/integrations/shopify/client";
import { storeOAuthNonce } from "@/lib/integrations/oauth-nonce";
import { isDemoUser, isDemoConnectionLocked } from "@/lib/auth/demo";
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

  // ── Demo / sandbox connection lock guard ──────────────────────────────────
  // Anonymous sandbox visitors can NEVER wire a real Shopify store into their
  // throwaway tenant — that would escape write-simulation and touch a live store.
  // The shared demo account is additionally blocked only when DEMO_SHOPIFY_LOCKED
  // is set (default unset = it can connect freely for testing).
  const isAnonymous = (claims as { is_anonymous?: boolean }).is_anonymous === true;
  if (isAnonymous || (isDemoUser(userId) && isDemoConnectionLocked())) {
    return NextResponse.redirect(`${origin}/app/settings`);
  }

  // ── Shop validation (T-2-03-03) ──────────────────────────────────────────
  const rawShop = request.nextUrl.searchParams.get("shop");
  const shop = sanitizeShopDomain(rawShop);
  if (!shop) {
    return NextResponse.json(
      { error: "Invalid shop parameter. Must be a *.myshopify.com domain." },
      { status: 400 }
    );
  }

  // ── Nonce generation + storage (T-2-03-01) ────────────────────────────────
  // CR-07 FIX: Store nonce in Redis (TTL=10min) rather than clobbering
  // access_token_encrypted, which destroys a live token on reconnect.
  const nonce = generateNonce();
  await storeOAuthNonce(userId, "shopify", nonce);

  // ── Build Shopify OAuth authorize URL ────────────────────────────────────
  const redirectUri = `${origin}/api/integrations/shopify/callback`;
  const scopes = process.env["SHOPIFY_SCOPES"] ?? "";
  const clientId = process.env["SHOPIFY_CLIENT_ID"] ?? "";

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state: nonce,
  });

  const authorizeUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`;

  // Log structured event (observability)
  console.log(
    JSON.stringify({
      level: "info",
      event: "shopify.oauth.connect.initiated",
      userId,
      shop,
      timestamp: new Date().toISOString(),
    })
  );

  return NextResponse.redirect(authorizeUrl);
}
