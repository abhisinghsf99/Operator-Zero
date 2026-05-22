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
import { Check, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

  return (
    <div className="flex flex-col gap-6 anim-pop">
      {/* Header */}
      <div>
        <div className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          Connect · {name}
        </div>
        <h2 className="display mt-2 text-[36px] leading-tight tracking-[-0.015em] text-[var(--text)]">
          {connected ? `${name} is connected.` : `Let's plug into ${name}.`}
        </h2>
        <p className="mt-1.5 max-w-[520px] text-[14.5px] leading-[1.55] text-[var(--text-tertiary)]">
          {description}
        </p>
      </div>

      {/* Gmail skip warning */}
      {skippable && !connected && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[var(--r-md)] border-[0.5px] border-[color-mix(in_oklch,var(--warning)_30%,transparent)] bg-[var(--bg-subtle)] p-4"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--warning)]"
            aria-hidden="true"
          />
          <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)]">
            Without Gmail, customer Q&amp;A workflows won't work. You can connect it later in Settings.
          </p>
        </div>
      )}

      {/* Connection card */}
      <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        {/* Status row */}
        <div className="mb-4 flex items-center gap-3.5">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-subtle)]"
            aria-hidden="true"
          >
            {kind === "shopify" ? (
              <ShopifyIcon />
            ) : (
              <GmailIcon />
            )}
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-medium text-[var(--text)]">{name}</div>
            <div className="text-[12px] text-[var(--text-tertiary)]">
              {connected
                ? "Synced and ready."
                : connecting
                ? "Connecting…"
                : "OAuth handshake — about 60 seconds."}
            </div>
          </div>
          {connected ? (
            <Badge variant="success" size="sm">
              <Check className="h-2.5 w-2.5" aria-hidden="true" />
              Connected
            </Badge>
          ) : connecting ? (
            <span className="text-[12px] italic text-[var(--text-tertiary)]" aria-live="polite">
              Redirecting…
            </span>
          ) : (
            <Button
              variant="workflow"
              size="sm"
              onClick={handleConnect}
            >
              Connect
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* Scope list */}
        <div className="border-t border-[var(--border-hairline)] pt-3.5">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            What I'll access
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {scope.map((s) => (
              <div key={s} className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-secondary)]">
                <Check
                  className="h-3 w-3 flex-shrink-0 text-[var(--success)]"
                  aria-hidden="true"
                />
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        {skippable ? (
          <Button
            variant="ghost"
            onClick={onSkip}
            aria-label={`Skip connecting ${name} and continue`}
          >
            Skip — I'll connect later
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant={connected ? "workflow" : "secondary"}
          onClick={onNext}
          disabled={!connected && !skippable}
          aria-disabled={!connected && !skippable}
          className={cn(!connected && !skippable && "cursor-not-allowed opacity-50")}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// ─── Simple SVG icons ─────────────────────────────────────────────────────────

function ShopifyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M15.337 21.76l5.31-1.149S18.433 7.5 18.42 7.404c-.015-.094-.097-.158-.19-.158-.093 0-1.72-.034-1.72-.034s-1.143-1.107-1.266-1.231V21.76zM11.13 5.25s-.372-.102-.975-.102c-.975 0-1.44.602-1.61 1.004-.178.43-.24.858-.24 1.288v.252H7.17l-.428 2.82h1.135L7.1 17.5h2.895l.78-7h.876l.426-2.82h-1.302V9.44c0-.63.133-.938.86-.938h.655L11.13 5.25zm-1.15 16.51l2.265-.496-1.97-14.23-2.31.497L9.98 21.76zm5.56-.25v.25l1.8-.39v-15.5l-1.8.396V21.51z"
        fill="currentColor"
      />
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M2 7l10 7 10-7"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}
