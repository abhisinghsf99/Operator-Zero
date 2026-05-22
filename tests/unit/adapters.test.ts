// tests/unit/adapters.test.ts
// Tests the IntegrationAdapter interface and its implementations.
// INFRA-07: adapter interface compiles; ShopifyAdapter + GmailAdapter instantiate.
//
// ShopifyAdapter is a real Phase 2 implementation (02-03): isHealthy() and
// refreshToken() query/update the integrations table via serviceDb, which is mocked
// here so these remain true unit tests (no live DB). GmailAdapter is a real Phase 2
// implementation (02-04): isHealthy() queries the integrations table via serviceDb;
// refreshToken() delegates to getAccessToken() which also uses serviceDb and
// google-auth-library (both mocked here).

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable state the serviceDb mock reads from — hoisted so the vi.mock factory
// (which is lifted above imports) can close over it without a ReferenceError.
const dbState = vi.hoisted(() => ({
  selectRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db/client", () => {
  const serviceDb = {
    // select().from().where().limit() → resolves to dbState.selectRows
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.limit = () => Promise.resolve(dbState.selectRows);
      return chain;
    },
    // update().set().where() → resolves (mirror status write)
    update: () => {
      const chain: Record<string, unknown> = {};
      chain.set = () => chain;
      chain.where = () => Promise.resolve(undefined);
      return chain;
    },
  };
  return { serviceDb };
});

// Mock google-auth-library — GmailAdapter uses OAuth2Client for token refresh
const mockOAuth2Instance = vi.hoisted(() => ({
  setCredentials: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("google-auth-library", () => {
  const MockOAuth2Client = vi.fn(function () {
    return mockOAuth2Instance;
  });
  return { OAuth2Client: MockOAuth2Client };
});

// Mock googleapis (also used by GmailAdapter.createGmailClient)
vi.mock("googleapis", () => {
  const MockOAuth2Client = vi.fn(function () {
    return mockOAuth2Instance;
  });
  return {
    google: {
      gmail: vi.fn().mockReturnValue({ users: {} }),
      auth: { OAuth2: MockOAuth2Client },
    },
    OAuth2Client: MockOAuth2Client,
  };
});

// Mock inngest — GmailAdapter.exchangeGmailCode fires an event (not needed for adapter tests)
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

// Mock crypto — GmailAdapter.getAccessToken decrypts tokens
vi.mock("@/lib/integrations/crypto", () => ({
  encryptToken: vi.fn().mockImplementation((v: string) =>
    Promise.resolve(`encrypted:${v}`)
  ),
  decryptToken: vi.fn().mockImplementation((v: string) =>
    Promise.resolve(v.replace("encrypted:", ""))
  ),
}));

import type { IntegrationAdapter } from "@/lib/integrations/adapter";
import { ShopifyAdapter } from "@/lib/integrations/shopify/client";
import { GmailAdapter } from "@/lib/integrations/gmail/client";

describe("IntegrationAdapter interface", () => {
  it("ShopifyAdapter implements IntegrationAdapter at the type level", () => {
    // If this compiles, the type constraint is satisfied.
    const adapter: IntegrationAdapter = new ShopifyAdapter("test-user");
    expect(adapter).toBeDefined();
  });

  it("GmailAdapter implements IntegrationAdapter at the type level", () => {
    const adapter: IntegrationAdapter = new GmailAdapter("test-user");
    expect(adapter).toBeDefined();
  });
});

describe("ShopifyAdapter (Phase 2 — real, DB mocked)", () => {
  const adapter = new ShopifyAdapter("test-user-123");

  beforeEach(() => {
    dbState.selectRows = [];
  });

  it("instantiates without throwing", () => {
    expect(adapter).toBeInstanceOf(ShopifyAdapter);
  });

  it("isHealthy() resolves to true when the integration row status is 'active'", async () => {
    dbState.selectRows = [{ status: "active" }];
    await expect(adapter.isHealthy()).resolves.toBe(true);
  });

  it("isHealthy() resolves to false when there is no active integration", async () => {
    dbState.selectRows = []; // no row → not connected
    await expect(adapter.isHealthy()).resolves.toBe(false);

    dbState.selectRows = [{ status: "expired" }]; // present but not active
    await expect(adapter.isHealthy()).resolves.toBe(false);
  });

  it("refreshToken() marks the token expired and throws a reconnect error (Shopify tokens do not refresh)", async () => {
    await expect(adapter.refreshToken()).rejects.toThrow(/reconnect/i);
  });
});

describe("GmailAdapter (Phase 2 — real, DB mocked)", () => {
  const adapter = new GmailAdapter("test-user-456");

  beforeEach(() => {
    dbState.selectRows = [];
    vi.clearAllMocks();
  });

  it("instantiates without throwing", () => {
    expect(adapter).toBeInstanceOf(GmailAdapter);
  });

  it("isHealthy() resolves to true when the integration row status is 'active' and not expired", async () => {
    dbState.selectRows = [
      { status: "active", expires_at: new Date(Date.now() + 3600 * 1000) },
    ];
    await expect(adapter.isHealthy()).resolves.toBe(true);
  });

  it("isHealthy() resolves to false when there is no active integration", async () => {
    dbState.selectRows = [];
    await expect(adapter.isHealthy()).resolves.toBe(false);

    dbState.selectRows = [{ status: "expired", expires_at: null }];
    await expect(adapter.isHealthy()).resolves.toBe(false);
  });

  it("isHealthy() resolves to false when token is expired", async () => {
    dbState.selectRows = [
      { status: "active", expires_at: new Date(Date.now() - 60 * 1000) },
    ];
    await expect(adapter.isHealthy()).resolves.toBe(false);
  });

  it("refreshToken() refreshes via OAuth2Client when token is expired", async () => {
    dbState.selectRows = [
      {
        id: "int-1",
        status: "active",
        access_token_encrypted: "encrypted:old-access",
        refresh_token_encrypted: "encrypted:my-refresh",
        expires_at: new Date(Date.now() - 60 * 1000),
      },
    ];
    mockOAuth2Instance.refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
        expiry_date: Date.now() + 3600 * 1000,
      },
    });

    await expect(adapter.refreshToken()).resolves.not.toThrow();
    expect(mockOAuth2Instance.refreshAccessToken).toHaveBeenCalled();
  });

  it("refreshToken() rejects when no refresh token is stored", async () => {
    dbState.selectRows = [
      {
        id: "int-1",
        status: "active",
        access_token_encrypted: "encrypted:old-access",
        refresh_token_encrypted: null,
        expires_at: new Date(Date.now() - 60 * 1000),
      },
    ];

    await expect(adapter.refreshToken()).rejects.toThrow(/refresh token/i);
  });
});
