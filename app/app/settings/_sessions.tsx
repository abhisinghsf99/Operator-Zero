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
import { LogOut, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { revokeSession, signOutEverywhere } from "@/app/app/settings/actions";

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

// ── SessionRow component ──────────────────────────────────────────────────────

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
        className={[
          "flex items-center gap-[16px] px-[18px] py-[14px]",
          isLast ? "" : "border-b-[0.5px] border-[var(--border-hairline,var(--border))]",
        ].join(" ")}
        data-testid="session-row"
      >
        {/* Device icon */}
        <Monitor
          className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
          aria-hidden="true"
        />

        {/* Session info */}
        <div className="flex-1">
          <div className="text-[13.5px] font-medium text-[var(--text)]">
            {session.device_label}
          </div>
          <div className="mt-[2px] text-[12px] text-[var(--text-tertiary)]">
            {session.ip_geo_label ?? "Unknown location (approximate)"}
            {" · "}
            {relativeTime(new Date(session.last_seen_at))}
          </div>
          {error && (
            <p className="mt-1 text-[12px] text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Revoke button */}
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Revoke session: ${session.device_label}`}
          aria-busy={isPending}
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          data-testid="revoke-session-btn"
        >
          {isPending ? "Revoking…" : "Revoke"}
        </Button>
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
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRevoke}
              disabled={isPending}
              aria-busy={isPending}
            >
              {isPending ? "Revoking…" : "Revoke session"}
            </Button>
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
    <section aria-labelledby="sessions-heading" className="mt-8">
      {/* Section header */}
      <div className="mb-5">
        <h2
          id="sessions-heading"
          className="display text-[28px] tracking-[-0.015em] text-[var(--text)]"
        >
          Active sessions
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
          Devices currently signed in. Revoke any you don&rsquo;t recognize.
        </p>
      </div>

      {/* JWT honesty note (T-4-04-04) */}
      <p className="mb-4 text-[12.5px] text-[var(--text-tertiary)]">
        Revocation takes effect immediately for new requests, but existing access tokens may
        remain valid for up to <strong>~15 minutes</strong>.
      </p>

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-[18px] py-[18px]">
          <p className="text-[13.5px] text-[var(--text-tertiary)]">No active sessions.</p>
        </div>
      ) : (
        <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]">
          {sessions.map((session, idx) => (
            <SessionItem
              key={session.id}
              session={session}
              isLast={idx === sessions.length - 1}
              onRevoked={handleRevoked}
            />
          ))}
        </div>
      )}

      {/* Sign out everywhere */}
      <div className="mt-[14px]">
        <Button
          variant="danger"
          size="sm"
          aria-label="Sign out of all devices"
          aria-busy={isSigningOut}
          disabled={isSigningOut}
          onClick={() => setSignOutOpen(true)}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-1"
          data-testid="sign-out-everywhere-btn"
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {isSigningOut ? "Signing out…" : "Sign out everywhere"}
        </Button>
      </div>

      {signOutError && (
        <p className="mt-2 text-[12.5px] text-[var(--danger)]" role="alert">
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
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              size="sm"
              onClick={handleSignOutEverywhere}
              disabled={isSigningOut}
              aria-busy={isSigningOut}
              data-testid="confirm-sign-out-everywhere"
            >
              {isSigningOut ? "Signing out…" : "Sign out everywhere"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
