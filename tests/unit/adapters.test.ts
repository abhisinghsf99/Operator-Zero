// tests/unit/adapters.test.ts
// Tests the IntegrationAdapter interface and skeleton implementations.
// INFRA-07: adapter interface compiles; ShopifyAdapter + GmailAdapter instantiate.
//
// No API keys required — adapters are Phase 1 skeletons that perform no real calls.

import { describe, it, expect } from "vitest";
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

describe("ShopifyAdapter", () => {
  const adapter = new ShopifyAdapter("test-user-123");

  it("instantiates without throwing", () => {
    expect(adapter).toBeInstanceOf(ShopifyAdapter);
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

describe("GmailAdapter", () => {
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
