// lib/agent/anthropic.ts
// Source: https://platform.claude.com/docs/en/api/sdks/typescript
// Pattern 6 (RESEARCH.md): Anthropic SDK wiring — server-only, never imported in browser.
// SECURITY (T-1-03-02): ANTHROPIC_API_KEY is a server-only env var.
// Never add NEXT_PUBLIC_ prefix.
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  // Read at runtime (server-only). Will throw if key is missing in production.
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Smoke test: send a minimal message to the Anthropic API.
 * Returns true if the first content block is a text response.
 *
 * Used in tests/unit/sdk-smoke.test.ts (gated on ANTHROPIC_API_KEY presence).
 */
export async function smokeTestAnthropic(): Promise<boolean> {
  const msg = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 10,
    messages: [{ role: "user", content: "Ping" }],
  });
  return msg.content[0]?.type === "text";
}
