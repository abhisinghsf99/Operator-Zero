// lib/integrations/shopify/client.ts
// Pattern 7 (RESEARCH.md): Compile-only skeleton — no live Shopify API calls in Phase 1.
// Phase 2 will implement real token refresh and health checks.
// SECURITY (T-1-03-04): isHealthy always returns false; no tokens are read here.
import type { IntegrationAdapter } from "../adapter";

export class ShopifyAdapter implements IntegrationAdapter {
  constructor(private readonly userId: string) {}

  /**
   * Phase 1 stub: returns false (no Shopify API call made).
   * Phase 2: verify token by hitting Shopify API (e.g. GET /admin/api/shop.json).
   */
  async isHealthy(): Promise<boolean> {
    // TODO Phase 2: verify token by hitting Shopify API
    void this.userId; // userId will be used in Phase 2 to look up stored credentials
    return false;
  }

  /**
   * Phase 1 stub: throws immediately.
   * Phase 2: handle 401 responses from Shopify (tokens are long-lived; this covers edge cases).
   */
  async refreshToken(): Promise<void> {
    // TODO Phase 2: Shopify tokens are long-lived; this will handle 401 responses
    throw new Error("Not implemented until Phase 2");
  }
}
