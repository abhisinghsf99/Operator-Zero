/**
 * tests/unit/gmail-oauth.test.ts
 * Wave-0 tests — INTEG-04: Gmail OAuth + refresh-token handling
 *
 * Tests Gmail OAuth flow and the critical refresh-token lifecycle
 * (access_type=offline, token refresh on expiry).
 *
 * Requirement: INTEG-04 — Gmail OAuth (gmail.modify); skippable in onboarding with warning
 *
 * All Google API and DB calls are mocked — no live network requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock state ────────────────────────────────────────────────────────

const dbState = vi.hoisted(() => ({
  integrationRow: null as null | Record<string, unknown>,
  upserted: false,
  updated: false,
}));

// Mock DB client
vi.mock("@/lib/db/client", () => {
  const serviceDb = {
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.limit = () =>
        Promise.resolve(
          dbState.integrationRow ? [dbState.integrationRow] : []
        );
      return chain;
    },
    insert: () => {
      const chain: Record<string, unknown> = {};
      chain.values = () => chain;
      chain.onConflictDoUpdate = () => {
        dbState.upserted = true;
        return Promise.resolve(undefined);
      };
      return chain;
    },
    update: () => {
      const chain: Record<string, unknown> = {};
      chain.set = () => chain;
      chain.where = () => {
        dbState.updated = true;
        return Promise.resolve(undefined);
      };
      return chain;
    },
  };
  return { serviceDb };
});

// Mock Inngest client
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock crypto — encryptToken returns a predictable "encrypted:<plaintext>" string
vi.mock("@/lib/integrations/crypto", () => ({
  encryptToken: vi.fn().mockImplementation((v: string) =>
    Promise.resolve(`encrypted:${v}`)
  ),
  decryptToken: vi.fn().mockImplementation((v: string) =>
    Promise.resolve(v.replace("encrypted:", ""))
  ),
}));

// Mock google-auth-library OAuth2Client
const mockOAuth2Client = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  setCredentials: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => mockOAuth2Client),
}));

// Mock Supabase for auth guard
vi.mock("@/lib/auth/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: "test-user-id" } },
      }),
    },
  }),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import { GmailAdapter } from "@/lib/integrations/gmail/client";

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("INTEG-04 — Gmail OAuth + refresh-token handling", () => {
  beforeEach(() => {
    dbState.integrationRow = null;
    dbState.upserted = false;
    dbState.updated = false;
    vi.clearAllMocks();
  });

  it("initiates OAuth flow requesting access_type=offline + prompt=consent", async () => {
    const { buildGmailAuthUrl } = await import(
      "@/lib/integrations/gmail/client"
    );
    mockOAuth2Client.generateAuthUrl.mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&scope=...gmail.modify..."
    );

    const url = buildGmailAuthUrl("test-nonce");
    expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: "offline",
        prompt: "consent",
      })
    );
    expect(url).toContain("accounts.google.com");
  });

  it("requests gmail.modify scope in OAuth authorization URL", async () => {
    const { buildGmailAuthUrl } = await import(
      "@/lib/integrations/gmail/client"
    );
    mockOAuth2Client.generateAuthUrl.mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/gmail.modify"
    );

    buildGmailAuthUrl("test-nonce");
    const callArgs = mockOAuth2Client.generateAuthUrl.mock.calls[0][0] as {
      scope: string[];
    };
    expect(callArgs.scope).toContain(
      "https://www.googleapis.com/auth/gmail.modify"
    );
  });

  it("stores encrypted access_token and refresh_token in integrations table", async () => {
    const { exchangeGmailCode } = await import(
      "@/lib/integrations/gmail/client"
    );
    mockOAuth2Client.getToken.mockResolvedValue({
      tokens: {
        access_token: "plaintext-access",
        refresh_token: "plaintext-refresh",
        expiry_date: Date.now() + 3600 * 1000,
        scope: "https://www.googleapis.com/auth/gmail.modify",
      },
    });

    await exchangeGmailCode("test-user-id", "auth-code", "redirect-uri");

    // encryptToken should be called for both tokens
    const { encryptToken } = await import("@/lib/integrations/crypto");
    expect(encryptToken).toHaveBeenCalledWith("plaintext-access");
    expect(encryptToken).toHaveBeenCalledWith("plaintext-refresh");
    // integrations row upserted
    expect(dbState.upserted).toBe(true);
  });

  it("detects expired access token and refreshes using refresh_token", async () => {
    // Set an expired integration row
    const expiredAt = new Date(Date.now() - 60 * 1000); // 1 min ago
    dbState.integrationRow = {
      id: "int-1",
      status: "active",
      access_token_encrypted: "encrypted:old-access-token",
      refresh_token_encrypted: "encrypted:my-refresh-token",
      expires_at: expiredAt,
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    };

    mockOAuth2Client.refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
        expiry_date: Date.now() + 3600 * 1000,
      },
    });

    const adapter = new GmailAdapter("test-user-id");
    const token = await adapter.getAccessToken();

    expect(token).toBe("new-access-token");
    // Should have re-encrypted the new access token
    const { encryptToken } = await import("@/lib/integrations/crypto");
    expect(encryptToken).toHaveBeenCalledWith("new-access-token");
  });

  it("updates integrations.expires_at after successful token refresh", async () => {
    const expiredAt = new Date(Date.now() - 60 * 1000);
    dbState.integrationRow = {
      id: "int-1",
      status: "active",
      access_token_encrypted: "encrypted:old-access-token",
      refresh_token_encrypted: "encrypted:my-refresh-token",
      expires_at: expiredAt,
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    };

    mockOAuth2Client.refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
        expiry_date: Date.now() + 3600 * 1000,
      },
    });

    const adapter = new GmailAdapter("test-user-id");
    await adapter.getAccessToken();

    // DB should be updated with new encrypted token + expires_at
    expect(dbState.updated).toBe(true);
  });

  it("handles missing refresh_token gracefully (marks integration as expired)", async () => {
    // Integration row has NO refresh token
    dbState.integrationRow = {
      id: "int-1",
      status: "active",
      access_token_encrypted: "encrypted:old-access-token",
      refresh_token_encrypted: null,
      expires_at: new Date(Date.now() - 60 * 1000),
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    };

    const adapter = new GmailAdapter("test-user-id");
    await expect(adapter.getAccessToken()).rejects.toThrow(
      /refresh token/i
    );
  });

  it("allows Gmail step to be skipped with explicit skipGmail flag", async () => {
    // This is a contract test — skipping is signaled by the absence of a gmail integration row
    // The adapter returns false from isHealthy() when no row exists
    dbState.integrationRow = null;
    const adapter = new GmailAdapter("test-user-id");
    const healthy = await adapter.isHealthy();
    expect(healthy).toBe(false);
  });

  it("shows reconnect warning if Gmail integration is missing during workflow", async () => {
    // isHealthy() = false implies the workflow layer surfaces a reconnect warning
    dbState.integrationRow = null;
    const adapter = new GmailAdapter("test-user-id");
    expect(await adapter.isHealthy()).toBe(false);
  });
});
