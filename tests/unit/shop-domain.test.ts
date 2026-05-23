/**
 * tests/unit/shop-domain.test.ts
 * TDD RED → GREEN: unit tests for normalizeShopDomain helper.
 *
 * Covers all behavior cases from the plan spec:
 *   - trim + lowercase
 *   - bare handle auto-append
 *   - scheme stripping (https/http)
 *   - path stripping
 *   - mixed-case normalization
 *   - empty / whitespace → null
 *   - invalid chars → null
 *   - dotted non-myshopify domains → null
 */
import { describe, it, expect } from "vitest";
import { normalizeShopDomain, SHOP_DOMAIN_RE } from "@/lib/integrations/shopify/shop-domain";

describe("SHOP_DOMAIN_RE", () => {
  it("accepts a valid myshopify.com domain", () => {
    expect(SHOP_DOMAIN_RE.test("my-store.myshopify.com")).toBe(true);
  });

  it("rejects domains with uppercase letters", () => {
    expect(SHOP_DOMAIN_RE.test("My-Store.myshopify.com")).toBe(false);
  });

  it("rejects non-myshopify domains", () => {
    expect(SHOP_DOMAIN_RE.test("evil.com")).toBe(false);
  });

  it("rejects bare handle (no dot)", () => {
    expect(SHOP_DOMAIN_RE.test("my-store")).toBe(false);
  });
});

describe("normalizeShopDomain", () => {
  it("trims whitespace and lowercases: '  My-Store.myshopify.com  ' → 'my-store.myshopify.com'", () => {
    expect(normalizeShopDomain("  My-Store.myshopify.com  ")).toBe("my-store.myshopify.com");
  });

  it("appends .myshopify.com to a bare handle: 'my-store' → 'my-store.myshopify.com'", () => {
    expect(normalizeShopDomain("my-store")).toBe("my-store.myshopify.com");
  });

  it("strips https:// scheme + trailing slash: 'https://my-store.myshopify.com/' → 'my-store.myshopify.com'", () => {
    expect(normalizeShopDomain("https://my-store.myshopify.com/")).toBe("my-store.myshopify.com");
  });

  it("strips http:// scheme + path: 'http://my-store.myshopify.com/admin' → 'my-store.myshopify.com'", () => {
    expect(normalizeShopDomain("http://my-store.myshopify.com/admin")).toBe("my-store.myshopify.com");
  });

  it("handles mixed-case myshopify: 'My-Store.MyShopify.com' → 'my-store.myshopify.com'", () => {
    expect(normalizeShopDomain("My-Store.MyShopify.com")).toBe("my-store.myshopify.com");
  });

  it("returns null for empty string", () => {
    expect(normalizeShopDomain("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeShopDomain("   ")).toBeNull();
  });

  it("returns null for invalid chars: 'bad domain!.myshopify.com'", () => {
    expect(normalizeShopDomain("bad domain!.myshopify.com")).toBeNull();
  });

  it("returns null for dotted non-myshopify domain: 'evil.com'", () => {
    // 'evil.com' has a dot, so it would NOT get the .myshopify.com append;
    // it doesn't pass SHOP_DOMAIN_RE, so must return null
    expect(normalizeShopDomain("evil.com")).toBeNull();
  });

  it("returns null for a URL to a non-myshopify domain: 'https://evil.com/shop'", () => {
    expect(normalizeShopDomain("https://evil.com/shop")).toBeNull();
  });

  it("the normalized value satisfies SHOP_DOMAIN_RE", () => {
    const result = normalizeShopDomain("  MY-STORE.myshopify.com  ");
    expect(result).not.toBeNull();
    expect(SHOP_DOMAIN_RE.test(result!)).toBe(true);
  });
});
