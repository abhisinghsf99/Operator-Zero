/**
 * tests/unit/model-routing.test.ts
 * WS6 — Google AI Studio (Gemini) provider routing + cost computation.
 *
 * Covers lib/agent/llm/models.ts (resolveModelChoice) and
 * lib/agent/llm/pricing.ts (costFor) for the new "google" profile.
 * process.env is stubbed per test (saved/restored in beforeEach/afterEach) so
 * these tests never depend on the developer's real .env.local values.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveModelChoice } from "@/lib/agent/llm/models";
import { costFor } from "@/lib/agent/llm/pricing";

const ENV_KEYS = [
  "MODEL_PROFILE",
  "OZ_MODEL_ORCHESTRATOR",
  "OZ_MODEL_CLASSIFIER",
  "OZ_MODEL_AUDIT",
  "OZ_MODEL_DRAFTER",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("resolveModelChoice — provider routing (WS6)", () => {
  it("MODEL_PROFILE unset → anthropic ids for every role (default, zero behavior change)", () => {
    expect(resolveModelChoice("ORCHESTRATOR")).toMatchObject({
      provider: "anthropic",
      modelId: "claude-opus-4-7",
    });
    expect(resolveModelChoice("CLASSIFIER")).toMatchObject({
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
    });
    expect(resolveModelChoice("AUDIT")).toMatchObject({
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
    });
    expect(resolveModelChoice("DRAFTER")).toMatchObject({
      provider: "anthropic",
      modelId: "claude-opus-4-5",
    });
  });

  it("MODEL_PROFILE=google → the four Gemini ids per role", () => {
    process.env.MODEL_PROFILE = "google";

    expect(resolveModelChoice("ORCHESTRATOR")).toMatchObject({
      provider: "google",
      modelId: "gemini-3.6-flash",
    });
    expect(resolveModelChoice("CLASSIFIER")).toMatchObject({
      provider: "google",
      modelId: "gemini-3.5-flash-lite",
    });
    expect(resolveModelChoice("AUDIT")).toMatchObject({
      provider: "google",
      modelId: "gemini-3.6-flash",
    });
    expect(resolveModelChoice("DRAFTER")).toMatchObject({
      provider: "google",
      modelId: "gemini-3.6-flash",
    });
  });

  it('OZ_MODEL_ORCHESTRATOR="google:gemini-3.1-pro-preview" overrides just that role', () => {
    process.env.MODEL_PROFILE = "google";
    process.env.OZ_MODEL_ORCHESTRATOR = "google:gemini-3.1-pro-preview";

    expect(resolveModelChoice("ORCHESTRATOR")).toMatchObject({
      provider: "google",
      modelId: "gemini-3.1-pro-preview",
    });
    // Other roles are unaffected by the override — still follow the profile.
    expect(resolveModelChoice("CLASSIFIER")).toMatchObject({
      provider: "google",
      modelId: "gemini-3.5-flash-lite",
    });
  });

  it("an unknown provider prefix in the override is ignored and falls back to the profile", () => {
    process.env.MODEL_PROFILE = "google";
    process.env.OZ_MODEL_ORCHESTRATOR = "openai:gpt-4o";

    expect(resolveModelChoice("ORCHESTRATOR")).toMatchObject({
      provider: "google",
      modelId: "gemini-3.6-flash",
    });
  });

  it("MODEL_PROFILE=groq and MODEL_PROFILE=mixed are unaffected by the google addition", () => {
    process.env.MODEL_PROFILE = "groq";
    expect(resolveModelChoice("ORCHESTRATOR")).toMatchObject({
      provider: "groq",
      modelId: "openai/gpt-oss-120b",
    });

    process.env.MODEL_PROFILE = "mixed";
    expect(resolveModelChoice("ORCHESTRATOR")).toMatchObject({
      provider: "anthropic",
      modelId: "claude-opus-4-7",
    });
  });
});

describe("costFor — Gemini pricing (WS6)", () => {
  it("returns a non-zero cost for each Gemini model id", () => {
    expect(costFor("gemini-3.6-flash", 1000, 1000)).toBeGreaterThan(0);
    expect(costFor("gemini-3.5-flash-lite", 1000, 1000)).toBeGreaterThan(0);
    expect(costFor("gemini-2.5-pro", 1000, 1000)).toBeGreaterThan(0);
  });

  it("falls back to the Opus DEFAULT rate for an unknown model id (T-ebw-04: never under-bills)", () => {
    const unknownCost = costFor("some-unknown-model-id", 1_000_000, 1_000_000);
    const opusCost = costFor("claude-opus-4-7", 1_000_000, 1_000_000);
    expect(unknownCost).toBe(opusCost);
  });
});
