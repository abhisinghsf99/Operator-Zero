// tests/unit/sdk-smoke.test.ts
// SDK smoke tests for Anthropic + Voyage AI.
// INFRA-06: Anthropic SDK callable; Voyage returns 1024-dim vector.
//
// When real API keys are absent (CI without secrets), these tests SKIP gracefully.
// When keys are present (developer machine or CI with secrets), they make live API calls.

import { describe, it, expect } from "vitest";

const HAS_ANTHROPIC_KEY = Boolean(process.env.ANTHROPIC_API_KEY);
const HAS_VOYAGE_KEY = Boolean(process.env.VOYAGE_API_KEY);

// ---------------------------------------------------------------------------
// Module import smoke tests — always run (no keys needed)
// ---------------------------------------------------------------------------

describe("anthropic module (import + type check)", () => {
  it("exports anthropic client and smokeTestAnthropic function", async () => {
    const mod = await import("@/lib/agent/anthropic");
    expect(mod.anthropic).toBeDefined();
    expect(typeof mod.smokeTestAnthropic).toBe("function");
  });

  it("anthropic client has messages.create method", async () => {
    const { anthropic } = await import("@/lib/agent/anthropic");
    expect(typeof anthropic.messages.create).toBe("function");
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

describe.skipIf(!HAS_ANTHROPIC_KEY)(
  "Anthropic live smoke test (requires ANTHROPIC_API_KEY)",
  () => {
    it(
      "smokeTestAnthropic() returns true (API is reachable and returns text)",
      async () => {
        const { smokeTestAnthropic } = await import("@/lib/agent/anthropic");
        const result = await smokeTestAnthropic();
        expect(result).toBe(true);
      },
      15_000 // 15s timeout for network call
    );
  }
);

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
