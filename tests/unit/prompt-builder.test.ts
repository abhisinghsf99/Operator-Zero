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
 */
import { describe, it, expect } from "vitest";

describe("AGENT-01 — Prompt construction fits token budget", () => {
  it.todo("assembles prompt from system + store context + brand voice + memory sections");

  it.todo("includes top-K semantic recall results from memory_embeddings");

  it.todo("truncates oldest memory items first when approaching token budget");

  it.todo("never exceeds 15,000 tokens for chat system prompt");

  it.todo("never exceeds 20,000 tokens for workflow step system prompt");

  it.todo("snapshot: prompt shape matches expected section structure (regression test)");

  it.todo("includes brand voice profile in prompt when present");

  it.todo("omits brand voice section gracefully when no profile exists");

  it.todo("includes Shopify store context summary (product count, shop domain)");
});
