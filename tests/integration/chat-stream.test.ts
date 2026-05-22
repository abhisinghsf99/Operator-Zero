/**
 * tests/integration/chat-stream.test.ts
 * Wave-0 scaffold — CONV-01: SSE streaming route returns tokens (<2s first token p50)
 *
 * Integration test for the chat streaming route. Tests that the route handler
 * correctly emits SSE tokens and handles authentication, thread ownership,
 * and error cases.
 *
 * Requirement: CONV-01 — Streamed Orchestrator response; <2s first token p50
 *
 * Note: LLM calls are mocked at the Anthropic SDK boundary per TECH-SPEC §7.1.
 * Real first-token latency is measured manually per 02-VALIDATION.md manual verifications.
 */
import { describe, it, expect } from "vitest";

describe("CONV-01 — SSE streaming route emits tokens", () => {
  it.todo("POST /api/chat/[threadId]/send returns Content-Type: text/event-stream");

  it.todo("response includes Cache-Control: no-cache header");

  it.todo("returns 401 if no valid session cookie");

  it.todo("returns 403 if threadId belongs to a different user");

  it.todo("persists user message to messages table before streaming");

  it.todo("creates assistant placeholder message with status='streaming' before streaming");

  it.todo("emits SSE data events with { text: string } shape");

  it.todo("updates assistant message to status='complete' after stream ends");

  it.todo("handles Anthropic tool_use events inline without crashing stream");

  it.todo("returns 429 if user exceeds chat rate limit");
});
