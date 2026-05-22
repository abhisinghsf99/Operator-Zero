/**
 * tests/unit/agent-errors.test.ts
 * Wave-0 scaffold — AGENT-06: Error classification transient/auth/budget
 *
 * Tests the error classification logic in the agent runtime — distinguishing
 * transient errors (retry), auth errors (surface reconnect), and budget
 * exhaustion (degrade write tools).
 *
 * Requirement: AGENT-06 — Error classification: transient → retry; auth → pause; budget → degrade
 *
 * LLM TESTING RULE: mock Anthropic SDK at the boundary. No live Anthropic calls.
 * NOTE: Anthropic SDK v0.97.1 exports APIError (not APIStatusError) — use that.
 */
import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

// ─── Import under test ─────────────────────────────────────────────────────────

import { classifyAgentError, type AgentErrorClassification } from "@/lib/agent/runtime";

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a real Anthropic.APIError with the given HTTP status code.
 * Uses a fake headers object to satisfy the constructor.
 */
function makeApiError(status: number, message = "API error"): InstanceType<typeof Anthropic.APIError> {
  const fakeHeaders = { get: () => null, entries: () => [] } as unknown as Headers;
  return new Anthropic.APIError(status, undefined, message, fakeHeaders);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AGENT-06 — Error classification transient/auth/budget", () => {
  it("classifies Anthropic 401 status as auth_error", () => {
    const err = makeApiError(401, "Unauthorized");
    const result = classifyAgentError(err);
    expect(result).toEqual<AgentErrorClassification>({ type: "auth_error" });
  });

  it("classifies Anthropic 529 status (overload) as transient", () => {
    const err = makeApiError(529, "Overloaded");
    const result = classifyAgentError(err);
    expect(result).toEqual<AgentErrorClassification>({ type: "transient" });
  });

  it("classifies Anthropic 529 as retryable (Inngest will handle retry)", () => {
    const err = makeApiError(529);
    const result = classifyAgentError(err);
    // transient type signals that the error is retryable via Inngest
    expect(result.type).toBe("transient");
  });

  it("classifies Anthropic 503 (unavailable/overload) as transient", () => {
    const err = makeApiError(503, "Service unavailable");
    const result = classifyAgentError(err);
    expect(result.type).toBe("transient");
  });

  it("classifies Anthropic 429 (rate limit) as transient", () => {
    const err = makeApiError(429, "Rate limit exceeded");
    const result = classifyAgentError(err);
    expect(result.type).toBe("transient");
  });

  it("re-throws unknown errors for Inngest to handle", () => {
    const unknownErr = new Error("Unexpected network failure");
    expect(() => classifyAgentError(unknownErr)).toThrow("Unexpected network failure");
  });

  it("re-throws non-APIError errors", () => {
    const err = new TypeError("fetch failed");
    expect(() => classifyAgentError(err)).toThrow();
  });

  it("error classification does not return auth error for non-401 status", () => {
    const err = makeApiError(500, "Internal server error");
    const result = classifyAgentError(err);
    expect(result.type).not.toBe("auth_error");
  });

  it("classifyAgentError returns an object with a type field on classified errors", () => {
    const err401 = makeApiError(401);
    const err529 = makeApiError(529);
    expect(classifyAgentError(err401)).toHaveProperty("type");
    expect(classifyAgentError(err529)).toHaveProperty("type");
  });
});
