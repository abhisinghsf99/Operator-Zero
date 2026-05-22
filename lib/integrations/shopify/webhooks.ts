/**
 * lib/integrations/shopify/webhooks.ts
 * Shopify webhook HMAC verification.
 *
 * Provides:
 *   - verifyShopifyWebhook(): verify X-Shopify-Hmac-Sha256 header (timing-safe)
 *
 * SECURITY (T-2-03-04):
 *   - HMAC verified using SHOPIFY_CLIENT_SECRET (not the access token)
 *   - Uses timing-safe comparison to prevent timing attacks
 *   - Returns false on mismatch; does NOT throw
 *   - Called BEFORE any processing in the webhook route handler
 */
import crypto from "crypto";

/** Result type that distinguishes the reason for verification failure (WR-08). */
export type WebhookVerifyResult =
  | { valid: true }
  | { valid: false; reason: "hmac_mismatch" | "missing_hmac" | "secret_not_configured" };

/**
 * Verifies the Shopify webhook HMAC using SHOPIFY_CLIENT_SECRET.
 *
 * Shopify signs each webhook with HMAC-SHA256 of the raw request body,
 * using the app's client secret. The base64-encoded digest is sent in
 * X-Shopify-Hmac-Sha256 header.
 *
 * WR-08: Distinguishes "secret not configured" (misconfiguration) from
 * "HMAC mismatch" (potential attack) so operators can alert on the former.
 *
 * @param rawBody - Raw request body as Buffer or string (must NOT be parsed)
 * @param hmacHeader - Value of X-Shopify-Hmac-Sha256 header
 * @returns WebhookVerifyResult — { valid: true } or { valid: false, reason }
 *
 * SECURITY: uses crypto.timingSafeEqual to prevent timing-based HMAC oracle attacks.
 */
export function verifyShopifyWebhook(
  rawBody: Buffer | string,
  hmacHeader: string | null | undefined
): boolean {
  const result = verifyShopifyWebhookDetailed(rawBody, hmacHeader);
  return result.valid;
}

/**
 * Like verifyShopifyWebhook but returns a structured result with a failure reason.
 * Use this in route handlers to distinguish misconfiguration from attacks.
 */
export function verifyShopifyWebhookDetailed(
  rawBody: Buffer | string,
  hmacHeader: string | null | undefined
): WebhookVerifyResult {
  if (!hmacHeader) return { valid: false, reason: "missing_hmac" };

  const secret = process.env["SHOPIFY_CLIENT_SECRET"];
  if (!secret) return { valid: false, reason: "secret_not_configured" };

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const computed = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");

  // Timing-safe comparison (prevents timing oracle attacks)
  try {
    const computedBuf = Buffer.from(computed, "utf8");
    const receivedBuf = Buffer.from(hmacHeader, "utf8");

    if (computedBuf.length !== receivedBuf.length) {
      // Different lengths — still do a dummy comparison to avoid timing leak
      // (comparing against itself to normalize time)
      crypto.timingSafeEqual(computedBuf, computedBuf);
      return { valid: false, reason: "hmac_mismatch" };
    }

    const match = crypto.timingSafeEqual(computedBuf, receivedBuf);
    return match ? { valid: true } : { valid: false, reason: "hmac_mismatch" };
  } catch {
    return { valid: false, reason: "hmac_mismatch" };
  }
}
