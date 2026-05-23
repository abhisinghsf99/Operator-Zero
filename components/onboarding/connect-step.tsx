"use client";

/**
 * components/onboarding/connect-step.tsx
 * Reusable connection step for Shopify and Gmail.
 *
 * Shows connection status, OAuth init button, and scope list.
 * For Gmail: renders a "Skip" button with an explicit warning.
 *
 * SECURITY: OAuth is initiated server-side. This component only triggers
 * the redirect to the OAuth init route — no tokens are handled here.
 *
 * WCAG 2.1 AA:
 *   - Status conveyed via text + icon (not color alone)
 *   - Disabled "Continue" has aria-disabled
 */
import { useState } from "react";
import { Button, Badge, Card } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

interface ConnectStepProps {
  kind: "shopify" | "gmail";
  name: string;
  description: string;
  scope: string[];
  connected: boolean;
  connectPath: string; // e.g. /api/integrations/shopify/connect
  onNext: () => void;
  onSkip?: () => void;
  skippable?: boolean;
}

export function ConnectStep({
  kind,
  name,
  description,
  scope,
  connected,
  connectPath,
  onNext,
  onSkip,
  skippable = false,
}: ConnectStepProps) {
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    setConnecting(true);
    // Navigate to the OAuth init route (server-side handles OAuth)
    window.location.href = connectPath;
  }

  const ServiceIcon = kind === "shopify" ? Icons.Shopify : Icons.Gmail;

  return (
    <div className="anim-pop" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 11.5,
            fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Connect · {name}
        </div>
        <h2
          className="display"
          style={{
            fontSize: 36,
            margin: "8px 0 6px",
            color: "var(--text)",
            letterSpacing: "-0.015em",
          }}
        >
          {connected ? `${name} is connected.` : `Let’s plug into ${name}.`}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 14.5,
            color: "var(--text-tertiary)",
            lineHeight: 1.55,
            maxWidth: 520,
          }}
        >
          {description}
        </p>
      </div>

      {/* Gmail skip warning */}
      {skippable && !connected && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            borderRadius: "var(--r-md)",
            border: "0.5px solid color-mix(in oklch, var(--warning) 30%, transparent)",
            background: "var(--bg-subtle)",
            padding: 16,
          }}
        >
          <Icons.Warning
            size={16}
            style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }}
            aria-hidden={true}
          />
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--text-secondary)",
            }}
          >
            Without Gmail, customer Q&amp;A workflows won&apos;t work. You can connect it later in
            Settings.
          </p>
        </div>
      )}

      {/* Connection card */}
      <Card padding={20}>
        {/* Status row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--r-sm)",
              background: "var(--bg-subtle)",
              display: "grid",
              placeItems: "center",
            }}
            aria-hidden="true"
          >
            <ServiceIcon size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{name}</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {connected
                ? "Synced and ready."
                : connecting
                ? "Connecting…"
                : "OAuth handshake — about 60 seconds."}
            </div>
          </div>
          {connected ? (
            <Badge accent="chat" soft>
              <Icons.Check size={11} aria-hidden={true} /> Connected
            </Badge>
          ) : connecting ? (
            <span
              style={{ fontSize: 12, color: "var(--text-tertiary)", fontStyle: "italic" }}
              aria-live="polite"
            >
              Redirecting…
            </span>
          ) : (
            <Button variant="primary" accent="workflow" onClick={handleConnect}>
              Connect
            </Button>
          )}
        </div>

        {/* Scope list */}
        <div
          style={{
            borderTop: "0.5px solid var(--border-hairline)",
            paddingTop: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            What I&apos;ll access
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {scope.map((s) => (
              <div
                key={s}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                }}
              >
                <Icons.Check size={12} style={{ color: "var(--success)" }} aria-hidden={true} />
                {s}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {skippable ? (
          <Button
            variant="ghost"
            onClick={onSkip}
            aria-label={`Skip connecting ${name} and continue`}
          >
            Skip — I&apos;ll connect later
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant={connected ? "primary" : "secondary"}
          accent="workflow"
          icon="ArrowRight"
          onClick={onNext}
          disabled={!connected && !skippable}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
