/**
 * lib/demo/constants.ts
 * Tiny shared constants for the demo / sandbox system. Kept separate from the
 * heavy seed module so the Shopify write hot-path can import the sentinel without
 * pulling in the full dataset.
 */

/**
 * Sentinel access token stamped on every sandbox integration row by the demo
 * seed (lib/demo/seed.ts). A Shopify connection holding this exact token is a
 * SANDBOX connection: the write path (lib/integrations/shopify/mutations.ts)
 * simulates writes against the local mirror instead of calling the real Shopify
 * API. The shared demo account uses a real OAuth token, so its writes are real.
 */
export const SANDBOX_SENTINEL_TOKEN =
  "demo-seed-not-a-real-token-0000000000000000000000000000";
