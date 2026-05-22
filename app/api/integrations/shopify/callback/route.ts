/**
 * app/api/integrations/shopify/callback/route.ts
 * Shopify OAuth callback — Step 2 of the OAuth handshake.
 *
 * GET /api/integrations/shopify/callback?code=...&state=...&shop=...&hmac=...&timestamp=...
 *   1. Validate shop param is a *.myshopify.com domain (T-2-03-03)
 *   2. Verify state nonce matches the stored nonce (CSRF — T-2-03-01)
 *   3. Verify HMAC-SHA256 of sorted params using SHOPIFY_CLIENT_SECRET (T-2-03-02)
 *      — ALL three validations happen BEFORE any DB write of real data
 *   4. Exchange code for access_token via POST to Shopify token endpoint
 *   5. encryptToken(accessToken) — store ONLY ciphertext (T-2-03-05)
 *   6. UPSERT integrations row (provider='shopify', status='active')
 *   7. Update user_profiles.shopify_shop
 *   8. Fire inngest event 'shopify.connected' to trigger full sync
 *   9. Redirect to /onboarding?step=2
 *
 * SECURITY:
 *   T-2-03-01: state nonce verified before DB write
 *   T-2-03-02: HMAC verified before DB write
 *   T-2-03-03: shop domain validated against *.myshopify.com regex
 *   T-2-03-05: access token stored only as ciphertext via encryptToken()
 */
import { createClient } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  sanitizeShopDomain,
  verifyOAuthHmac,
} from "@/lib/integrations/shopify/client";
import { encryptToken } from "@/lib/integrations/crypto";
import { serviceDb } from "@/lib/db/client";
import { integrations, userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { getOAuthNonce, clearOAuthNonce } from "@/lib/integrations/oauth-nonce";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const rawShop = searchParams.get("shop");
  const hmac = searchParams.get("hmac");
  const timestamp = searchParams.get("timestamp");

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  if (!claims?.sub) {
    return NextResponse.redirect(`${origin}/login`);
  }
  const userId = claims.sub as string;

  // ── Shop validation (T-2-03-03) — before any other processing ────────────
  const shop = sanitizeShopDomain(rawShop);
  if (!shop) {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "shopify.oauth.callback.invalid_shop",
        userId,
        rawShop,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Invalid shop parameter." },
      { status: 400 }
    );
  }

  // ── State nonce verification (T-2-03-01) — BEFORE any DB write ──────────
  if (!state || !code) {
    return NextResponse.json(
      { error: "Missing required OAuth parameters." },
      { status: 400 }
    );
  }

  // CR-07 FIX: Read nonce from Redis (not from access_token_encrypted) so we
  // don't require destroying a live token during connect initiation.
  const storedNonce = await getOAuthNonce(userId, "shopify");

  if (!storedNonce) {
    return NextResponse.json(
      { error: "No pending OAuth session found. Please restart the connect flow." },
      { status: 400 }
    );
  }

  if (state !== storedNonce) {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "shopify.oauth.callback.nonce_mismatch",
        userId,
        shop,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "State nonce mismatch. Possible CSRF attempt." },
      { status: 400 }
    );
  }

  // ── HMAC verification (T-2-03-02) — BEFORE any real DB write ────────────
  if (!hmac || !timestamp) {
    return NextResponse.json(
      { error: "Missing HMAC or timestamp." },
      { status: 400 }
    );
  }

  // Build params object for HMAC validation (all query params including hmac)
  const allParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    allParams[key] = value;
  });

  const hostName = new URL(origin).host;
  const hmacValid = await verifyOAuthHmac(allParams, hostName);
  if (!hmacValid) {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "shopify.oauth.callback.hmac_invalid",
        userId,
        shop,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "HMAC verification failed." },
      { status: 400 }
    );
  }

  // ── Structured event BEFORE token exchange (observability) ───────────────
  console.log(
    JSON.stringify({
      level: "info",
      event: "shopify.oauth.callback.exchanging_token",
      userId,
      shop,
      timestamp: new Date().toISOString(),
    })
  );

  // ── Code exchange for access token ───────────────────────────────────────
  let accessToken: string;
  try {
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env["SHOPIFY_CLIENT_ID"],
          client_secret: process.env["SHOPIFY_CLIENT_SECRET"],
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      console.log(
        JSON.stringify({
          level: "error",
          event: "shopify.oauth.callback.token_exchange_failed",
          userId,
          shop,
          status: tokenResponse.status,
          timestamp: new Date().toISOString(),
        })
      );
      return NextResponse.json(
        { error: "Token exchange failed." },
        { status: 400 }
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      scope: string;
    };
    accessToken = tokenData.access_token;
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "error",
        event: "shopify.oauth.callback.token_exchange_error",
        userId,
        shop,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Token exchange failed." },
      { status: 500 }
    );
  }

  // ── Encrypt token and store in DB (T-2-03-05) ────────────────────────────
  const encryptedToken = await encryptToken(accessToken);
  const grantedScopes = (process.env["SHOPIFY_SCOPES"] ?? "").split(",").filter(Boolean);

  // UPSERT integrations row with real encrypted token
  await serviceDb
    .insert(integrations)
    .values({
      user_id: userId,
      provider: "shopify",
      provider_account_id: shop,
      status: "active",
      access_token_encrypted: encryptedToken,
      scopes: grantedScopes,
      last_error: null,
    })
    .onConflictDoUpdate({
      target: [integrations.user_id, integrations.provider],
      set: {
        provider_account_id: shop,
        status: "active",
        access_token_encrypted: encryptedToken,
        scopes: grantedScopes,
        last_error: null,
      },
    });

  // Update user_profiles.shopify_shop
  await serviceDb
    .update(userProfiles)
    .set({ shopify_shop: shop, updated_at: new Date() })
    .where(eq(userProfiles.user_id, userId));

  // Clear the OAuth nonce now that exchange succeeded
  await clearOAuthNonce(userId, "shopify");

  // ── Fire shopify.connected event to trigger full background sync ──────────
  await inngest.send({
    name: "shopify.connected",
    data: { userId, shop },
  });

  console.log(
    JSON.stringify({
      level: "info",
      event: "shopify.oauth.callback.success",
      userId,
      shop,
      timestamp: new Date().toISOString(),
    })
  );

  return NextResponse.redirect(`${origin}/onboarding?step=2`);
}
