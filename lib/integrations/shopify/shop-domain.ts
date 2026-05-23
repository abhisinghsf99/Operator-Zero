/**
 * lib/integrations/shopify/shop-domain.ts
 * CLIENT-SAFE shop domain normalizer.
 *
 * DO NOT import this module from server-only code that needs the full
 * ShopifyAdapter — use lib/integrations/shopify/client.ts instead.
 *
 * This module is intentionally kept free of any Node/server imports so it
 * can be safely imported by "use client" components without breaking the
 * Next.js client bundle.
 *
 * SHOP_DOMAIN_RE is identical to the server's regex in client.ts so any value
 * the client accepts also passes the server validation gate.
 */

/**
 * Valid *.myshopify.com domain pattern.
 * Mirrors the server-side SHOP_DOMAIN_RE in lib/integrations/shopify/client.ts.
 * Must stay in lockstep — if the server regex changes, update this too.
 */
export const SHOP_DOMAIN_RE = /^[a-z0-9-]+\.myshopify\.com$/;

/**
 * Normalize and validate a user-supplied shop domain string.
 *
 * Normalization order:
 *   1. Trim whitespace
 *   2. Lowercase
 *   3. Strip a leading `https://` or `http://` scheme
 *   4. Strip everything from the first `/` onward (path + trailing slash)
 *   5. If the remaining value contains no `.`, append `.myshopify.com`
 *      (bare handle shorthand, e.g. "my-store" → "my-store.myshopify.com")
 *   6. Test against SHOP_DOMAIN_RE; return the normalized value or null
 *
 * Returns null for empty input, whitespace-only input, or any value that
 * does not pass the final SHOP_DOMAIN_RE check.
 *
 * @param raw - User-supplied shop domain input (handle, full domain, or URL)
 * @returns Normalized *.myshopify.com domain, or null if invalid
 */
export function normalizeShopDomain(raw: string): string | null {
  // Step 1 & 2: trim + lowercase
  let value = raw.trim().toLowerCase();

  // Step 1b: early-exit for empty / whitespace-only
  if (!value) return null;

  // Step 3: strip scheme
  if (value.startsWith("https://")) {
    value = value.slice("https://".length);
  } else if (value.startsWith("http://")) {
    value = value.slice("http://".length);
  }

  // Step 4: strip path (everything from the first `/` onward)
  const slashIndex = value.indexOf("/");
  if (slashIndex !== -1) {
    value = value.slice(0, slashIndex);
  }

  // Step 5: if no dot present, treat as bare handle and append suffix
  if (!value.includes(".")) {
    value = `${value}.myshopify.com`;
  }

  // Step 6: validate against canonical regex
  if (!SHOP_DOMAIN_RE.test(value)) return null;

  return value;
}
