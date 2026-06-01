/**
 * tests/unit/optimize-meta.test.ts
 * Coverage for generateOptimizedMeta helper.
 *
 * Tests:
 *   (a) returns { meta_title, meta_description } parsed from JSON output (both non-empty strings)
 *   (b) calls checkCostCap before generateText; on 'hard' throws budget error WITHOUT calling generateText
 *   (c) calls recordCost after a successful generate with costFor(modelId, inputTokens, outputTokens)
 *   (d) truncates over-length meta_title (>60) and meta_description (>160)
 *   (e) placeholder brand voice ("test") does not appear verbatim in prompt; output still produced
 *   (f) resolveModel called with "DRAFTER"
 *   (g) handles undefined usage gracefully
 *   (h) malformed (non-JSON) model output still yields non-empty meta_title + meta_description via fallback
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
  .mockReturnValue({ modelId: "claude-opus-4-5", provider: "anthropic", maxTokens: 512 });
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

const mockCostFor = vi.fn().mockReturnValue(0.003);
vi.mock("@/lib/agent/llm/pricing", () => ({
  costFor: (...args: unknown[]) => mockCostFor(...args),
}));

// ─── Import under test AFTER mocks ────────────────────────────────────────────

import { generateOptimizedMeta } from "@/lib/agent/generation/optimize-meta";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(
  overrides?: Partial<{
    title: string | null;
    body_html: string | null;
    product_type: string | null;
    vendor: string | null;
    product_gid: string;
    meta_title: string | null;
    meta_description: string | null;
  }>
) {
  return {
    product_gid: "gid://shopify/Product/1",
    title: "Artisan Mug",
    body_html: "<p>A beautiful handcrafted mug.</p>",
    product_type: "Drinkware",
    vendor: "CeramiCo",
    meta_title: null,
    meta_description: null,
    ...overrides,
  };
}

const DEFAULT_META_JSON = JSON.stringify({
  meta_title: "Great Mug — Buy Now",
  meta_description:
    "A durable, dishwasher-safe mug your customers will love. Order today.",
});

const DEFAULT_GENERATE_RESULT = {
  text: DEFAULT_META_JSON,
  usage: { inputTokens: 100, outputTokens: 50 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateOptimizedMeta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCostCap.mockResolvedValue("ok");
    mockGenerateText.mockResolvedValue(DEFAULT_GENERATE_RESULT);
    mockCostFor.mockReturnValue(0.003);
    mockResolveModelChoice.mockReturnValue({
      modelId: "claude-opus-4-5",
      provider: "anthropic",
      maxTokens: 512,
    });
  });

  it("(a) returns { meta_title, meta_description } parsed from JSON output (both non-empty strings)", async () => {
    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(typeof result.meta_title).toBe("string");
    expect(typeof result.meta_description).toBe("string");
    expect(result.meta_title.length).toBeGreaterThan(0);
    expect(result.meta_description.length).toBeGreaterThan(0);
    expect(result.meta_title).toBe("Great Mug — Buy Now");
    expect(result.meta_description).toBe(
      "A durable, dishwasher-safe mug your customers will love. Order today."
    );
  });

  it("(b) on hard cap, throws budget error WITHOUT calling generateText", async () => {
    mockCheckCostCap.mockResolvedValueOnce("hard");

    await expect(
      generateOptimizedMeta({ userId: "u1", product: makeProduct() })
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

    await generateOptimizedMeta({ userId: "u1", product: makeProduct() });

    expect(callOrder.indexOf("checkCostCap")).toBeLessThan(
      callOrder.indexOf("generateText")
    );
  });

  it("(c) calls recordCost after successful generate with costFor(modelId, inputTokens, outputTokens)", async () => {
    mockResolveModelChoice.mockReturnValue({
      modelId: "claude-opus-4-5",
      provider: "anthropic",
      maxTokens: 512,
    });
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        meta_title: "Best Widget",
        meta_description: "Top-rated widget for every home.",
      }),
      usage: { inputTokens: 200, outputTokens: 80 },
    });
    mockCostFor.mockReturnValue(0.0042);

    await generateOptimizedMeta({ userId: "u1", product: makeProduct() });

    expect(mockCostFor).toHaveBeenCalledWith("claude-opus-4-5", 200, 80);
    expect(mockRecordCost).toHaveBeenCalledWith("u1", 0.0042);
  });

  it("(d) truncates over-length meta_title to ≤60 chars", async () => {
    const longTitle = "A".repeat(80);
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        meta_title: longTitle,
        meta_description: "A short description.",
      }),
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(result.meta_title.length).toBeLessThanOrEqual(60);
  });

  it("(d) truncates over-length meta_description to ≤160 chars", async () => {
    const longDesc = "B".repeat(200);
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        meta_title: "Good Title",
        meta_description: longDesc,
      }),
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(result.meta_description.length).toBeLessThanOrEqual(160);
  });

  it("(e) placeholder brand voice 'test' does NOT appear verbatim in prompt; output is still produced", async () => {
    const result = await generateOptimizedMeta({
      userId: "u1",
      product: makeProduct(),
      brandVoice: { profile_markdown: "test", tone_tags: [], forbidden_phrases: [] },
    });

    // generateText should have been called once
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(result.meta_title.length).toBeGreaterThan(0);
    expect(result.meta_description.length).toBeGreaterThan(0);

    // The prompt should NOT inject the placeholder text as brand voice
    const callArgs = mockGenerateText.mock.calls[0]![0] as {
      messages: { content: string }[];
    };
    const promptText = callArgs?.messages?.[0]?.content ?? "";
    expect(promptText).not.toMatch(/brand voice.*test\b/i);
  });

  it("(f) resolveModel is called with 'DRAFTER' role", async () => {
    await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(mockResolveModel).toHaveBeenCalledWith("DRAFTER");
  });

  it("(g) handles undefined usage gracefully (no crash)", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        meta_title: "Good Title",
        meta_description: "Good description.",
      }),
      usage: undefined,
    });
    await expect(
      generateOptimizedMeta({ userId: "u1", product: makeProduct() })
    ).resolves.toBeTruthy();
  });

  it("(h) malformed (non-JSON) model output still yields non-empty meta_title + meta_description via fallback", async () => {
    mockGenerateText.mockResolvedValue({
      text: "This is a compelling SEO title\nAnd a great description for the product.",
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(typeof result.meta_title).toBe("string");
    expect(typeof result.meta_description).toBe("string");
    expect(result.meta_title.length).toBeGreaterThan(0);
    expect(result.meta_description.length).toBeGreaterThan(0);
  });

  it("'soft' cap still allows generation (only hard cap blocks)", async () => {
    mockCheckCostCap.mockResolvedValueOnce("soft");
    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(typeof result.meta_title).toBe("string");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("strips stray HTML tags from meta_title and meta_description", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        meta_title: "<b>Best Mug</b> Ever",
        meta_description: "<p>Amazing <em>mug</em> for coffee lovers.</p>",
      }),
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(result.meta_title).not.toContain("<b>");
    expect(result.meta_description).not.toContain("<p>");
    expect(result.meta_description).not.toContain("<em>");
  });

  // ─── parseMeta robustness cases (BUG C) ────────────────────────────────────

  it("(parseMeta-a) bare JSON object parses to {meta_title, meta_description}", async () => {
    mockGenerateText.mockResolvedValue({
      text: DEFAULT_META_JSON,
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(result.meta_title).toBe("Great Mug — Buy Now");
    expect(result.meta_description).toBe(
      "A durable, dishwasher-safe mug your customers will love. Order today."
    );
  });

  it("(parseMeta-b) ```json-fenced JSON parses to {meta_title, meta_description} (fence does NOT delete content)", async () => {
    const fencedJson = "```json\n" + DEFAULT_META_JSON + "\n```";
    mockGenerateText.mockResolvedValue({
      text: fencedJson,
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(result.meta_title).toBe("Great Mug — Buy Now");
    expect(result.meta_description).toBe(
      "A durable, dishwasher-safe mug your customers will love. Order today."
    );
  });

  it("(parseMeta-c) plain-fenced (no lang) JSON parses to {meta_title, meta_description}", async () => {
    const fencedJson = "```\n" + DEFAULT_META_JSON + "\n```";
    mockGenerateText.mockResolvedValue({
      text: fencedJson,
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(result.meta_title).toBe("Great Mug — Buy Now");
    expect(result.meta_description).toBe(
      "A durable, dishwasher-safe mug your customers will love. Order today."
    );
  });

  it("(parseMeta-d) JSON with leading preamble prose parses correctly", async () => {
    const withPreamble =
      "Here is your optimized SEO metadata:\n\n" + DEFAULT_META_JSON;
    mockGenerateText.mockResolvedValue({
      text: withPreamble,
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(result.meta_title).toBe("Great Mug — Buy Now");
    expect(result.meta_description).toBe(
      "A durable, dishwasher-safe mug your customers will love. Order today."
    );
  });

  it("(parseMeta-e) non-JSON garbage falls back to line-based extraction, both values non-empty", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Artisan Mug — Handcrafted Excellence\nDiscover the beauty of handcrafted ceramics. Perfect for any kitchen.",
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const result = await generateOptimizedMeta({ userId: "u1", product: makeProduct() });
    expect(result.meta_title.length).toBeGreaterThan(0);
    expect(result.meta_description.length).toBeGreaterThan(0);
  });

  it("(parseMeta-f) truly empty output (empty string) throws 'Generated meta was empty after parsing'", async () => {
    mockGenerateText.mockResolvedValue({
      text: "",
      usage: { inputTokens: 10, outputTokens: 2 },
    });

    await expect(
      generateOptimizedMeta({ userId: "u1", product: makeProduct() })
    ).rejects.toThrow(/empty after parsing/);
  });
});
