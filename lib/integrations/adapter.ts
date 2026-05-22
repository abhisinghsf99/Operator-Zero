// lib/integrations/adapter.ts
// Source: TECH-SPEC.md §6.3
// Pattern 7 (RESEARCH.md): IntegrationAdapter interface.
// All integration clients (Shopify, Gmail, etc.) implement this interface.

/**
 * Common interface for all integration adapter implementations.
 *
 * Phase 1: Shopify + Gmail are compile-only skeletons.
 * Phase 2: Implementations wire real API calls behind this interface.
 */
export interface IntegrationAdapter {
  /**
   * Returns true if the stored credentials are valid (e.g. a token ping succeeds).
   * Phase 1 skeletons always return false — no real API calls are made.
   */
  isHealthy(): Promise<boolean>;

  /**
   * Refreshes the stored OAuth token.
   * Phase 1 skeletons throw 'Not implemented until Phase 2'.
   */
  refreshToken(): Promise<void>;
}
