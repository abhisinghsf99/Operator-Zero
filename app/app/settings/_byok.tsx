"use client";

/**
 * app/app/settings/_byok.tsx
 * Presentational BYOK (Bring Your Own Key) showcase card.
 *
 * FULLY DISABLED — no state mutation, no server action, no DB read.
 * This card communicates the "run on your own model" story (demo-only, non-functional).
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

export function ByokSection({ isDemo }: ByokSectionProps) {
  const headingId = useId();

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
            {/* Active chip: Anthropic · Claude */}
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
              Anthropic · Claude
            </span>
            {/* Muted chips */}
            {["OpenAI · GPT", "Google · Gemini", "Meta · Llama", "Mistral"].map((label) => (
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

          {/* Disabled API key input with lock icon */}
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
              placeholder="sk-…"
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
            {isDemo === true && " This demo runs on a shared key."}
          </p>
        </div>
      </Card>
    </section>
  );
}
