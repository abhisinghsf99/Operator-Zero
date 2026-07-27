/**
 * lib/agent/llm/models.ts
 * Provider abstraction + per-task model routing over the Vercel AI SDK.
 *
 * Lets each agent ROLE (orchestrator / classifier / audit / drafter) run on a
 * different model, and flip the whole app between Anthropic, Groq, and Google
 * AI Studio (Gemini) with a one-line config change — no code edit.
 *
 * Resolution order per role:
 *   1. per-role env override  OZ_MODEL_<ROLE>  (format "provider:modelId",
 *      provider = anthropic|groq|google)
 *   2. MODEL_PROFILE env       ("anthropic" | "groq" | "mixed" | "google")
 *   3. default                 "anthropic"
 *
 * SECURITY:
 *   - Server-only module. Keys (ANTHROPIC_API_KEY / GROQ_API_KEY /
 *     GOOGLE_GENERATIVE_AI_API_KEY) are read from process.env here only —
 *     NEVER NEXT_PUBLIC_.
 *   - Do NOT import this module in Client Components.
 *
 * NOTE: Default profile = "anthropic" maps each role to the SAME model ids that
 * were previously hardcoded at each call site, so the default path is provably
 * zero-behavior-change. MODEL_PROFILE=google is code-complete but only takes
 * effect once GOOGLE_GENERATIVE_AI_API_KEY is set and MODEL_PROFILE is flipped.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AgentRole = "ORCHESTRATOR" | "CLASSIFIER" | "AUDIT" | "DRAFTER";

export type Provider = "anthropic" | "groq" | "google";

export interface ModelChoice {
  provider: Provider;
  modelId: string;
  maxTokens: number;
}

type ProfileName = "anthropic" | "groq" | "mixed" | "google";

// ─── maxTokens per role (preserve today's hardcoded values) ─────────────────────

const MAX_TOKENS: Record<AgentRole, number> = {
  ORCHESTRATOR: 4096,
  CLASSIFIER: 10,
  AUDIT: 1024,
  DRAFTER: 1024,
};

// ─── Profile → role → { provider, modelId } map ─────────────────────────────────
//
// anthropic: the previously-hardcoded model ids per call site (zero behavior change).
// groq:      OpenAI-compatible gpt-oss models on Groq.
// mixed:     "best results" safe default — Opus orchestrator + Groq classifier/audit;
//            DRAFTER follows the anthropic profile in mixed.
// google:    Gemini Flash on every role (decision, sweep 2026-07-27) — the demo's
//            agentic tool loop re-sends the system prompt every step, so latency
//            and free-tier headroom matter more than per-call quality here.
//            Flash is a strong-enough generalist for orchestration + classification.
//            Quality upgrade path: OZ_MODEL_ORCHESTRATOR=google:gemini-2.5-pro
//            overrides just the orchestrator role without touching this profile.

const PROFILES: Record<
  ProfileName,
  Record<AgentRole, { provider: Provider; modelId: string }>
> = {
  anthropic: {
    ORCHESTRATOR: { provider: "anthropic", modelId: "claude-opus-4-7" },
    CLASSIFIER: { provider: "anthropic", modelId: "claude-haiku-4-5" },
    AUDIT: { provider: "anthropic", modelId: "claude-haiku-4-5" },
    DRAFTER: { provider: "anthropic", modelId: "claude-opus-4-5" },
  },
  groq: {
    ORCHESTRATOR: { provider: "groq", modelId: "openai/gpt-oss-120b" },
    CLASSIFIER: { provider: "groq", modelId: "openai/gpt-oss-20b" },
    AUDIT: { provider: "groq", modelId: "openai/gpt-oss-120b" },
    DRAFTER: { provider: "groq", modelId: "openai/gpt-oss-120b" },
  },
  mixed: {
    ORCHESTRATOR: { provider: "anthropic", modelId: "claude-opus-4-7" },
    CLASSIFIER: { provider: "groq", modelId: "openai/gpt-oss-20b" },
    AUDIT: { provider: "groq", modelId: "openai/gpt-oss-120b" },
    DRAFTER: { provider: "anthropic", modelId: "claude-opus-4-5" },
  },
  google: {
    ORCHESTRATOR: { provider: "google", modelId: "gemini-2.5-flash" },
    CLASSIFIER: { provider: "google", modelId: "gemini-2.5-flash-lite" },
    AUDIT: { provider: "google", modelId: "gemini-2.5-flash" },
    DRAFTER: { provider: "google", modelId: "gemini-2.5-flash" },
  },
};

// ─── Env resolution ─────────────────────────────────────────────────────────────

function resolveProfile(): ProfileName {
  const raw = (process.env.MODEL_PROFILE ?? "").trim().toLowerCase();
  if (raw === "groq" || raw === "mixed" || raw === "anthropic" || raw === "google") {
    return raw;
  }
  // Default profile = anthropic => zero behavior change until flipped.
  return "anthropic";
}

/**
 * Parse a per-role override env var of the form "provider:modelId".
 * Returns null if unset or malformed (falls through to the profile table).
 */
function parseRoleOverride(role: AgentRole): { provider: Provider; modelId: string } | null {
  const raw = (process.env[`OZ_MODEL_${role}`] ?? "").trim();
  if (!raw) return null;

  const idx = raw.indexOf(":");
  if (idx <= 0) return null;

  const provider = raw.slice(0, idx).trim().toLowerCase();
  const modelId = raw.slice(idx + 1).trim();
  if (!modelId) return null;
  if (provider !== "anthropic" && provider !== "groq" && provider !== "google") return null;

  return { provider, modelId };
}

// ─── resolveModelChoice ─────────────────────────────────────────────────────────

/**
 * resolveModelChoice — the routing metadata for a role.
 *
 * Used for cost computation (pricing.ts) and the persisted `model_id` column.
 * Resolution order: OZ_MODEL_<ROLE> override → MODEL_PROFILE → default anthropic.
 */
export function resolveModelChoice(role: AgentRole): ModelChoice {
  const override = parseRoleOverride(role);
  const base = override ?? PROFILES[resolveProfile()][role];
  return {
    provider: base.provider,
    modelId: base.modelId,
    maxTokens: MAX_TOKENS[role],
  };
}

// ─── resolveModel ────────────────────────────────────────────────────────────────

/**
 * resolveModel — returns an AI SDK LanguageModel instance for the role.
 *
 * Composes resolveModelChoice() to pick provider + modelId, then constructs the
 * provider via its factory with the server-only API key.
 */
export function resolveModel(role: AgentRole): LanguageModel {
  const choice = resolveModelChoice(role);

  if (choice.provider === "groq") {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    return groq(choice.modelId);
  }

  if (choice.provider === "google") {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return google(choice.modelId);
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic(choice.modelId);
}
