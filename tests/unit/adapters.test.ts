// tests/unit/adapters.test.ts
// Tests the IntegrationAdapter interface and its implementations.
// INFRA-07: adapter interface compiles; ShopifyAdapter + GmailAdapter instantiate.
//
// ShopifyAdapter is a real Phase 2 implementation (02-03): isHealthy() and
// refreshToken() query/update the integrations table via serviceDb, which is mocked
// here so these remain true unit tests (no live DB). GmailAdapter is still a Phase 1
// skeleton until 02-04 implements it.

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

describe("GmailAdapter (Phase 1 skeleton — until 02-04)", () => {
  const adapter = new GmailAdapter("test-user-456");

  it("instantiates without throwing", () => {
    expect(adapter).toBeInstanceOf(GmailAdapter);
  });

  it("isHealthy() resolves to false (Phase 1 skeleton)", async () => {
    const result = await adapter.isHealthy();
    expect(result).toBe(false);
  });

  it("refreshToken() rejects with 'Not implemented until Phase 2'", async () => {
    await expect(adapter.refreshToken()).rejects.toThrow(
      "Not implemented until Phase 2"
    );
  });
});
