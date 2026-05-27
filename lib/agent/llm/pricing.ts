/**
 * lib/agent/llm/pricing.ts
 * Per-model cost computation in USD.
 *
 * costFor(modelId, inTok, outTok) → USD cost for a single turn.
 *
 * Formula matches the previous hardcoded chat-route math:
 *   (inTok * inputRate + outTok * outputRate) / 1_000_000
 * where rates are USD per million tokens (USD/MTok).
 *
 * SECURITY (T-ebw-04): the DEFAULT entry falls back to Opus (the most expensive)
 * rates, so an unknown / spoofed modelId never UNDER-bills.
 *
 * Server-only module. No NEXT_PUBLIC_ env vars.
 */

interface Rate {
  /** USD per million input tokens */
  input: number;
  /** USD per million output tokens */
  output: number;
}

// USD per million tokens (USD/MTok).
// Anthropic rates match the previously-hardcoded chat-route values (Opus 3/15).
// Groq rates are placeholders — confirm against live Groq pricing before relying
// on cost reports under the groq/mixed profiles.
const PRICING: Record<string, Rate> = {
  // ── Anthropic ──
  "claude-opus-4-7": { input: 3, output: 15 },
  "claude-opus-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },

  // ── Groq (placeholder rates — confirm against live Groq pricing) ──
  "openai/gpt-oss-120b": { input: 0.15, output: 0.75 },
  "openai/gpt-oss-20b": { input: 0.1, output: 0.5 },
};

// DEFAULT falls back to Opus rates so an unknown id never under-bills (T-ebw-04).
const DEFAULT: Rate = { input: 3, output: 15 };

/**
 * costFor — USD cost for a turn given the model id and token counts.
 *
 * @param modelId — the resolved model id (from resolveModelChoice)
 * @param inTok   — input (prompt) tokens
 * @param outTok  — output (completion) tokens
 */
export function costFor(modelId: string, inTok: number, outTok: number): number {
  const rate = PRICING[modelId] ?? DEFAULT;
  return (inTok * rate.input + outTok * rate.output) / 1_000_000;
}
