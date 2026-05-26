"use client";

/**
 * app/app/settings/_sessions.tsx
 * Active Sessions settings section — AUTH-04 / AUTH-05 / D-10.
 *
 * Renders:
 *   - Session list: device_label, ip_geo_label (always "(approximate)"), last_seen_at
 *     relative timestamp, and a per-session Revoke button (revokeSession).
 *   - "Sign out everywhere" button behind a confirm Dialog (signOutEverywhere, AUTH-05).
 *
 * JWT honesty note (T-4-04-04 — accepted): Supabase refresh-token revocation takes
 * effect immediately, but the JWT access token may remain valid for up to ~15 min.
 * This is surfaced honestly in the UI — we do NOT claim instant revocation.
 *
 * WCAG 2.1 AA:
 *   - All interactive elements have aria-label
 *   - Confirm dialog is focus-trapped (Radix Dialog)
 *   - Error states use role=alert
 *   - Pending state uses aria-busy
 *   - focus-visible ring on all buttons
 */

import { useState, useTransition } from "react";
import { Badge, Button, Card } from "@/components/design/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button as ShadcnButton } from "@/components/ui/button";
import { revokeSession, signOutEverywhere } from "@/app/app/settings/actions";
import { signOut } from "@/app/app/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  device_label: string;
  ip_geo_label: string | null;
  last_seen_at: Date;
  created_at: Date;
}

interface SessionsSectionProps {
  sessions: SessionRow[];
}

// ── Relative time helper ──────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "active now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  return `${diffDay}d ago`;
}

// ── SessionItem component ─────────────────────────────────────────────────────

function SessionItem({
  session,
  isLast,
  onRevoked,
}: {
  session: SessionRow;
  isLast: boolean;
  onRevoked: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isCurrentSession = !!(new Date().getTime() - new Date(session.last_seen_at).getTime() < 60_000);

  function handleRevoke() {
    startTransition(async () => {
      setError(null);
      const result = await revokeSession(session.id);
      if (result && "error" in result) {
        setError(result.error);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      onRevoked(session.id);
    });
  }

  return (
    <>
      <div
        style={{
          padding: "14px 18px",
          borderBottom: !isLast ? "0.5px solid var(--border-hairline)" : "none",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
        data-testid="session-row"
      >
        {/* Session info */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 13.5,
              color: "var(--text)",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {session.device_label}
            {isCurrentSession && (
              <Badge size="sm" accent="chat" soft>this device</Badge>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
            {session.ip_geo_label ?? "Unknown location (approximate)"}
            {" · "}
            {relativeTime(new Date(session.last_seen_at))}
          </div>
          {error && (
            <p style={{ marginTop: 4, fontSize: 12, color: "var(--danger)" }} role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Revoke button — only for non-current sessions */}
        {!isCurrentSession && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Revoke session: ${session.device_label}`}
            aria-busy={isPending}
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
            data-testid="revoke-session-btn"
          >
            {isPending ? "Revoking…" : "Revoke"}
          </Button>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke session?</DialogTitle>
            <DialogDescription>
              {session.device_label} ({session.ip_geo_label ?? "unknown location"}) will be
              signed out. Note: the access token may remain valid for up to{" "}
              <strong>~15 minutes</strong> due to Supabase&rsquo;s JWT window — we do not claim
              instant revocation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <ShadcnButton variant="secondary" size="sm">
                Cancel
              </ShadcnButton>
            </DialogClose>
            <ShadcnButton
              variant="danger"
              size="sm"
              onClick={handleRevoke}
              disabled={isPending}
              aria-busy={isPending}
            >
              {isPending ? "Revoking…" : "Revoke session"}
            </ShadcnButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── SessionsSection ───────────────────────────────────────────────────────────

/**
 * SessionsSection — renders the full Active Sessions settings section.
 *
 * @param sessions - server-loaded non-revoked session rows (ordered by last_seen_at desc)
 */
export function SessionsSection({ sessions: initialSessions }: SessionsSectionProps) {
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [isSigningOut, startSignOutTransition] = useTransition();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  function handleRevoked(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  function handleSignOutEverywhere() {
    startSignOutTransition(async () => {
      setSignOutError(null);
      const result = await signOutEverywhere();
      if (result && "error" in result) {
        setSignOutError(result.error);
        setSignOutOpen(false);
        return;
      }
      // All sessions revoked — clear the list
      setSessions([]);
      setSignOutOpen(false);
      // Note: user is now signed out globally. Next page navigation will redirect to /login.
    });
  }

  return (
    <section aria-labelledby="sessions-heading">
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <h2
          id="sessions-heading"
          className="display"
          style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
        >
          Active sessions
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 580 }}>
          Devices currently signed in. Revoke any you don&rsquo;t recognize.
        </p>
      </div>

      {/* JWT honesty note (T-4-04-04) */}
      <p style={{ marginBottom: 16, fontSize: 12.5, color: "var(--text-tertiary)" }}>
        Revocation takes effect immediately for new requests, but existing access tokens may
        remain valid for up to <strong>~15 minutes</strong>.
      </p>

      {/* Session list */}
      {sessions.length === 0 ? (
        <Card padding={18}>
          <p style={{ fontSize: 13.5, color: "var(--text-tertiary)" }}>No active sessions.</p>
        </Card>
      ) : (
        <Card padding={0}>
          {sessions.map((session, idx) => (
            <SessionItem
              key={session.id}
              session={session}
              isLast={idx === sessions.length - 1}
              onRevoked={handleRevoked}
            />
          ))}
        </Card>
      )}

      {/* Sign out (this device) */}
      <div style={{ marginTop: 14 }}>
        <form action={signOut} style={{ marginBottom: 10 }}>
          <Button
            variant="secondary"
            size="md"
            icon="LogOut"
            type="submit"
            aria-label="Sign out of this device"
          >
            Sign out
          </Button>
        </form>

        {/* Sign out everywhere */}
        <Button
          variant="danger"
          size="md"
          aria-label="Sign out of all devices"
          aria-busy={isSigningOut}
          disabled={isSigningOut}
          onClick={() => setSignOutOpen(true)}
          data-testid="sign-out-everywhere-btn"
        >
          {isSigningOut ? "Signing out…" : "Sign out everywhere"}
        </Button>
      </div>

      {signOutError && (
        <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }} role="alert">
          {signOutError}
        </p>
      )}

      {/* Sign out everywhere confirm dialog */}
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out everywhere?</DialogTitle>
            <DialogDescription>
              This will revoke all sessions across all your devices. You will be signed out of
              this device immediately. Other devices may take up to{" "}
              <strong>~15 minutes</strong> to fully expire due to Supabase&rsquo;s JWT window.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <ShadcnButton variant="secondary" size="sm">
                Cancel
              </ShadcnButton>
            </DialogClose>
            <ShadcnButton
              variant="danger"
              size="sm"
              onClick={handleSignOutEverywhere}
              disabled={isSigningOut}
              aria-busy={isSigningOut}
              data-testid="confirm-sign-out-everywhere"
            >
              {isSigningOut ? "Signing out…" : "Sign out everywhere"}
            </ShadcnButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
