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
import { RefreshCw, ExternalLink } from "lucide-react";
import { Button as DesignButton } from "@/components/design/primitives";
import { StatusDot, Card, Badge } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { disconnectIntegration } from "@/app/app/settings/actions";
import type { IntegrationHealth } from "@/lib/integrations/health";

interface ConnectionsSectionProps {
  shopifyHealth: IntegrationHealth;
  gmailHealth: IntegrationHealth;
}

export function ConnectionsSection({ shopifyHealth, gmailHealth }: ConnectionsSectionProps) {
  return (
    <section aria-labelledby="connections-heading">
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <h2
          id="connections-heading"
          className="display"
          style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
        >
          Connections
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 580 }}>
          The systems the agent has access to. Connect what you want it to operate on.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
        {/* Meta — coming soon (v2) */}
        <Card padding={18} style={{ opacity: 0.7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", background: "var(--bg-subtle)", display: "grid", placeItems: "center", color: "var(--text)" }}>
              <Icons.Meta size={18} aria-hidden={true} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Meta · Instagram</span>
                <Badge size="sm" accent="experiment">v2</Badge>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>DMs · Comments · Posting</span>
            </div>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>—</span>
            <DesignButton variant="secondary" size="sm" disabled>Coming soon</DesignButton>
          </div>
        </Card>
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConnected = health.status === "healthy" || health.status === "stale";
  const needsReconnect = health.status === "needs_reconnect";

  const ProviderIcon = provider === "shopify" ? Icons.Shopify : Icons.Gmail;

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
      <Card padding={18} style={{}}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 14 }}
          data-testid={`connection-row-${testIdPrefix}`}
        >
          {/* Provider icon */}
          <div
            style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", background: "var(--bg-subtle)", display: "grid", placeItems: "center", color: "var(--text)", flexShrink: 0 }}
            aria-hidden="true"
          >
            <ProviderIcon size={18} />
          </div>

          {/* Info */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{name}</span>
              {/* Health status indicator */}
              {isConnected && (
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--success)" }}
                  role="status"
                  aria-label="Connected and healthy"
                  data-testid={`${testIdPrefix}-status-badge`}
                >
                  <StatusDot status={health.status === "stale" ? "partial" : "active"} size={6} />
                  {health.status === "stale" ? "stale" : "connected"}
                </span>
              )}
              {needsReconnect && (
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--danger)" }}
                  role="status"
                  aria-label="Connection requires reconnect"
                  data-testid={`${testIdPrefix}-status-badge`}
                >
                  <StatusDot status="error" size={6} />
                  disconnected
                </span>
              )}
              {!isConnected && !needsReconnect && (
                <span
                  style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}
                  role="status"
                  aria-label="Not connected"
                  data-testid={`${testIdPrefix}-status-badge`}
                >
                  not connected
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{scope}</span>
          </div>

          {/* Last sync — mono */}
          <span
            style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", flexShrink: 0 }}
            aria-label={`Last synced: ${health.last_synced_at ? health.last_synced_at.toLocaleString() : "never"}`}
          >
            {formatLastSync(health.last_synced_at)}
          </span>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isConnected && (
              <>
                <DesignButton
                  variant="ghost"
                  size="sm"
                  onClick={handleReconnect}
                  aria-label={`Re-authenticate ${name}`}
                  data-testid={`reconnect-${testIdPrefix}`}
                >
                  Manage
                </DesignButton>
                <DesignButton
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  aria-label={`Disconnect ${name}`}
                  data-testid={`disconnect-${testIdPrefix}`}
                >
                  Disconnect
                </DesignButton>
              </>
            )}
            {needsReconnect && (
              <DesignButton
                variant="secondary"
                size="sm"
                onClick={handleReconnect}
                aria-label={`Reconnect ${name}`}
                data-testid={`reconnect-${testIdPrefix}`}
              >
                Reconnect
              </DesignButton>
            )}
            {!isConnected && !needsReconnect && (
              <DesignButton
                variant="secondary"
                size="sm"
                onClick={handleReconnect}
                aria-label={`Connect ${name}`}
              >
                Connect
              </DesignButton>
            )}
          </div>
        </div>

        {error && (
          <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--danger)" }} role="alert">
            {error}
          </p>
        )}
      </Card>

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
