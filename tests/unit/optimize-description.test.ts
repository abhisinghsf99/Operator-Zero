/**
 * tests/unit/optimize-description.test.ts
 * Coverage for generateOptimizedDescription helper.
 *
 * Tests:
 *   (a) returns sanitized HTML from generateText output
 *   (b) calls checkCostCap before generateText; on 'hard' throws budget error WITHOUT calling generateText
 *   (c) calls recordCost after a successful generate
 *   (d) strips a <script> tag from model output
 *   (e) placeholder brand voice ("test") falls back to default tone; generateText called once; output non-empty
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
const mockResolveModelChoice = vi.fn().mockReturnValue({ modelId: "claude-opus-4-5", provider: "anthropic", maxTokens: 1024 });
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

const mockCostFor = vi.fn().mockReturnValue(0.005);
vi.mock("@/lib/agent/llm/pricing", () => ({
  costFor: (...args: unknown[]) => mockCostFor(...args),
}));

// ─── Import under test AFTER mocks ────────────────────────────────────────────

import { generateOptimizedDescription } from "@/lib/agent/generation/optimize-description";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(overrides?: Partial<{
  title: string | null;
  body_html: string | null;
  product_type: string | null;
  vendor: string | null;
  product_gid: string;
}>) {
  return {
    product_gid: "gid://shopify/Product/1",
    title: "Test Mug",
    body_html: "<p>A mug.</p>",
    product_type: "Drinkware",
    vendor: "TestBrand",
    ...overrides,
  };
}

const DEFAULT_GENERATE_RESULT = {
  text: "<p>Great product with <strong>amazing</strong> features.</p>",
  usage: { inputTokens: 100, outputTokens: 50 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateOptimizedDescription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCostCap.mockResolvedValue("ok");
    mockGenerateText.mockResolvedValue(DEFAULT_GENERATE_RESULT);
    mockCostFor.mockReturnValue(0.005);
    mockResolveModelChoice.mockReturnValue({ modelId: "claude-opus-4-5", provider: "anthropic", maxTokens: 1024 });
  });

  it("(a) returns sanitized HTML from generateText output", async () => {
    const result = await generateOptimizedDescription({ userId: "u1", product: makeProduct() });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("<p>");
  });

  it("(b) on hard cap, throws budget error WITHOUT calling generateText", async () => {
    mockCheckCostCap.mockResolvedValueOnce("hard");

    await expect(generateOptimizedDescription({ userId: "u1", product: makeProduct() })).rejects.toMatchObject({
      message: expect.stringContaining("Budget exhausted"),
      classification: { type: "budget_exhausted" },
    });

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("(b) checkCostCap is called before generateText", async () => {
    const callOrder: string[] = [];
    mockCheckCostCap.mockImplementation(async () => { callOrder.push("checkCostCap"); return "ok"; });
    mockGenerateText.mockImplementation(async () => { callOrder.push("generateText"); return DEFAULT_GENERATE_RESULT; });

    await generateOptimizedDescription({ userId: "u1", product: makeProduct() });

    expect(callOrder.indexOf("checkCostCap")).toBeLessThan(callOrder.indexOf("generateText"));
  });

  it("(c) calls recordCost after successful generate", async () => {
    await generateOptimizedDescription({ userId: "u1", product: makeProduct() });
    expect(mockRecordCost).toHaveBeenCalledTimes(1);
    expect(mockRecordCost).toHaveBeenCalledWith("u1", expect.any(Number));
  });

  it("(c) recordCost uses costFor(modelId, inputTokens, outputTokens)", async () => {
    mockResolveModelChoice.mockReturnValue({ modelId: "claude-opus-4-5", provider: "anthropic", maxTokens: 1024 });
    mockGenerateText.mockResolvedValue({ text: "<p>body</p>", usage: { inputTokens: 200, outputTokens: 80 } });
    mockCostFor.mockReturnValue(0.0042);

    await generateOptimizedDescription({ userId: "u1", product: makeProduct() });

    expect(mockCostFor).toHaveBeenCalledWith("claude-opus-4-5", 200, 80);
    expect(mockRecordCost).toHaveBeenCalledWith("u1", 0.0042);
  });

  it("(d) strips <script> tag from model output", async () => {
    mockGenerateText.mockResolvedValue({
      text: "<p>Buy now!</p><script>alert('xss')</script>",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const result = await generateOptimizedDescription({ userId: "u1", product: makeProduct() });

    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Buy now!</p>");
  });

  it("(e) placeholder brand voice 'test' does NOT appear verbatim and output is non-empty", async () => {
    const result = await generateOptimizedDescription({
      userId: "u1",
      product: makeProduct(),
      brandVoice: { profile_markdown: "test", tone_tags: [], forbidden_phrases: [] },
    });

    // generateText should have been called once (with default tone, not placeholder text)
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);

    // The prompt passed to generateText should NOT contain the literal word "test"
    // as brand voice content — it should fall back to default tone
    const callArgs = mockGenerateText.mock.calls[0]![0] as { messages: { content: string }[] };
    const promptText = callArgs?.messages?.[0]?.content ?? "";
    // The placeholder value should not be injected as brand voice instructions
    expect(promptText).not.toMatch(/brand voice.*test\b/i);
  });

  it("'soft' cap still allows generation (only hard cap blocks)", async () => {
    mockCheckCostCap.mockResolvedValueOnce("soft");
    const result = await generateOptimizedDescription({ userId: "u1", product: makeProduct() });
    expect(typeof result).toBe("string");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("resolveModel is called with 'DRAFTER' role", async () => {
    await generateOptimizedDescription({ userId: "u1", product: makeProduct() });
    expect(mockResolveModel).toHaveBeenCalledWith("DRAFTER");
  });

  it("handles undefined usage fields gracefully (no crash)", async () => {
    mockGenerateText.mockResolvedValue({ text: "<p>ok</p>", usage: undefined });
    await expect(generateOptimizedDescription({ userId: "u1", product: makeProduct() })).resolves.toBeTruthy();
  });
});
