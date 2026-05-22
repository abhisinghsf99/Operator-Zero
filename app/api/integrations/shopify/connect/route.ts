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
  const nonce = generateNonce();

  // Store nonce as a pending integration row.
  // access_token_encrypted stores `nonce:<value>` as placeholder — replaced on successful callback.
  // status='pending' is a sentinel — callback upgrades to 'active'.
  await serviceDb
    .insert(integrations)
    .values({
      user_id: userId,
      provider: "shopify",
      provider_account_id: shop,
      status: "pending",
      access_token_encrypted: `nonce:${nonce}`,
      scopes: [],
      last_error: null,
    })
    .onConflictDoUpdate({
      target: [integrations.user_id, integrations.provider],
      set: {
        provider_account_id: shop,
        status: "pending",
        access_token_encrypted: `nonce:${nonce}`,
        last_error: null,
      },
    });

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
