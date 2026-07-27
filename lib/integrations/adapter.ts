// lib/integrations/adapter.ts
// Source: TECH-SPEC.md §6.3
// Pattern 7 (RESEARCH.md): IntegrationAdapter interface.
// All integration clients (Shopify, Gmail, etc.) implement this interface.

/**
 * Common interface for all integration adapter implementations.
 *
 * Shopify (lib/integrations/shopify/client.ts, ShopifyAdapter) and Gmail
 * (lib/integrations/gmail/client.ts, GmailAdapter) both implement this
 * interface with real behavior — no skeletons:
 *   - isHealthy() checks the integrations row (status='active', and for
 *     Gmail, that expires_at hasn't passed). This is a DB-row check, not a
 *     live API call — a 401 during actual use is what flips status to
 *     'expired' (Shopify) or triggers a refresh (Gmail).
 *   - refreshToken() refreshes the stored OAuth token where the provider
 *     supports it: Gmail calls Google's OAuth2Client.refreshAccessToken()
 *     with the stored refresh token; Shopify tokens don't expire/refresh, so
 *     its refreshToken() instead marks the row 'expired' on a 401 and
 *     surfaces the reconnect path.
 *
 * The Shopify adapter additionally exposes isSimulated() — true when the
 * connection holds SANDBOX_SENTINEL_TOKEN, the signal that writes should be
 * simulated against the local mirror instead of calling the real Shopify API
 * (used by the demo/sandbox write path).
 */
export interface IntegrationAdapter {
  /**
   * Returns true if the stored integration row looks healthy (status
   * 'active', and — where applicable — the token hasn't expired).
   */
  isHealthy(): Promise<boolean>;

  /**
   * Refreshes the stored OAuth token where the provider supports it, or
   * marks the connection expired when it doesn't (see provider-specific
   * notes above).
   */
  refreshToken(): Promise<void>;
}
