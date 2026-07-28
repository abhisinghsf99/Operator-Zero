/**
 * tests/unit/prompt-builder.test.ts
 * Wave-0 scaffold — AGENT-01: Prompt construction fits token budget
 *
 * Tests that the prompt assembly function correctly loads memory, brand voice,
 * store context, and semantic recall, while fitting within the token budget
 * by truncating oldest items first.
 *
 * Requirement: AGENT-01 — Runtime constructs prompts from system + store context + brand voice
 *              + memory + tools under token budget
 *
 * LLM TESTING RULE: Mock Anthropic SDK at the boundary. Snapshot the assembled
 * PROMPT STRUCTURE, never LLM output. No live Anthropic/Voyage/Redis calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock serviceDb ────────────────────────────────────────────────────────────

vi.mock("@/lib/db/client", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  return { serviceDb: mockDb };
});

// ─── Mock embeddings ───────────────────────────────────────────────────────────

vi.mock("@/lib/agent/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
}));

// ─── Mock memory ──────────────────────────────────────────────────────────────

vi.mock("@/lib/agent/memory", () => ({
  recallMemory: vi.fn().mockResolvedValue([]),
}));

// ─── Import under test ─────────────────────────────────────────────────────────

import {
  assemblePrompt,
  CHAT_TOKEN_BUDGET,
  WORKFLOW_TOKEN_BUDGET,
  estimateTokens,
  type PromptContext,
} from "@/lib/agent/prompt";

const USER_ID = "user-test-123";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeMemoryItems(count: number, prefix = "Memory") {
  return Array.from({ length: count }, (_, i) => ({
    id: `mem-${i}`,
    user_id: USER_ID,
    category: "preference" as const,
    content: `${prefix} item ${i}: some stored preference content`,
    source_type: "agent_inferred" as const,
    source_reference_id: null,
    confidence: 0.9,
    soft_deleted_at: null,
    created_at: new Date(Date.now() - i * 60_000), // oldest last
    updated_at: new Date(Date.now() - i * 60_000),
  }));
}

function makeSemanticRecalls(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `recall-${i}`,
    user_id: USER_ID,
    category: "catalog" as const,
    content: `Semantic recall ${i}: relevant stored fact`,
    similarity: 0.9 - i * 0.05,
    source_type: "agent_inferred" as const,
    source_reference_id: null,
    confidence: 0.8,
    soft_deleted_at: null,
    created_at: new Date(Date.now() - i * 3_600_000),
    updated_at: new Date(Date.now() - i * 3_600_000),
  }));
}

const BASE_CTX: PromptContext = {
  userId: USER_ID,
  memoryItems: [],
  brandVoice: null,
  storeContext: null,
  semanticRecall: [],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AGENT-01 — Prompt construction fits token budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assembles prompt from system + store context + brand voice + memory sections", () => {
    const ctx: PromptContext = {
      ...BASE_CTX,
      memoryItems: makeMemoryItems(2),
      brandVoice: { profile_markdown: "Warm, conversational tone.", tone_tags: ["warm"] },
      storeContext: { shopDomain: "mystore.myshopify.com", productCount: 42 },
      semanticRecall: makeSemanticRecalls(2),
    };
    const prompt = assemblePrompt(ctx);
    expect(prompt).toContain("SYSTEM ROLE");
    expect(prompt).toContain("STORE CONTEXT");
    expect(prompt).toContain("BRAND VOICE");
    expect(prompt).toContain("MEMORY");
    expect(prompt).toContain("SEMANTIC RECALL");
  });

  it("WS5: SYSTEM ROLE names all four domain playbooks and TOOLS is registry-generated", () => {
    const prompt = assemblePrompt(BASE_CTX);

    // Four domain playbooks present in the SYSTEM ROLE section.
    expect(prompt).toContain("### CATALOG");
    expect(prompt).toContain("### SEO");
    expect(prompt).toContain("### Q&A");
    expect(prompt).toContain("### INVENTORY");
    expect(prompt).toContain("### GUARDRAILS");

    // TOOLS section is generated from the live registry — previously the
    // hand-written list omitted these three smart write tools entirely.
    expect(prompt).toContain("shopify_optimize_meta");
    expect(prompt).toContain("shopify_optimize_product_description");
    expect(prompt).toContain("shopify_propose_restock");
    expect(prompt).toContain("TOOLS");
  });

  it("includes top-K semantic recall results from memory_embeddings", () => {
    const recalls = makeSemanticRecalls(3);
    const ctx: PromptContext = { ...BASE_CTX, semanticRecall: recalls };
    const prompt = assemblePrompt(ctx);
    for (const r of recalls) {
      expect(prompt).toContain(r.content);
    }
  });

  it("truncates oldest memory items first when approaching token budget", () => {
    // Create many items — oldest has highest index
    const items = makeMemoryItems(60, "LargeMemoryContentItem");
    const ctx: PromptContext = {
      ...BASE_CTX,
      memoryItems: items,
      brandVoice: { profile_markdown: "Concise brand voice.", tone_tags: [] },
      storeContext: { shopDomain: "test.myshopify.com", productCount: 100 },
    };
    const prompt = assemblePrompt(ctx, { budget: "chat" });
    const tokenCount = estimateTokens(prompt);
    expect(tokenCount).toBeLessThanOrEqual(CHAT_TOKEN_BUDGET);
    // Oldest items (high index) should be dropped first
    expect(prompt).toContain("LargeMemoryContentItem item 0:"); // newest kept
  });

  it("never exceeds 15,000 tokens for chat system prompt", () => {
    // Create 100 large memory items to force truncation
    const items = makeMemoryItems(100, "A".repeat(200));
    const ctx: PromptContext = { ...BASE_CTX, memoryItems: items };
    const prompt = assemblePrompt(ctx, { budget: "chat" });
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(CHAT_TOKEN_BUDGET);
  });

  it("never exceeds 20,000 tokens for workflow step system prompt", () => {
    const items = makeMemoryItems(100, "A".repeat(200));
    const ctx: PromptContext = { ...BASE_CTX, memoryItems: items };
    const prompt = assemblePrompt(ctx, { budget: "workflow" });
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(WORKFLOW_TOKEN_BUDGET);
  });

  it("snapshot: prompt shape matches expected section structure (regression test)", () => {
    const ctx: PromptContext = {
      userId: USER_ID,
      memoryItems: makeMemoryItems(1),
      brandVoice: { profile_markdown: "Direct and helpful.", tone_tags: ["direct"] },
      storeContext: { shopDomain: "test.myshopify.com", productCount: 5 },
      semanticRecall: makeSemanticRecalls(1),
    };
    const prompt = assemblePrompt(ctx);
    // Verify all 6 sections are present in order. Use the "## " header prefix
    // for BRAND VOICE specifically — WS5's SYSTEM ROLE playbook mentions
    // "BRAND VOICE" by name as guidance, so a bare substring match would find
    // that in-SYSTEM-ROLE reference instead of the actual section header.
    const systemIdx = prompt.indexOf("SYSTEM ROLE");
    const storeIdx = prompt.indexOf("STORE CONTEXT");
    const brandIdx = prompt.indexOf("## BRAND VOICE");
    const memIdx = prompt.indexOf("MEMORY");
    const recallIdx = prompt.indexOf("SEMANTIC RECALL");
    const toolsIdx = prompt.indexOf("TOOLS");
    expect(systemIdx).toBeGreaterThanOrEqual(0);
    expect(storeIdx).toBeGreaterThan(systemIdx);
    expect(brandIdx).toBeGreaterThan(storeIdx);
    expect(memIdx).toBeGreaterThan(brandIdx);
    expect(recallIdx).toBeGreaterThan(memIdx);
    expect(toolsIdx).toBeGreaterThan(recallIdx);
  });

  it("includes brand voice profile in prompt when present", () => {
    const ctx: PromptContext = {
      ...BASE_CTX,
      brandVoice: {
        profile_markdown: "Always use first-person plural.",
        tone_tags: ["inclusive"],
      },
    };
    const prompt = assemblePrompt(ctx);
    expect(prompt).toContain("Always use first-person plural.");
  });

  it("omits brand voice section gracefully when no profile exists", () => {
    const ctx: PromptContext = { ...BASE_CTX, brandVoice: null };
    const prompt = assemblePrompt(ctx);
    // WS5: the SYSTEM ROLE's CATALOG playbook references "BRAND VOICE" by name
    // as guidance ("obey the BRAND VOICE section below verbatim"), so a bare
    // substring check is no longer sufficient — assert the actual section
    // header ("## BRAND VOICE") is absent instead.
    expect(prompt).not.toContain("## BRAND VOICE");
  });

  it("includes Shopify store context summary (product count, shop domain)", () => {
    const ctx: PromptContext = {
      ...BASE_CTX,
      storeContext: { shopDomain: "awesome-store.myshopify.com", productCount: 137 },
    };
    const prompt = assemblePrompt(ctx);
    expect(prompt).toContain("awesome-store.myshopify.com");
    expect(prompt).toContain("137");
  });
});
