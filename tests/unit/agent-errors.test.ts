/**
 * tests/unit/agent-errors.test.ts
 * Wave-0 scaffold — AGENT-06: Error classification transient/auth/budget
 *
 * Tests the error classification logic in the agent runtime — distinguishing
 * transient errors (retry), auth errors (surface reconnect), and budget
 * exhaustion (degrade write tools).
 *
 * Requirement: AGENT-06 — Error classification: transient → retry; auth → pause; budget → degrade
 */
import { describe, it, expect } from "vitest";

describe("AGENT-06 — Error classification transient/auth/budget", () => {
  it.todo("classifies Anthropic 401 status as auth_error");

  it.todo("classifies Anthropic 529 status (overload) as transient");

  it.todo("classifies Anthropic 529 as retryable (Inngest will handle retry)");

  it.todo("classifies cost_cap='hard' as budget_exhausted");

  it.todo("transient error propagates for Inngest retry without crashing stream");

  it.todo("auth_error surfaces reconnect message to user");

  it.todo("budget_exhausted degrades to chat-only (write tools disabled)");

  it.todo("unknown errors are re-thrown for Inngest to handle");

  it.todo("error classification does not leak internal API key or stack trace to user");
});
