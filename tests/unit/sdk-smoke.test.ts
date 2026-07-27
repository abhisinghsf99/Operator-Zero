// tests/unit/sdk-smoke.test.ts
// SDK smoke tests for the provider-routing module + Voyage AI.
// INFRA-06 (updated WS12): provider abstraction is import-safe and callable;
// Voyage returns a 1024-dim vector.
//
// When real API keys are absent (CI without secrets), the Voyage tests SKIP
// gracefully. When keys are present (developer machine or CI with secrets),
// they make live API calls. The dedicated Anthropic live smoke test was
// removed alongside lib/agent/anthropic.ts (WS12 dead-code removal) — provider
// routing is exercised without a live network call via resolveModel/
// resolveModelChoice below.

import { describe, it, expect } from "vitest";

const HAS_VOYAGE_KEY = Boolean(process.env.VOYAGE_API_KEY);

// ---------------------------------------------------------------------------
// Module import smoke tests — always run (no keys needed)
// ---------------------------------------------------------------------------

// lib/agent/anthropic.ts (WS12) was dead code — a standalone Anthropic SDK
// wiring module with no callers outside this test file; the real provider
// routing lives in lib/agent/llm/models.ts (resolveModel / resolveModelChoice),
// which every call site (chat route, runtime.ts, workflow steps) actually uses.
// Replaced the module-existence checks below with provider-routing smoke
// checks of the same test count (2) so this file still verifies the current
// provider abstraction is import-safe and callable.
describe("provider routing module (import + type check)", () => {
  it("exports resolveModel and resolveModelChoice as functions", async () => {
    const mod = await import("@/lib/agent/llm/models");
    expect(typeof mod.resolveModel).toBe("function");
    expect(typeof mod.resolveModelChoice).toBe("function");
  });

  it('resolveModelChoice("ORCHESTRATOR") returns an object with provider, modelId, and maxTokens', async () => {
    const { resolveModelChoice } = await import("@/lib/agent/llm/models");
    const choice = resolveModelChoice("ORCHESTRATOR");
    expect(choice).toHaveProperty("provider");
    expect(choice).toHaveProperty("modelId");
    expect(choice).toHaveProperty("maxTokens");
    expect(typeof choice.provider).toBe("string");
    expect(typeof choice.modelId).toBe("string");
    expect(typeof choice.maxTokens).toBe("number");
  });

  // Extra assertion-level test (replaces the dropped Anthropic live smoke
  // test 1:1 on count) — resolveModel() must construct a LanguageModel
  // instance for the default profile without making a live network call or
  // throwing, regardless of whether a real API key is present in this env.
  it('resolveModel("ORCHESTRATOR") returns a defined model instance without throwing (no live call)', async () => {
    const { resolveModel } = await import("@/lib/agent/llm/models");
    expect(() => resolveModel("ORCHESTRATOR")).not.toThrow();
    expect(resolveModel("ORCHESTRATOR")).toBeDefined();
  });
});

describe("embeddings module (import + type check)", () => {
  it("exports embedText function", async () => {
    const mod = await import("@/lib/agent/embeddings");
    expect(typeof mod.embedText).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Live API smoke tests — skip when keys are absent
// ---------------------------------------------------------------------------

describe.skipIf(!HAS_VOYAGE_KEY)(
  "Voyage AI live smoke test (requires VOYAGE_API_KEY)",
  () => {
    it(
      "embedText() returns a 1024-dimensional vector",
      async () => {
        const { embedText } = await import("@/lib/agent/embeddings");
        const embedding = await embedText("Hello, Operator Zero");
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(1024);
        // Basic sanity: values are finite numbers
        expect(embedding.every((v) => Number.isFinite(v))).toBe(true);
      },
      15_000 // 15s timeout for network call
    );

    it(
      "embedText() with inputType='query' returns a 1024-dimensional vector",
      async () => {
        const { embedText } = await import("@/lib/agent/embeddings");
        const embedding = await embedText(
          "What products are selling well?",
          "query"
        );
        expect(embedding.length).toBe(1024);
      },
      15_000
    );
  }
);
