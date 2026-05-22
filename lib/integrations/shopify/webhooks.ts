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

/**
 * Verifies the Shopify webhook HMAC using SHOPIFY_CLIENT_SECRET.
 *
 * Shopify signs each webhook with HMAC-SHA256 of the raw request body,
 * using the app's client secret. The base64-encoded digest is sent in
 * X-Shopify-Hmac-Sha256 header.
 *
 * @param rawBody - Raw request body as Buffer or string (must NOT be parsed)
 * @param hmacHeader - Value of X-Shopify-Hmac-Sha256 header
 * @returns true if valid, false if invalid or if header/secret is absent
 *
 * SECURITY: uses crypto.timingSafeEqual to prevent timing-based HMAC oracle attacks.
 */
export function verifyShopifyWebhook(
  rawBody: Buffer | string,
  hmacHeader: string | null | undefined
): boolean {
  if (!hmacHeader) return false;

  const secret = process.env["SHOPIFY_CLIENT_SECRET"];
  if (!secret) return false;

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
      return false;
    }

    return crypto.timingSafeEqual(computedBuf, receivedBuf);
  } catch {
    return false;
  }
}
