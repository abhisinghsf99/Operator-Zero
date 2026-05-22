// lib/integrations/gmail/client.ts
// Pattern 7 (RESEARCH.md): Compile-only skeleton — no live Gmail API calls in Phase 1.
// Phase 2 will implement real OAuth token refresh and inbox health checks.
// SECURITY (T-1-03-04): isHealthy always returns false; no tokens are read here.
import type { IntegrationAdapter } from "../adapter";

export class GmailAdapter implements IntegrationAdapter {
  constructor(private readonly userId: string) {}

  /**
   * Phase 1 stub: returns false (no Gmail API call made).
   * Phase 2: verify token by calling Gmail API (e.g. users.getProfile).
   */
  async isHealthy(): Promise<boolean> {
    // TODO Phase 2: verify token by calling Gmail API
    void this.userId; // userId will be used in Phase 2 to look up stored credentials
    return false;
  }

  /**
   * Phase 1 stub: throws immediately.
   * Phase 2: exchange refresh_token for a new access_token via Google OAuth.
   */
  async refreshToken(): Promise<void> {
    // TODO Phase 2: exchange refresh_token for new access_token via Google OAuth
    throw new Error("Not implemented until Phase 2");
  }
}
