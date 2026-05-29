/**
 * tests/unit/propose-restock.test.ts
 * Coverage for generateRestockProposal helper.
 *
 * Tests:
 *   (a) returns { target_qty, rationale } parsed from JSON output
 *   (b) calls checkCostCap before generateText; on 'hard' throws budget error WITHOUT calling generateText
 *   (c) calls recordCost after a successful generate with costFor(modelId, inputTokens, outputTokens)
 *   (d) clamps over-bound target (99999 → 1000) and non-positive target (-5 → ≥ 1)
 *   (e) enforces target_qty > current inventory_qty
 *   (f) resolveModel called with "DRAFTER"
 *   (g) handles undefined usage gracefully
 *   (h) malformed (non-JSON) model output yields first-integer fallback with non-empty rationale
 *   (i) null current inventory_qty treated as 0 (target_qty > 0)
 *
 * LLM TESTING RULE: mock the LLM/cost layer only — no live Anthropic/DB calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

const mockResolveModel = vi.fn().mockReturnValue("fake-model-instance");
const mockResolveModelChoice = vi
  .fn()
  .mockReturnValue({ modelId: "claude-opus-4-5", provider: "anthropic", maxTokens: 256 });
vi.mock("@/lib/agent/llm/models", () => ({
  resolveModel: (...args: unknown[]) => mockResolveModel(...args),
  resolveModelChoice: (...args: unknown[]) => mockResolveModelChoice(...args),
}));

const mockCheckCostCap = vi.fn().mockResolvedValue("ok");
const mockRecordCost = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/cost-cap", () => ({
  checkCostCap: (...args: unknown[]) => mockCheckCostCap(...args),
  recordCost: (...args: unknown[]) => mockRecordCost(...args),
}));

const mockCostFor = vi.fn().mockReturnValue(0.002);
vi.mock("@/lib/agent/llm/pricing", () => ({
  costFor: (...args: unknown[]) => mockCostFor(...args),
}));

// ─── Import under test AFTER mocks ────────────────────────────────────────────

import { generateRestockProposal } from "@/lib/agent/generation/propose-restock";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeVariant(
  overrides?: Partial<{
    variant_gid: string;
    product_title: string | null;
    sku: string | null;
    inventory_qty: number | null;
    price: string | null;
  }>
) {
  return {
    variant_gid: "gid://shopify/ProductVariant/1",
    product_title: "Test Mug",
    sku: "MUG-01",
    inventory_qty: 0,
    price: "12.00",
    ...overrides,
  };
}

const DEFAULT_PROPOSAL_JSON = JSON.stringify({
  target_qty: 50,
  rationale: "Restock to 50 — sustained demand, currently out of stock.",
});

const DEFAULT_GENERATE_RESULT = {
  text: DEFAULT_PROPOSAL_JSON,
  usage: { inputTokens: 80, outputTokens: 40 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateRestockProposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCostCap.mockResolvedValue("ok");
    mockGenerateText.mockResolvedValue(DEFAULT_GENERATE_RESULT);
    mockCostFor.mockReturnValue(0.002);
    mockResolveModelChoice.mockReturnValue({
      modelId: "claude-opus-4-5",
      provider: "anthropic",
      maxTokens: 256,
    });
  });

  it("(a) returns { target_qty, rationale } parsed from JSON output (target_qty is a number, rationale non-empty)", async () => {
    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant(),
    });
    expect(typeof result.target_qty).toBe("number");
    expect(typeof result.rationale).toBe("string");
    expect(result.target_qty).toBe(50);
    expect(result.rationale.length).toBeGreaterThan(0);
  });

  it("(b) on hard cap, throws budget error WITHOUT calling generateText", async () => {
    mockCheckCostCap.mockResolvedValueOnce("hard");

    await expect(
      generateRestockProposal({ userId: "u1", variant: makeVariant() })
    ).rejects.toMatchObject({
      message: expect.stringContaining("Budget exhausted"),
      classification: { type: "budget_exhausted" },
    });

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("(b) checkCostCap is called before generateText", async () => {
    const callOrder: string[] = [];
    mockCheckCostCap.mockImplementation(async () => {
      callOrder.push("checkCostCap");
      return "ok";
    });
    mockGenerateText.mockImplementation(async () => {
      callOrder.push("generateText");
      return DEFAULT_GENERATE_RESULT;
    });

    await generateRestockProposal({ userId: "u1", variant: makeVariant() });

    expect(callOrder.indexOf("checkCostCap")).toBeLessThan(
      callOrder.indexOf("generateText")
    );
  });

  it("(c) calls recordCost after successful generate with costFor(modelId, inputTokens, outputTokens)", async () => {
    mockResolveModelChoice.mockReturnValue({
      modelId: "claude-opus-4-5",
      provider: "anthropic",
      maxTokens: 256,
    });
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ target_qty: 50, rationale: "Steady demand." }),
      usage: { inputTokens: 80, outputTokens: 40 },
    });
    mockCostFor.mockReturnValue(0.0021);

    await generateRestockProposal({ userId: "u1", variant: makeVariant() });

    expect(mockCostFor).toHaveBeenCalledWith("claude-opus-4-5", 80, 40);
    expect(mockRecordCost).toHaveBeenCalledWith("u1", 0.0021);
  });

  it("(d) clamps over-bound target: 99999 → 1000", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ target_qty: 99999, rationale: "Too high." }),
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant({ inventory_qty: 0 }),
    });
    expect(result.target_qty).toBe(1000);
  });

  it("(d) clamps non-positive target: -5 with current inventory_qty 0 → result.target_qty >= 1 and > 0", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ target_qty: -5, rationale: "Negative." }),
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant({ inventory_qty: 0 }),
    });
    expect(result.target_qty).toBeGreaterThanOrEqual(1);
    expect(result.target_qty).toBeGreaterThan(0);
  });

  it("(e) enforces target_qty > current: model returns 3 but variant inventory_qty is 8 → result > 8", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ target_qty: 3, rationale: "Understock." }),
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant({ inventory_qty: 8 }),
    });
    expect(result.target_qty).toBeGreaterThan(8);
  });

  it("(f) resolveModel is called with 'DRAFTER' role", async () => {
    await generateRestockProposal({ userId: "u1", variant: makeVariant() });
    expect(mockResolveModel).toHaveBeenCalledWith("DRAFTER");
  });

  it("(g) handles undefined usage gracefully (no crash)", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ target_qty: 50, rationale: "Fine." }),
      usage: undefined,
    });
    await expect(
      generateRestockProposal({ userId: "u1", variant: makeVariant() })
    ).resolves.toBeTruthy();
    expect(mockCostFor).toHaveBeenCalledWith("claude-opus-4-5", 0, 0);
  });

  it("(h) malformed (non-JSON) model output 'I think 40 units' → target_qty: 40 (first-integer fallback), non-empty rationale", async () => {
    mockGenerateText.mockResolvedValue({
      text: "I think 40 units would be ideal for this variant.",
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant({ inventory_qty: 0 }),
    });
    expect(result.target_qty).toBe(40);
    expect(result.rationale.length).toBeGreaterThan(0);
  });

  it("(i) null current inventory_qty treated as 0 → target_qty > 0", async () => {
    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant({ inventory_qty: null }),
    });
    expect(result.target_qty).toBeGreaterThan(0);
  });

  it("'soft' cap still allows generation (only hard cap blocks)", async () => {
    mockCheckCostCap.mockResolvedValueOnce("soft");
    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant(),
    });
    expect(typeof result.target_qty).toBe("number");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("strips stray HTML tags from rationale", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        target_qty: 50,
        rationale: "<b>Restock needed</b> — demand is high.",
      }),
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant(),
    });
    expect(result.rationale).not.toContain("<b>");
    expect(result.rationale).not.toContain("</b>");
  });

  it("rationale truncated to ≤240 chars", async () => {
    const longRationale = "X".repeat(300);
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ target_qty: 50, rationale: longRationale }),
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant(),
    });
    expect(result.rationale.length).toBeLessThanOrEqual(240);
  });

  it("empty rationale from model falls back to deterministic default", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ target_qty: 50, rationale: "" }),
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const result = await generateRestockProposal({
      userId: "u1",
      variant: makeVariant({ inventory_qty: 3 }),
    });
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.rationale).toMatch(/restock|stock|units/i);
  });
});
