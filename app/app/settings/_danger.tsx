"use client";

/**
 * app/app/settings/_danger.tsx
 * Danger Zone settings section — SET-06 (Export) + SET-07 (Delete Account).
 *
 * Renders two sensitive actions:
 *   1. Export my data — initiates a background export job; surfaces a download
 *      link when the job is complete (status=ready in user_exports).
 *   2. Delete account — 2-step confirm dialog (must type "delete"); gated on
 *      active workflow runs; shows grace-period state + cancel button when pending.
 *
 * State management:
 *   - Export: initiated via exportAccountData() Server Action; UI shows "Preparing…"
 *     then the signed URL from the latestExport prop when status=ready.
 *   - Deletion: requestAccountDeletion() gated on no active runs; cancelDeletion()
 *     for in-app cancel; deletionRequestedAt prop drives the pending state UI.
 *
 * SECURITY:
 *   T-4-05-01: userId from claims.sub (server actions enforce this)
 *   T-4-05-02: download link is a signed URL — never a public object URL
 *   T-4-05-03: active-run gate surfaced as role="alert" error
 *   T-4-05-05: cancelOn CEL in purge job enforced server-side
 *
 * WCAG 2.1 AA:
 *   - All buttons have aria-label or descriptive text
 *   - Error/status messages use role="alert"
 *   - Confirm dialog is focus-trapped (Radix Dialog)
 *   - Pending state uses aria-busy + disabled
 *   - focus-visible ring on all interactive elements
 */

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
import { Input } from "@/components/ui/input";
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
import {
  exportAccountData,
  requestAccountDeletion,
  cancelDeletion,
} from "@/app/app/settings/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LatestExport {
  id: string;
  status: string;
  signed_url: string | null;
  object_path: string | null;
  error: string | null;
  created_at: Date;
  completed_at: Date | null;
}

interface DangerSectionProps {
  /** Most recent user_exports row (null if no export has been initiated) */
  latestExport: LatestExport | null;
  /** Set when the user has a pending deletion request (7-day grace window) */
  deletionRequestedAt: Date | null;
}

// ── DangerSection ─────────────────────────────────────────────────────────────

