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
// Groq rates are confirmed published rates for openai/gpt-oss-* as of the
// 2026-07-27 demo-readiness sweep (previously labeled as unconfirmed placeholders).
// Gemini rates are Google AI Studio's published per-million-token pricing as of
// the same sweep date.
const PRICING: Record<string, Rate> = {
  // ── Anthropic ──
  "claude-opus-4-7": { input: 3, output: 15 },
  "claude-opus-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },

  // ── Groq (confirmed published rates as of the 2026-07-27 sweep) ──
  "openai/gpt-oss-120b": { input: 0.15, output: 0.75 },
  "openai/gpt-oss-20b": { input: 0.1, output: 0.5 },

  // ── Google AI Studio / Gemini (confirmed published rates as of the 2026-07-27 sweep) ──
  // gemini-3-flash-preview: the free-tier demo orchestrator (via OZ_MODEL_* overrides) —
  // its free daily quota (~1500 req/day) is ~75× gemini-3.6-flash's 20 req/day.
  "gemini-3-flash-preview": { input: 0.5, output: 3 },
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
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
