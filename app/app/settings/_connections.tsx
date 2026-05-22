"use client";

/**
 * app/app/settings/_connections.tsx
 * Client component: Connections section.
 *
 * Renders Shopify and Gmail connection rows with:
 *   - Health status badge (healthy/stale/needs_reconnect)
 *   - Last synced timestamp
 *   - Reconnect button → navigates to OAuth init route
 *   - Disconnect button → opens confirm Dialog, then calls disconnectIntegration
 *
 * SECURITY:
 *   T-2-08-05: Disconnect requires confirm Dialog + server-side ownership check
 *   Status is classified server-side — raw tokens never reach client
 *
 * WCAG 2.1 AA:
 *   - data-testid attributes for Playwright e2e
 *   - Status badges have text labels
 *   - Confirm dialog is focus-trapped (Radix Dialog)
 *   - All interactive elements have descriptive aria-labels
 */
import { useState, useTransition } from "react";
import { Check, AlertCircle, Clock, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { disconnectIntegration } from "@/app/app/settings/actions";
import type { IntegrationHealth } from "@/lib/integrations/health";

interface ConnectionsSectionProps {
  shopifyHealth: IntegrationHealth;
  gmailHealth: IntegrationHealth;
}

export function ConnectionsSection({ shopifyHealth, gmailHealth }: ConnectionsSectionProps) {
  return (
    <section aria-labelledby="connections-heading">
      <div className="mb-5">
        <h2
          id="connections-heading"
          className="display text-[28px] tracking-[-0.015em] text-[var(--text)]"
        >
          Connections
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
          The systems the agent has access to. Connect what you want it to operate on.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <ConnectionRow
          provider="shopify"
          name="Shopify"
          scope="Catalog · Orders · Content · SEO · Inventory"
          health={shopifyHealth}
          connectPath="/api/integrations/shopify/connect"
          testIdPrefix="shopify"
        />
        <ConnectionRow
          provider="gmail"
          name="Gmail"
          scope="Read inbox · Send as you"
          health={gmailHealth}
          connectPath="/api/integrations/gmail/connect"
          testIdPrefix="gmail"
        />
      </div>
    </section>
  );
}

interface ConnectionRowProps {
  provider: "shopify" | "gmail";
  name: string;
  scope: string;
  health: IntegrationHealth;
  connectPath: string;
  testIdPrefix: string;
}

function ConnectionRow({
  provider,
  name,
  scope,
  health,
  connectPath,
  testIdPrefix,
}: ConnectionRowProps) {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConnected = health.status === "healthy" || health.status === "stale";
  const needsReconnect = health.status === "needs_reconnect";

  function handleReconnect() {
    window.location.href = connectPath;
  }

  function handleDisconnect() {
    startTransition(async () => {
      setError(null);
      const result = await disconnectIntegration(provider);
      if (result && "error" in result) {
        setError(result.error);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
    });
  }

  function formatLastSync(date: Date | null): string {
    if (!date) return "never synced";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffMin < 1) return "synced just now";
    if (diffMin < 60) return `synced ${diffMin} min ago`;
    if (diffHr < 24) return `synced ${diffHr}h ago`;
    return `synced ${diffDay}d ago`;
  }

  return (
    <>
      <div
        className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-[18px] py-[18px]"
        data-testid={`connection-row-${testIdPrefix}`}
      >
        <div className="flex items-center gap-3.5">
          {/* Icon */}
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-subtle)] text-[var(--text)]"
            aria-hidden="true"
          >
            {provider === "shopify" ? <ShopifyIcon /> : <GmailIcon />}
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium text-[var(--text)]">{name}</span>
              {/* Health status badge */}
              <StatusBadge
                status={health.status}
                data-testid={`${testIdPrefix}-status-badge`}
              />
            </div>
            <span className="text-[12px] text-[var(--text-tertiary)]">{scope}</span>
          </div>

          {/* Last sync */}
          <span
            className="font-mono text-[12px] text-[var(--text-tertiary)]"
            aria-label={`Last synced: ${health.last_synced_at ? health.last_synced_at.toLocaleString() : "never"}`}
          >
            {formatLastSync(health.last_synced_at)}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {(isConnected || needsReconnect) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReconnect}
                aria-label={`Reconnect ${name}`}
                data-testid={`reconnect-${testIdPrefix}`}
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                {needsReconnect ? "Reconnect" : "Re-auth"}
              </Button>
            )}

            {isConnected && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                aria-label={`Disconnect ${name}`}
                data-testid={`disconnect-${testIdPrefix}`}
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Disconnect
              </Button>
            )}

            {!isConnected && !needsReconnect && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReconnect}
                aria-label={`Connect ${name}`}
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Connect
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p
            className="mt-3 text-[12.5px] text-[var(--danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      {/* Disconnect confirm dialog — T-2-08-05 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {name}?</DialogTitle>
            <DialogDescription>
              This will remove the {name} connection and delete all synced data
              ({provider === "shopify" ? "products, orders, pages" : "email threads and messages"}).
              This action cannot be undone. You can reconnect at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDisconnect}
              disabled={isPending}
              aria-busy={isPending}
              data-testid={`confirm-disconnect-${testIdPrefix}`}
            >
              {isPending ? "Disconnecting…" : `Yes, disconnect ${name}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: IntegrationHealth["status"];
}

function StatusBadge({ status, ...props }: StatusBadgeProps) {
  if (status === "healthy") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11.5px] text-[var(--success)]"
        role="status"
        aria-label="Connected and healthy"
        {...props}
      >
        <Check className="h-3 w-3" aria-hidden="true" />
        connected
      </span>
    );
  }

  if (status === "stale") {
    return (
      <Badge variant="warning" size="sm" role="status" aria-label="Connection is stale — data may be outdated" {...props}>
        <Clock className="h-2.5 w-2.5" aria-hidden="true" />
        stale
      </Badge>
    );
  }

  // needs_reconnect
  return (
    <Badge variant="danger" size="sm" role="status" aria-label="Connection requires reconnect" {...props}>
      <AlertCircle className="h-2.5 w-2.5" aria-hidden="true" />
      disconnected
    </Badge>
  );
}

// ─── Simple provider icons ────────────────────────────────────────────────────

function ShopifyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M15.337 21.76l5.31-1.149S18.433 7.5 18.42 7.404c-.015-.094-.097-.158-.19-.158-.093 0-1.72-.034-1.72-.034s-1.143-1.107-1.266-1.231V21.76z"
        fill="currentColor" fillOpacity="0.7"
      />
      <path
        d="M11.13 5.25s-.372-.102-.975-.102c-.975 0-1.44.602-1.61 1.004-.178.43-.24.858-.24 1.288v.252H7.17l-.428 2.82h1.135L7.1 17.5h2.895l.78-7h.876l.426-2.82h-1.302V9.44c0-.63.133-.938.86-.938h.655L11.13 5.25z"
        fill="currentColor"
      />
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7l10 7 10-7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
