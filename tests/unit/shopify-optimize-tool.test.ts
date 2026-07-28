/**
 * tests/unit/shopify-optimize-tool.test.ts
 * Tool-level coverage for shopify_optimize_product_description.
 *
 * Tests:
 *   (a) PROPOSE — execute({product_gid}, L2): generateOptimizedDescription called once,
 *       updateProduct NOT called; result contains body_html;
 *       extractProposedAction returns { product_gid, body_html } (NOT bare input)
 *   (b) WRITE — execute({product_gid, body_html}, L3): updateProduct called with body_html,
 *       generateOptimizedDescription NOT called (no regeneration)
 *   (c) L3 generate+write — execute({product_gid}, L3): generateOptimizedDescription AND
 *       updateProduct both called
 *   (d) Zod validation — execute({}, ctx): is_error tool_result; neither generate nor
 *       updateProduct called
 *   (e) extractProposedAction fallback — given non-JSON result content, returns input unchanged
 *
 * IMPORTANT: This file uses DIFFERENT mocks than optimize-description.test.ts to avoid
 * vitest mock collision. This file mocks the higher-level helper + DB + Shopify.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGenerateOptimizedDescription = vi.fn();
vi.mock("@/lib/agent/generation/optimize-description", () => ({
  generateOptimizedDescription: (...args: unknown[]) => mockGenerateOptimizedDescription(...args),
}));

const mockUpdateProduct = vi.fn();
vi.mock("@/lib/integrations/shopify/mutations", () => ({
  updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
}));

// Mock serviceDb — product row + brand voice row
const mockProductRow = {
  user_id: "user-123",
  product_gid: "gid://shopify/Product/1",
  title: "Test Product",
  body_html: "<p>Old description.</p>",
  product_type: "Widget",
  vendor: "ACME",
};

const mockBrandVoiceRow = {
  user_id: "user-123",
  profile_markdown: "Be concise and warm. Highlight durability.",
  tone_tags: ["warm", "concise"],
  forbidden_phrases: [],
};

// Flexible query chain mock that returns appropriate data based on table context
const createQueryChain = (result: unknown[]) => ({
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(result),
});

let productQueryResult: unknown[] = [mockProductRow];
let brandVoiceQueryResult: unknown[] = [mockBrandVoiceRow];
let callCount = 0;

vi.mock("@/lib/db/client", () => ({
  serviceDb: {
    select: vi.fn().mockImplementation(() => {
      callCount++;
      // Alternate: first select = product, second = brand voice
      const result = callCount % 2 === 1 ? productQueryResult : brandVoiceQueryResult;
      return createQueryChain(result);
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "mock-id" }]),
      }),
    }),
  },
}));

// ─── Import under test AFTER mocks ────────────────────────────────────────────

import { shopifyOptimizeProductDescription } from "@/lib/agent/tools/write/index";
import type { AgentContext, ToolResult } from "@/lib/agent/tools/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const L2_CTX: AgentContext = {
  userId: "user-123",
  automationLevel: "L2",
};

const L3_CTX: AgentContext = {
  userId: "user-123",
  automationLevel: "L3",
};

const GENERATED_BODY = "<p>Amazing widget for modern professionals.</p>";
const IDEMPOTENCY_KEY = "idem-key-abc";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("shopify_optimize_product_description tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
    productQueryResult = [mockProductRow];
    brandVoiceQueryResult = [mockBrandVoiceRow];
    mockGenerateOptimizedDescription.mockResolvedValue(GENERATED_BODY);
    mockUpdateProduct.mockResolvedValue({ idempotency_key: IDEMPOTENCY_KEY, before_state: null, after_state: null, skipped: false });
  });

  it("tool is defined and has correct name", () => {
    expect(shopifyOptimizeProductDescription).toBeDefined();
    expect(shopifyOptimizeProductDescription.name).toBe("shopify_optimize_product_description");
  });

  it("approvalRequired returns true for L1/L2 and false for L3", () => {
    expect(shopifyOptimizeProductDescription.approvalRequired!({}, L2_CTX)).toBe(true);
    expect(shopifyOptimizeProductDescription.approvalRequired!({}, L3_CTX)).toBe(false);
  });

  it("(a) PROPOSE: generateOptimizedDescription called once; updateProduct NOT called", async () => {
    const result = await shopifyOptimizeProductDescription.execute(
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    expect(result.type).toBe("tool_result");
    expect(result.is_error).toBe(false);
    expect(mockGenerateOptimizedDescription).toHaveBeenCalledTimes(1);
    expect(mockUpdateProduct).not.toHaveBeenCalled();
  });

  it("(a) PROPOSE: result content includes body_html and phase=propose", async () => {
    const result = await shopifyOptimizeProductDescription.execute(
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.phase).toBe("propose");
    expect(parsed.body_html).toBe(GENERATED_BODY);
    expect(parsed.product_gid).toBe("gid://shopify/Product/1");
  });

  it("(a) PROPOSE: extractProposedAction returns { product_gid, body_html } — NOT bare input", async () => {
    expect(shopifyOptimizeProductDescription.extractProposedAction).toBeDefined();

    const proposeResult = await shopifyOptimizeProductDescription.execute(
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    const extracted = shopifyOptimizeProductDescription.extractProposedAction!(
      proposeResult,
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    expect(extracted).toEqual({
      product_gid: "gid://shopify/Product/1",
      body_html: GENERATED_BODY,
    });
    // NOT the bare input
    expect(extracted).not.toEqual({ product_gid: "gid://shopify/Product/1" });
  });

  it("(b) WRITE: updateProduct called with supplied body_html; generateOptimizedDescription NOT called", async () => {
    const result = await shopifyOptimizeProductDescription.execute(
      { product_gid: "gid://shopify/Product/1", body_html: "<p>Reviewed copy.</p>" },
      L3_CTX
    );

    expect(result.is_error).toBe(false);
    expect(mockUpdateProduct).toHaveBeenCalledTimes(1);
    expect(mockUpdateProduct).toHaveBeenCalledWith(
      "user-123",
      expect.objectContaining({ body_html: "<p>Reviewed copy.</p>", product_gid: "gid://shopify/Product/1" })
    );
    expect(mockGenerateOptimizedDescription).not.toHaveBeenCalled();
  });

  it("(b) WRITE: result content includes phase=write and idempotency_key", async () => {
    const result = await shopifyOptimizeProductDescription.execute(
      { product_gid: "gid://shopify/Product/1", body_html: "<p>Approved copy.</p>" },
      L3_CTX
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.phase).toBe("write");
    expect(parsed.idempotency_key).toBe(IDEMPOTENCY_KEY);
  });

  it("(b) WRITE also works with L2 context if body_html is supplied", async () => {
    const result = await shopifyOptimizeProductDescription.execute(
      { product_gid: "gid://shopify/Product/1", body_html: "<p>Copy.</p>" },
      L2_CTX
    );
    expect(result.is_error).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.phase).toBe("write");
    expect(mockUpdateProduct).toHaveBeenCalledTimes(1);
  });

  it("(c) L3 generate+write: generateOptimizedDescription AND updateProduct called", async () => {
    const result = await shopifyOptimizeProductDescription.execute(
      { product_gid: "gid://shopify/Product/1" },
      L3_CTX
    );

    expect(mockGenerateOptimizedDescription).toHaveBeenCalledTimes(1);
    expect(mockUpdateProduct).toHaveBeenCalledTimes(1);
    expect(result.is_error).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.phase).toBe("l3");
    expect(parsed.idempotency_key).toBe(IDEMPOTENCY_KEY);
  });

  it("(d) Zod: execute({}) → is_error tool_result; no generate or updateProduct", async () => {
    const result = await shopifyOptimizeProductDescription.execute({}, L2_CTX);

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/product_gid|required/i);
    expect(mockGenerateOptimizedDescription).not.toHaveBeenCalled();
    expect(mockUpdateProduct).not.toHaveBeenCalled();
  });

  it("(d) Zod: missing product_gid in input → correctable error", async () => {
    const result = await shopifyOptimizeProductDescription.execute(
      { instructions: "Make it longer" },
      L2_CTX
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/product_gid/i);
  });

  it("(e) extractProposedAction fallback: non-JSON content returns input unchanged", () => {
    const fakeResult: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: "this is not json",
    };
    const originalInput = { product_gid: "gid://1" };
    const extracted = shopifyOptimizeProductDescription.extractProposedAction!(
      fakeResult,
      originalInput,
      L2_CTX
    );
    expect(extracted).toEqual(originalInput);
  });

  it("(e) extractProposedAction fallback: missing body_html in parsed → returns input", () => {
    const fakeResult: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({ ok: true, phase: "propose", product_gid: "gid://1" }), // no body_html
    };
    const originalInput = { product_gid: "gid://1" };
    const extracted = shopifyOptimizeProductDescription.extractProposedAction!(
      fakeResult,
      originalInput,
      L2_CTX
    );
    expect(extracted).toEqual(originalInput);
  });

  it("PROPOSE: product not found returns is_error tool_result", async () => {
    productQueryResult = []; // no product row
    const result = await shopifyOptimizeProductDescription.execute(
      { product_gid: "gid://shopify/Product/999" },
      L2_CTX
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/not found|Product not found/i);
    expect(mockGenerateOptimizedDescription).not.toHaveBeenCalled();
  });
});
