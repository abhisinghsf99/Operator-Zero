"use client";

/**
 * app/app/settings/_byok.tsx
 * Presentational BYOK (Bring Your Own Key) showcase card.
 *
 * FULLY DISABLED — no state mutation, no server action, no DB read.
 * This card communicates the "run on your own model" story (demo-only, non-functional).
 *
 * **Honest showcase:** the active chip + placeholder + footnote dynamically reflect
 * the orchestrator model the app is currently running on (resolveModelChoice
 * resolved server-side from MODEL_PROFILE / OZ_MODEL_ORCHESTRATOR). The other
 * chips remain aspirational/future providers.
 *
 * Mirrors the disabled Meta card pattern from _connections.tsx:
 *   Card with opacity: 0.7 + disabled button + Badge accent="experiment"
 *
 * ACCESSIBILITY:
 *   - section aria-labelledby tied to useId() heading id
 *   - disabled API key input has aria-label
 *   - lock icon is aria-hidden
 */

import { useId } from "react";
import { Card, Button, Badge } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

interface ByokSectionProps {
  isDemo?: boolean;
  /** The current orchestrator model — resolved server-side from MODEL_PROFILE. */
  currentModel: { provider: "anthropic" | "groq"; modelId: string };
}

// Inline input style matching the pattern from _profile.tsx
const inputStyle: React.CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg-subtle)",
  border: "0.5px solid var(--border)",
  borderRadius: "var(--r-sm)",
  fontSize: 13.5,
  color: "var(--text)",
  boxSizing: "border-box",
};

/**
 * Format an active-chip label from a provider + modelId.
 *
 * Anthropic Claude:           "Anthropic · Claude"
 * Groq openai/gpt-oss-120b:   "Groq · GPT-OSS 120B"
 * Groq qwen/qwen3-32b:        "Groq · Qwen3 32B"
 * Groq meta-llama/llama-…:    "Groq · Llama"
 * Fallback:                   "<Provider> · <modelId tail>"
 */
function activeChipLabel(provider: "anthropic" | "groq", modelId: string): string {
  if (provider === "anthropic") return "Anthropic · Claude";

  // Groq
  if (/^openai\/gpt-oss-(\d+)b/i.test(modelId)) {
    const size = modelId.match(/gpt-oss-(\d+)b/i)?.[1] ?? "";
    return size ? `Groq · GPT-OSS ${size}B` : "Groq · GPT-OSS";
  }
  if (/^qwen\/qwen3-(\d+)b/i.test(modelId)) {
    const size = modelId.match(/qwen3-(\d+)b/i)?.[1] ?? "";
    return size ? `Groq · Qwen3 ${size}B` : "Groq · Qwen3";
  }
  if (/^meta-llama\//i.test(modelId)) return "Groq · Llama";

  // Fallback: keep it readable
  const tail = modelId.split("/").pop() ?? modelId;
  return `Groq · ${tail}`;
}

const PLACEHOLDERS: Record<"anthropic" | "groq", string> = {
  anthropic: "sk-ant-…",
  groq: "gsk_…",
};

const PROVIDER_DISPLAY: Record<"anthropic" | "groq", string> = {
  anthropic: "Anthropic",
  groq: "Groq",
};

/** Aspirational/future provider chips — always rendered muted. */
const ASPIRATIONAL_CHIPS = ["OpenAI · GPT", "Google · Gemini", "Meta · Llama", "Mistral"] as const;

export function ByokSection({ isDemo, currentModel }: ByokSectionProps) {
  const headingId = useId();
  const activeLabel = activeChipLabel(currentModel.provider, currentModel.modelId);
  const placeholder = PLACEHOLDERS[currentModel.provider];
  const providerDisplay = PROVIDER_DISPLAY[currentModel.provider];

  // The "other real provider" chip (anthropic vs groq) — also muted when not active,
  // so the showcase honestly displays both as available routes.
  const otherRealProviderChip =
    currentModel.provider === "anthropic" ? "Groq · GPT-OSS" : "Anthropic · Claude";

  return (
    <section aria-labelledby={headingId}>
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2
            id={headingId}
            className="display"
            style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
          >
            Bring your own model
          </h2>
          <Badge size="sm" accent="experiment">Demo</Badge>
        </div>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 580 }}>
          Connect your own provider key to run Operator Zero on the model you prefer.
        </p>
      </div>

      <Card padding={18} style={{ opacity: 0.7 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Provider chips row — plain text, non-interactive */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {/* Active chip — reflects the resolved orchestrator model */}
            <span
              style={{
                padding: "5px 10px",
                background: "var(--bg-subtle)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--r-pill)",
                fontSize: 12.5,
                color: "var(--text)",
                fontWeight: 500,
              }}
            >
              {activeLabel}
            </span>
            {/* The other real provider — muted */}
            <span
              style={{
                padding: "5px 10px",
                background: "var(--bg-subtle)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--r-pill)",
                fontSize: 12.5,
                color: "var(--text-tertiary)",
              }}
            >
              {otherRealProviderChip}
            </span>
            {/* Aspirational chips — always muted */}
            {ASPIRATIONAL_CHIPS.map((label) => (
              <span
                key={label}
                style={{
                  padding: "5px 10px",
                  background: "var(--bg-subtle)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--r-pill)",
                  fontSize: 12.5,
                  color: "var(--text-tertiary)",
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Disabled API key input with lock icon — placeholder reflects the active provider's key format */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Icons.Lock
              size={14}
              aria-hidden={true}
              style={{
                position: "absolute",
                left: 12,
                color: "var(--text-tertiary)",
                flexShrink: 0,
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              disabled
              readOnly
              placeholder={placeholder}
              aria-label="API key (disabled in demo)"
              style={{
                ...inputStyle,
                paddingLeft: 34,
                cursor: "not-allowed",
                opacity: 0.6,
              }}
            />
          </div>

          {/* Actions row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <Button variant="secondary" size="sm" disabled>Connect</Button>
          </div>

          {/* Footnote */}
          <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.5 }}>
            Run Operator Zero on the model you prefer — connect your own provider key, your usage is billed to you.
            {isDemo === true && ` This demo runs on the owner's ${providerDisplay} key.`}
          </p>
        </div>
      </Card>
    </section>
  );
}
