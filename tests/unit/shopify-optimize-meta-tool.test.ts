/**
 * tests/unit/shopify-optimize-meta-tool.test.ts
 * Tool-level coverage for shopify_optimize_meta.
 *
 * Tests:
 *   (a) PROPOSE — execute({product_gid}, L2): generateOptimizedMeta called once,
 *       updateProduct NOT called; result contains meta_title + meta_description;
 *       extractProposedAction returns { product_gid, meta_title, meta_description } (NOT bare input)
 *   (b) WRITE — execute({product_gid, meta_title, meta_description}, L3): updateProduct called,
 *       generateOptimizedMeta NOT called (no regeneration), phase=write
 *   (b2) WRITE with only meta_title supplied → updateProduct patch has meta_title and no meta_description key
 *   (c) L3 generate+write — execute({product_gid}, L3): generateOptimizedMeta AND updateProduct called
 *   (d) Zod validation — execute({}, ctx): is_error tool_result; neither generate nor updateProduct called
 *   (e) extractProposedAction fallback — non-JSON content returns input unchanged;
 *       JSON with neither meta field → returns input
 *   (f) product not found → is_error tool_result, generateOptimizedMeta NOT called
 *   smoke tests: tool defined, correct name, approvalRequired true for L2 / false for L3
 *
 * IMPORTANT: This file uses DIFFERENT mocks than optimize-meta.test.ts to avoid
 * vitest mock collision. This file mocks the higher-level helper + DB + Shopify.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGenerateOptimizedMeta = vi.fn();
vi.mock("@/lib/agent/generation/optimize-meta", () => ({
  generateOptimizedMeta: (...args: unknown[]) => mockGenerateOptimizedMeta(...args),
}));

const mockUpdateProduct = vi.fn();
vi.mock("@/lib/integrations/shopify/mutations", () => ({
  updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
}));

// Mock serviceDb — product row + brand voice row (alternating callCount pattern)
const mockProductRow = {
  user_id: "user-123",
  product_gid: "gid://shopify/Product/1",
  title: "Test Widget",
  body_html: "<p>Old description.</p>",
  product_type: "Widget",
  vendor: "ACME",
  meta_title: null,
  meta_description: null,
};

const mockBrandVoiceRow = {
  user_id: "user-123",
  profile_markdown: "Be concise and compelling. Highlight quality.",
  tone_tags: ["concise", "quality"],
  forbidden_phrases: [],
};

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
      const result =
        callCount % 2 === 1 ? productQueryResult : brandVoiceQueryResult;
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

import { shopifyOptimizeMeta } from "@/lib/agent/tools/write/index";
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

const GENERATED_META_TITLE = "Great Widget SEO Title";
const GENERATED_META_DESCRIPTION =
  "The best widget for modern professionals. Shop now.";
const IDEMPOTENCY_KEY = "idem-meta-key-abc";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("shopify_optimize_meta tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
    productQueryResult = [mockProductRow];
    brandVoiceQueryResult = [mockBrandVoiceRow];
    mockGenerateOptimizedMeta.mockResolvedValue({
      meta_title: GENERATED_META_TITLE,
      meta_description: GENERATED_META_DESCRIPTION,
    });
    mockUpdateProduct.mockResolvedValue({
      idempotency_key: IDEMPOTENCY_KEY,
      before_state: null,
      after_state: null,
      skipped: false,
    });
  });

  // ── Smoke tests ──────────────────────────────────────────────────────────────

  it("tool is defined and has correct name", () => {
    expect(shopifyOptimizeMeta).toBeDefined();
    expect(shopifyOptimizeMeta.name).toBe("shopify_optimize_meta");
  });

  it("approvalRequired returns true for L1/L2 and false for L3", () => {
    expect(shopifyOptimizeMeta.approvalRequired!({}, L2_CTX)).toBe(true);
    expect(shopifyOptimizeMeta.approvalRequired!({}, L3_CTX)).toBe(false);
  });

  // ── (a) PROPOSE ─────────────────────────────────────────────────────────────

  it("(a) PROPOSE: generateOptimizedMeta called once; updateProduct NOT called", async () => {
    const result = await shopifyOptimizeMeta.execute(
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    expect(result.type).toBe("tool_result");
    expect(result.is_error).toBe(false);
    expect(mockGenerateOptimizedMeta).toHaveBeenCalledTimes(1);
    expect(mockUpdateProduct).not.toHaveBeenCalled();
  });

  it("(a) PROPOSE: result content includes meta_title + meta_description and phase=propose", async () => {
    const result = await shopifyOptimizeMeta.execute(
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.phase).toBe("propose");
    expect(parsed.meta_title).toBe(GENERATED_META_TITLE);
    expect(parsed.meta_description).toBe(GENERATED_META_DESCRIPTION);
    expect(parsed.product_gid).toBe("gid://shopify/Product/1");
  });

  it("(a) PROPOSE: extractProposedAction returns { product_gid, meta_title, meta_description } — NOT bare input", async () => {
    expect(shopifyOptimizeMeta.extractProposedAction).toBeDefined();

    const proposeResult = await shopifyOptimizeMeta.execute(
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    const extracted = shopifyOptimizeMeta.extractProposedAction!(
      proposeResult,
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    expect(extracted).toEqual({
      product_gid: "gid://shopify/Product/1",
      meta_title: GENERATED_META_TITLE,
      meta_description: GENERATED_META_DESCRIPTION,
    });
    // NOT the bare input
    expect(extracted).not.toEqual({ product_gid: "gid://shopify/Product/1" });
  });

  it("(a) extractProposedAction: only meta_description present (no meta_title) → returns { product_gid, meta_title, meta_description }", () => {
    // This case validates operator precedence fix: present meta_description triggers return
    const resultWithDescOnly: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        phase: "propose",
        product_gid: "gid://shopify/Product/1",
        meta_title: "",
        meta_description: "Great product description for SEO.",
      }),
    };

    const extracted = shopifyOptimizeMeta.extractProposedAction!(
      resultWithDescOnly,
      { product_gid: "gid://shopify/Product/1" },
      L2_CTX
    );

    // meta_description is present and non-empty — must return parsed fields
    expect(extracted).toEqual({
      product_gid: "gid://shopify/Product/1",
      meta_title: "",
      meta_description: "Great product description for SEO.",
    });
  });

  // ── (b) WRITE ────────────────────────────────────────────────────────────────

  it("(b) WRITE: updateProduct called with meta_title + meta_description; generateOptimizedMeta NOT called", async () => {
    const result = await shopifyOptimizeMeta.execute(
      {
        product_gid: "gid://shopify/Product/1",
        meta_title: "Approved Title",
        meta_description: "Approved Description",
      },
      L3_CTX
    );

    expect(result.is_error).toBe(false);
    expect(mockUpdateProduct).toHaveBeenCalledTimes(1);
    expect(mockUpdateProduct).toHaveBeenCalledWith(
      "user-123",
      expect.objectContaining({
        product_gid: "gid://shopify/Product/1",
        meta_title: "Approved Title",
        meta_description: "Approved Description",
      })
    );
    expect(mockGenerateOptimizedMeta).not.toHaveBeenCalled();
  });

  it("(b) WRITE: result content includes phase=write and idempotency_key", async () => {
    const result = await shopifyOptimizeMeta.execute(
      {
        product_gid: "gid://shopify/Product/1",
        meta_title: "T",
        meta_description: "D",
      },
      L3_CTX
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.phase).toBe("write");
    expect(parsed.idempotency_key).toBe(IDEMPOTENCY_KEY);
  });

  it("(b2) WRITE with only meta_title → updateProduct patch has meta_title and no meta_description key", async () => {
    const result = await shopifyOptimizeMeta.execute(
      {
        product_gid: "gid://shopify/Product/1",
        meta_title: "Only Title",
      },
      L2_CTX
    );

    expect(result.is_error).toBe(false);
    expect(mockUpdateProduct).toHaveBeenCalledTimes(1);
    const callArg = mockUpdateProduct.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArg).toHaveProperty("meta_title", "Only Title");
    expect(callArg).not.toHaveProperty("meta_description");
    expect(mockGenerateOptimizedMeta).not.toHaveBeenCalled();
  });

  // ── (c) L3 generate+write ────────────────────────────────────────────────────

  it("(c) L3 generate+write: generateOptimizedMeta AND updateProduct called; phase=l3", async () => {
    const result = await shopifyOptimizeMeta.execute(
      { product_gid: "gid://shopify/Product/1" },
      L3_CTX
    );

    expect(mockGenerateOptimizedMeta).toHaveBeenCalledTimes(1);
    expect(mockUpdateProduct).toHaveBeenCalledTimes(1);
    expect(mockUpdateProduct).toHaveBeenCalledWith(
      "user-123",
      expect.objectContaining({
        meta_title: GENERATED_META_TITLE,
        meta_description: GENERATED_META_DESCRIPTION,
      })
    );
    expect(result.is_error).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.phase).toBe("l3");
    expect(parsed.idempotency_key).toBe(IDEMPOTENCY_KEY);
  });

  // ── (d) Zod validation ───────────────────────────────────────────────────────

  it("(d) Zod: execute({}) → is_error tool_result; no generate or updateProduct", async () => {
    const result = await shopifyOptimizeMeta.execute({}, L2_CTX);

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/product_gid|required/i);
    expect(mockGenerateOptimizedMeta).not.toHaveBeenCalled();
    expect(mockUpdateProduct).not.toHaveBeenCalled();
  });

  it("(d) Zod: missing product_gid in input → correctable error", async () => {
    const result = await shopifyOptimizeMeta.execute(
      { instructions: "Make it better" },
      L2_CTX
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/product_gid/i);
  });

  // ── (e) extractProposedAction fallback ───────────────────────────────────────

  it("(e) extractProposedAction fallback: non-JSON content returns input unchanged", () => {
    const fakeResult: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: "this is not json",
    };
    const originalInput = { product_gid: "gid://1" };
    const extracted = shopifyOptimizeMeta.extractProposedAction!(
      fakeResult,
      originalInput,
      L2_CTX
    );
    expect(extracted).toEqual(originalInput);
  });

  it("(e) extractProposedAction fallback: JSON with neither meta field → returns input", () => {
    const fakeResult: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({ ok: true, phase: "propose", product_gid: "gid://1" }), // no meta
    };
    const originalInput = { product_gid: "gid://1" };
    const extracted = shopifyOptimizeMeta.extractProposedAction!(
      fakeResult,
      originalInput,
      L2_CTX
    );
    expect(extracted).toEqual(originalInput);
  });

  // ── (f) product not found ────────────────────────────────────────────────────

  it("(f) product not found → is_error tool_result; generateOptimizedMeta NOT called", async () => {
    productQueryResult = []; // no product row
    const result = await shopifyOptimizeMeta.execute(
      { product_gid: "gid://shopify/Product/999" },
      L2_CTX
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/not found|Product not found/i);
    expect(mockGenerateOptimizedMeta).not.toHaveBeenCalled();
  });
});