export function DangerSection({
  latestExport: initialLatestExport,
  deletionRequestedAt: initialDeletionRequestedAt,
}: DangerSectionProps) {
  // ── Export state ────────────────────────────────────────────────────────────
  const [latestExport, setLatestExport] = useState(initialLatestExport);
  const [exportStatus, setExportStatus] = useState<"idle" | "initiated" | "error">(
    initialLatestExport?.status === "ready" ? "idle" : "idle"
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportPending, startExportTransition] = useTransition();

  // ── Deletion state ──────────────────────────────────────────────────────────
  const [deletionRequestedAt, setDeletionRequestedAt] = useState(initialDeletionRequestedAt);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isCancelPending, startCancelTransition] = useTransition();

  // ── Export handler ──────────────────────────────────────────────────────────
  function handleExport() {
    startExportTransition(async () => {
      setExportError(null);
      const result = await exportAccountData();
      if (result && "error" in result) {
        setExportError(result.error);
        return;
      }
      setExportStatus("initiated");
      setLatestExport({
        id: "pending",
        status: "pending",
        signed_url: null,
        object_path: null,
        error: null,
        created_at: new Date(),
        completed_at: null,
      });
    });
  }

  // ── Delete handler ──────────────────────────────────────────────────────────
  function handleDeleteConfirm() {
    if (confirmInput !== "delete") return;
    startDeleteTransition(async () => {
      setDeleteError(null);
      const result = await requestAccountDeletion();
      if (result && "error" in result) {
        setDeleteError(result.error);
        return;
      }
      setDeleteConfirmOpen(false);
      setDeletionRequestedAt(new Date());
      setConfirmInput("");
    });
  }

  // ── Cancel deletion handler ─────────────────────────────────────────────────
  function handleCancelDeletion() {
    startCancelTransition(async () => {
      setDeleteError(null);
      const result = await cancelDeletion();
      if (result && "error" in result) {
        setDeleteError(result.error);
        return;
      }
      setDeletionRequestedAt(null);
    });
  }

  // ── Compute grace-period end date for display ───────────────────────────────
  const graceEndDate = deletionRequestedAt
    ? new Date(deletionRequestedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;

  // ── Determine export display state ─────────────────────────────────────────
  const isExportReady = latestExport?.status === "ready" && latestExport.signed_url;
  const isExportPreparing = latestExport?.status === "pending" || exportStatus === "initiated";
  const isExportFailed = latestExport?.status === "failed";

  return (
    <section aria-labelledby="danger-zone-heading">
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <h2
          id="danger-zone-heading"
          className="display"
          style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
        >
          Export &amp; delete
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 580 }}>
          Your data is yours. Take it with you, or remove it entirely.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* ── Export data ───────────────────────────────────────────────────── */}
        <Card padding={20} style={{}} data-testid="danger-export-row">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                Export account data
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                JSON download. Workflows, activity, memory, brand voice. Everything.
                The link expires after 24 hours.
              </div>

              {/* Export status messages */}
              {isExportPreparing && (
                <p
                  style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-secondary)" }}
                  role="status"
                  aria-live="polite"
                >
                  Preparing your export… this may take a few minutes.
                </p>
              )}

              {isExportReady && latestExport?.signed_url && (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={latestExport.signed_url}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--acc-workflow-ink)",
                      textDecoration: "underline",
                      textDecorationColor: "transparent",
                      textUnderlineOffset: 2,
                    }}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Download your data export (link expires in 24 hours)"
                    data-testid="export-download-link"
                    onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecorationColor = "currentColor")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecorationColor = "transparent")}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
                  >
                    <Icons.ArrowDownRight size={12} aria-hidden={true} />
                    Download export
                  </a>
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    (link expires in 24 hours)
                  </span>
                </div>
              )}

              {isExportFailed && (
                <p
                  style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}
                  role="alert"
                >
                  Export failed:{" "}
                  {latestExport?.error ?? "Unknown error. Please try again."}
                </p>
              )}

              {exportError && (
                <p
                  style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}
                  role="alert"
                >
                  {exportError}
                </p>
              )}
            </div>

            <Button
              variant="secondary"
              icon="ArrowDownRight"
              size="sm"
              onClick={handleExport}
              disabled={isExportPending || isExportPreparing}
              aria-busy={isExportPending}
              aria-label="Request a data export"
              data-testid="export-data-button"
              style={{ flexShrink: 0 }}
            >
              {isExportPending ? "Requesting…" : "Export"}
            </Button>
          </div>
        </Card>

        {/* ── Delete account ─────────────────────────────────────────────────── */}
        <Card
          padding={20}
          style={{ borderColor: "color-mix(in oklch, var(--danger) 30%, transparent)" }}
          data-testid="danger-delete-row"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                Delete account
              </div>

              {!deletionRequestedAt ? (
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                  7-day grace period. After that, everything is permanently removed.
                </div>
              ) : (
                /* Grace-period state */
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]"
                      aria-hidden="true"
                    />
                    <p
                      style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-secondary)", margin: 0 }}
                      role="status"
                    >
                      Your account is scheduled for deletion on{" "}
                      <strong>
                        {graceEndDate?.toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </strong>
                      . Sign back in or click &ldquo;Cancel deletion&rdquo; below to keep your account.
                    </p>
                  </div>
                </div>
              )}

              {deleteError && (
                <p
                  style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}
                  role="alert"
                  data-testid="delete-error"
                >
                  {deleteError}
                </p>
              )}
            </div>

            {!deletionRequestedAt ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmInput("");
                  setDeleteConfirmOpen(true);
                }}
                disabled={isDeletePending}
                aria-label="Request account deletion"
                data-testid="delete-account-button"
                style={{ flexShrink: 0 }}
              >
                Delete account
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon="X"
                size="sm"
                onClick={handleCancelDeletion}
                disabled={isCancelPending}
                aria-busy={isCancelPending}
                aria-label="Cancel the pending account deletion"
                data-testid="cancel-deletion-button"
                style={{ flexShrink: 0 }}
              >
                {isCancelPending ? "Cancelling…" : "Cancel deletion"}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* ── Delete confirm dialog ──────────────────────────────────────────── */}
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmInput("");
            setDeleteError(null);
          }
          setDeleteConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will immediately lock your account and schedule a permanent
              hard-delete in 7 days. All workflows, runs, activity, memory, and
              connected integrations will be erased. You can cancel by signing
              back in within the 7-day window.
            </DialogDescription>
          </DialogHeader>

          <div style={{ marginTop: 16 }}>
            <label
              htmlFor="delete-confirm-input"
              style={{ display: "block", marginBottom: 8, fontSize: 12.5, color: "var(--text-secondary)" }}
            >
              Type{" "}
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--danger)" }}>
                delete
              </span>{" "}
              to confirm.
            </label>
            <Input
              id="delete-confirm-input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="delete"
              aria-label="Type delete to confirm account deletion"
              data-testid="delete-confirm-input"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmInput === "delete") {
                  handleDeleteConfirm();
                }
              }}
            />
          </div>

          {deleteError && (
            <p
              style={{ marginTop: 12, fontSize: 12.5, color: "var(--danger)" }}
              role="alert"
              data-testid="delete-dialog-error"
            >
              {deleteError}
            </p>
          )}

          <DialogFooter style={{ marginTop: 16 }}>
            <DialogClose asChild>
              <ShadcnButton variant="secondary" size="sm">
                Cancel
              </ShadcnButton>
            </DialogClose>
            <ShadcnButton
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={confirmInput !== "delete" || isDeletePending}
              aria-busy={isDeletePending}
              aria-label="Confirm account deletion"
              data-testid="confirm-delete-button"
            >
              {isDeletePending ? "Deleting…" : "Yes, delete my account"}
            </ShadcnButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
