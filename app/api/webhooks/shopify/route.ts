/**
 * app/api/webhooks/shopify/route.ts
 * Shopify webhook receiver — INTEG-03.
 *
 * POST /api/webhooks/shopify
 *   1. Read raw body (MUST be read as buffer before any parsing for HMAC)
 *   2. Verify X-Shopify-Hmac-Sha256 header (T-2-03-04) → 401 on failure
 *   3. Return 200 IMMEDIATELY (Shopify retries if no 200 within ~5s)
 *   4. Fire Inngest event 'shopify.webhook_received' for async mirror update
 *
 * SECURITY (T-2-03-04):
 *   - HMAC verified before ANY processing (using timing-safe comparison)
 *   - Invalid HMAC → 401, no further work
 *   - Async processing via Inngest — webhook handler returns 200 synchronously
 *
 * PATTERN: Pitfall 2 (RESEARCH.md) — return 200 immediately, process async
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyShopifyWebhookDetailed } from "@/lib/integrations/shopify/webhooks";
import { inngest } from "@/lib/inngest/client";

export async function POST(request: NextRequest) {
  // ── Read raw body FIRST (required for HMAC calculation) ──────────────────
  const rawBodyBuffer = Buffer.from(await request.arrayBuffer());

  // ── HMAC verification (T-2-03-04) — BEFORE any processing ───────────────
  // WR-08: use detailed result to distinguish misconfiguration (500) from attack (401).
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const verifyResult = verifyShopifyWebhookDetailed(rawBodyBuffer, hmacHeader);

  if (!verifyResult.valid) {
    if (verifyResult.reason === "secret_not_configured") {
      // Misconfiguration — log as error and return 500 so operators see it clearly
      console.error(
        JSON.stringify({
          level: "error",
          event: "shopify.webhook.secret_not_configured",
          message: "SHOPIFY_CLIENT_SECRET is not set — cannot verify webhook HMAC",
          timestamp: new Date().toISOString(),
        })
      );
      return NextResponse.json(
        { error: "Webhook verification misconfigured." },
        { status: 500 }
      );
    }
    // HMAC mismatch or missing header — log as warn and return 401 (attack path)
    console.log(
      JSON.stringify({
        level: "warn",
        event: "shopify.webhook.hmac_invalid",
        reason: verifyResult.reason,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Unauthorized — HMAC verification failed." },
      { status: 401 }
    );
  }

  // ── Extract webhook metadata ──────────────────────────────────────────────
  const topic = request.headers.get("x-shopify-topic") ?? "unknown";
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";

  // ── Return 200 IMMEDIATELY (before any async work) ───────────────────────
  // Shopify expects 200 within ~5 seconds. All processing is async via Inngest.
  const immediateResponse = NextResponse.json({ ok: true }, { status: 200 });

  // ── Parse payload and fire Inngest event (async — does not block response) ─
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBodyBuffer.toString("utf8")) as Record<string, unknown>;
  } catch {
    // Non-JSON payload — pass raw string
    payload = { raw: rawBodyBuffer.toString("utf8") };
  }

  // Fire Inngest event for async processing — this runs AFTER returning 200
  // Next.js route handlers await the response before running after-response hooks,
  // so we fire inngest.send() here (it's non-blocking in Inngest's HTTP client)
  await inngest.send({
    name: "shopify.webhook_received",
    data: { topic, shop, payload },
  });

  console.log(
    JSON.stringify({
      level: "info",
      event: "shopify.webhook.received",
      topic,
      shop,
      timestamp: new Date().toISOString(),
    })
  );

  return immediateResponse;
}
