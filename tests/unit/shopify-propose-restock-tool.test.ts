/**
 * tests/unit/shopify-propose-restock-tool.test.ts
 * Tool-level coverage for shopify_propose_restock.
 *
 * Tests:
 *   (a) PROPOSE — execute({variant_gid}, L2): generateRestockProposal called once,
 *       updateInventory NOT called; result includes inventory_qty (=50) + rationale + phase=propose;
 *       extractProposedAction returns { variant_gid, inventory_qty: 50 } (NOT bare input)
 *   (b) WRITE — execute({variant_gid, inventory_qty: 50}, L3): updateInventory called once,
 *       generateRestockProposal NOT called, phase=write
 *   (b2) WRITE with inventory_qty: 0 (typeof === "number") → updateInventory called with 0,
 *        generateRestockProposal NOT called (critical typeof gate)
 *   (c) L3 reason+write — execute({variant_gid}, L3): generateRestockProposal AND updateInventory called; phase=l3
 *   (d) Zod — execute({}, ctx): is_error; execute({variant_gid: "g", inventory_qty: "not-a-number"}, ctx): is_error
 *   (e) extractProposedAction fallback — content non-JSON → returns input;
 *       content JSON with no inventory_qty → returns input;
 *       content JSON with inventory_qty: "50" (string, not number) → returns input
 *   (f) variant not found → is_error, generateRestockProposal NOT called
 *   smoke: tool defined, correct name, approvalRequired true for L2 / false for L3
 *
 * IMPORTANT: This file uses DIFFERENT mocks than propose-restock.test.ts to avoid
 * vitest mock collision. This file mocks the higher-level helper + DB + Shopify.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGenerateRestockProposal = vi.fn();
vi.mock("@/lib/agent/generation/propose-restock", () => ({
  generateRestockProposal: (...args: unknown[]) => mockGenerateRestockProposal(...args),
}));

const mockUpdateInventory = vi.fn();
vi.mock("@/lib/integrations/shopify/mutations", () => ({
  updateInventory: (...args: unknown[]) => mockUpdateInventory(...args),
}));

// Mock serviceDb — variant row (first select) + product row (second select)
const mockVariantRow = {
  user_id: "user-123",
  variant_gid: "gid://shopify/ProductVariant/1",
  product_gid: "gid://shopify/Product/1",
  sku: "MUG-01",
  price: "12.00",
  inventory_qty: 0,
};

const mockProductRow = {
  user_id: "user-123",
  product_gid: "gid://shopify/Product/1",
  title: "Test Mug",
};

const createQueryChain = (result: unknown[]) => ({
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(result),
});

let variantQueryResult: unknown[] = [mockVariantRow];
let productQueryResult: unknown[] = [mockProductRow];
let callCount = 0;

vi.mock("@/lib/db/client", () => ({
  serviceDb: {
    select: vi.fn().mockImplementation(() => {
      callCount++;
      // First select = variant, second = product
      const result = callCount % 2 === 1 ? variantQueryResult : productQueryResult;
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

import { shopifyProposeRestock } from "@/lib/agent/tools/write/index";
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

const VARIANT_GID = "gid://shopify/ProductVariant/1";
const TARGET_QTY = 50;
const RATIONALE = "Out of stock; restock to cover demand.";
const IDEMPOTENCY_KEY = "idem-inv-key-abc";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("shopify_propose_restock tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
    variantQueryResult = [mockVariantRow];
    productQueryResult = [mockProductRow];
    mockGenerateRestockProposal.mockResolvedValue({
      target_qty: TARGET_QTY,
      rationale: RATIONALE,
    });
    mockUpdateInventory.mockResolvedValue({
      idempotency_key: IDEMPOTENCY_KEY,
      before_state: null,
      after_state: null,
      skipped: false,
    });
  });

  // ── Smoke tests ──────────────────────────────────────────────────────────────

  it("tool is defined and has correct name", () => {
    expect(shopifyProposeRestock).toBeDefined();
    expect(shopifyProposeRestock.name).toBe("shopify_propose_restock");
  });

  it("approvalRequired returns true for L1/L2 and false for L3", () => {
    expect(shopifyProposeRestock.approvalRequired!({}, L2_CTX)).toBe(true);
    expect(shopifyProposeRestock.approvalRequired!({}, L3_CTX)).toBe(false);
  });

  it("tool has extractProposedAction function", () => {
    expect(typeof shopifyProposeRestock.extractProposedAction).toBe("function");
  });

  // ── (a) PROPOSE ─────────────────────────────────────────────────────────────

  it("(a) PROPOSE: generateRestockProposal called once; updateInventory NOT called", async () => {
    const result = await shopifyProposeRestock.execute(
      { variant_gid: VARIANT_GID },
      L2_CTX
    );

    expect(result.type).toBe("tool_result");
    expect(result.is_error).toBe(false);
    expect(mockGenerateRestockProposal).toHaveBeenCalledTimes(1);
    expect(mockUpdateInventory).not.toHaveBeenCalled();
  });

  it("(a) PROPOSE: result content includes inventory_qty (=50) + rationale and phase=propose", async () => {
    const result = await shopifyProposeRestock.execute(
      { variant_gid: VARIANT_GID },
      L2_CTX
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.phase).toBe("propose");
    expect(parsed.inventory_qty).toBe(TARGET_QTY);
    expect(parsed.rationale).toBe(RATIONALE);
    expect(parsed.variant_gid).toBe(VARIANT_GID);
  });

  it("(a) PROPOSE: extractProposedAction returns { variant_gid, inventory_qty } — NOT bare input", async () => {
    expect(shopifyProposeRestock.extractProposedAction).toBeDefined();

    const proposeResult = await shopifyProposeRestock.execute(
      { variant_gid: VARIANT_GID },
      L2_CTX
    );

    const extracted = shopifyProposeRestock.extractProposedAction!(
      proposeResult,
      { variant_gid: VARIANT_GID },
      L2_CTX
    );

    expect(extracted).toEqual({
      variant_gid: VARIANT_GID,
      inventory_qty: TARGET_QTY,
    });
    // NOT the bare input
    expect(extracted).not.toEqual({ variant_gid: VARIANT_GID });
  });

  // ── (b) WRITE ────────────────────────────────────────────────────────────────

  it("(b) WRITE: updateInventory called with {variant_gid, inventory_qty: 50}; generateRestockProposal NOT called", async () => {
    const result = await shopifyProposeRestock.execute(
      { variant_gid: VARIANT_GID, inventory_qty: TARGET_QTY },
      L3_CTX
    );

    expect(result.is_error).toBe(false);
    expect(mockUpdateInventory).toHaveBeenCalledTimes(1);
    expect(mockUpdateInventory).toHaveBeenCalledWith(
      "user-123",
      { variant_gid: VARIANT_GID, inventory_qty: TARGET_QTY }
    );
    expect(mockGenerateRestockProposal).not.toHaveBeenCalled();
  });

  it("(b) WRITE: result content includes phase=write and idempotency_key", async () => {
    const result = await shopifyProposeRestock.execute(
      { variant_gid: VARIANT_GID, inventory_qty: TARGET_QTY },
      L3_CTX
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.phase).toBe("write");
    expect(parsed.idempotency_key).toBe(IDEMPOTENCY_KEY);
  });

  it("(b2) WRITE with inventory_qty: 0 (typeof === 'number') → updateInventory called with 0, generateRestockProposal NOT called", async () => {
    // CRITICAL: inventory_qty: 0 must route to WRITE because typeof 0 === 'number'
    // A truthiness check (!== undefined && !== 0) would incorrectly skip this path
    const result = await shopifyProposeRestock.execute(
      { variant_gid: VARIANT_GID, inventory_qty: 0 },
      L3_CTX
    );

    expect(result.is_error).toBe(false);
    expect(mockUpdateInventory).toHaveBeenCalledTimes(1);
    expect(mockUpdateInventory).toHaveBeenCalledWith(
      "user-123",
      { variant_gid: VARIANT_GID, inventory_qty: 0 }
    );
    expect(mockGenerateRestockProposal).not.toHaveBeenCalled();

    const parsed = JSON.parse(result.content);
    expect(parsed.phase).toBe("write");
  });

  // ── (c) L3 reason+write ──────────────────────────────────────────────────────

  it("(c) L3 reason+write: generateRestockProposal AND updateInventory called; phase=l3", async () => {
    const result = await shopifyProposeRestock.execute(
      { variant_gid: VARIANT_GID },
      L3_CTX
    );

    expect(mockGenerateRestockProposal).toHaveBeenCalledTimes(1);
    expect(mockUpdateInventory).toHaveBeenCalledTimes(1);
    expect(mockUpdateInventory).toHaveBeenCalledWith(
      "user-123",
      { variant_gid: VARIANT_GID, inventory_qty: TARGET_QTY }
    );
    expect(result.is_error).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.phase).toBe("l3");
    expect(parsed.idempotency_key).toBe(IDEMPOTENCY_KEY);
  });

  // ── (d) Zod validation ───────────────────────────────────────────────────────

  it("(d) Zod: execute({}) → is_error tool_result; no generate or updateInventory", async () => {
    const result = await shopifyProposeRestock.execute({}, L2_CTX);

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/variant_gid|required/i);
    expect(mockGenerateRestockProposal).not.toHaveBeenCalled();
    expect(mockUpdateInventory).not.toHaveBeenCalled();
  });

  it("(d) Zod: inventory_qty as string 'not-a-number' → is_error tool_result", async () => {
    const result = await shopifyProposeRestock.execute(
      { variant_gid: "g", inventory_qty: "not-a-number" },
      L2_CTX
    );
    expect(result.is_error).toBe(true);
    expect(mockGenerateRestockProposal).not.toHaveBeenCalled();
    expect(mockUpdateInventory).not.toHaveBeenCalled();
  });

  // ── (e) extractProposedAction fallback ───────────────────────────────────────

  it("(e) extractProposedAction fallback: non-JSON content returns input unchanged", () => {
    const fakeResult: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: "this is not json",
    };
    const originalInput = { variant_gid: VARIANT_GID };
    const extracted = shopifyProposeRestock.extractProposedAction!(
      fakeResult,
      originalInput,
      L2_CTX
    );
    expect(extracted).toEqual(originalInput);
  });

  it("(e) extractProposedAction fallback: JSON with no inventory_qty → returns input", () => {
    const fakeResult: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({ ok: true, phase: "propose", variant_gid: VARIANT_GID }),
    };
    const originalInput = { variant_gid: VARIANT_GID };
    const extracted = shopifyProposeRestock.extractProposedAction!(
      fakeResult,
      originalInput,
      L2_CTX
    );
    expect(extracted).toEqual(originalInput);
  });

  it("(e) extractProposedAction fallback: inventory_qty: '50' (string, not number) → returns input", () => {
    // CRITICAL: typeof guard — string "50" is NOT a number; must fall through to input
    const fakeResult: ToolResult = {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        phase: "propose",
        variant_gid: VARIANT_GID,
        inventory_qty: "50", // string — must NOT be extracted
      }),
    };
    const originalInput = { variant_gid: VARIANT_GID };
    const extracted = shopifyProposeRestock.extractProposedAction!(
      fakeResult,
      originalInput,
      L2_CTX
    );
    // Must return original input, NOT { variant_gid, inventory_qty: "50" }
    expect(extracted).toEqual(originalInput);
  });

  // ── (f) variant not found ────────────────────────────────────────────────────

  it("(f) variant not found → is_error tool_result; generateRestockProposal NOT called", async () => {
    variantQueryResult = []; // no variant row
    const result = await shopifyProposeRestock.execute(
      { variant_gid: "gid://shopify/ProductVariant/999" },
      L2_CTX
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/not found|Variant not found/i);
    expect(mockGenerateRestockProposal).not.toHaveBeenCalled();
  });
});
