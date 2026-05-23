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
import { Download, Trash2, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [exportStatus, setExportStatus] = useState<
    "idle" | "initiated" | "error"
  >(initialLatestExport?.status === "ready" ? "idle" : "idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportPending, startExportTransition] = useTransition();

  // ── Deletion state ──────────────────────────────────────────────────────────
  const [deletionRequestedAt, setDeletionRequestedAt] = useState(
    initialDeletionRequestedAt
  );
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
      // Initiated — the job is running in the background.
      // Update latestExport to show "Preparing…" state.
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
      // Account is now locked — show grace-period state
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
      // Deletion cancelled — restore normal state
      setDeletionRequestedAt(null);
    });
  }

  // ── Compute grace-period end date for display ───────────────────────────────
  const graceEndDate = deletionRequestedAt
    ? new Date(deletionRequestedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;

  // ── Determine export display state ─────────────────────────────────────────
  const isExportReady = latestExport?.status === "ready" && latestExport.signed_url;
  const isExportPreparing =
    latestExport?.status === "pending" || exportStatus === "initiated";
  const isExportFailed = latestExport?.status === "failed";

  return (
    <section aria-labelledby="danger-zone-heading" className="mt-8">
      <div className="mb-5">
        <h2
          id="danger-zone-heading"
          className="display text-[28px] tracking-[-0.015em] text-[var(--danger)]"
        >
          Danger zone
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
          Export your data or permanently delete your account. These actions
          cannot easily be undone.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {/* ── Export data ─────────────────────────────────────────────────── */}
        <div
          className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-[18px] py-[18px]"
          data-testid="danger-export-row"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Download
                  className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                  aria-hidden="true"
                />
                <span className="text-[14px] font-medium text-[var(--text)]">
                  Export my data
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-[var(--text-tertiary)]">
                Download a JSON bundle of your workflows, runs, activity log,
                memory, and brand voice. The link expires after 24 hours.
              </p>

              {/* Export status messages */}
              {isExportPreparing && (
                <p
                  className="mt-2 text-[12.5px] text-[var(--text-secondary)]"
                  role="status"
                  aria-live="polite"
                >
                  Preparing your export… this may take a few minutes.
                </p>
              )}

              {isExportReady && latestExport?.signed_url && (
                <div className="mt-2">
                  <a
                    href={latestExport.signed_url}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--acc-workflow)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Download your data export (link expires in 24 hours)"
                    data-testid="export-download-link"
                  >
                    <Download className="h-3 w-3" aria-hidden="true" />
                    Download export
                  </a>
                  <span className="ml-2 text-[11.5px] text-[var(--text-tertiary)]">
                    (link expires in 24 hours)
                  </span>
                </div>
              )}

              {isExportFailed && (
                <p
                  className="mt-2 text-[12.5px] text-[var(--danger)]"
                  role="alert"
                >
                  Export failed:{" "}
                  {latestExport?.error ?? "Unknown error. Please try again."}
                </p>
              )}

              {exportError && (
                <p
                  className="mt-2 text-[12.5px] text-[var(--danger)]"
                  role="alert"
                >
                  {exportError}
                </p>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={isExportPending || isExportPreparing}
              aria-busy={isExportPending}
              aria-label="Request a data export"
              data-testid="export-data-button"
              className="shrink-0"
            >
              {isExportPending ? "Requesting…" : "Export data"}
            </Button>
          </div>
        </div>

        {/* ── Delete account ───────────────────────────────────────────────── */}
        <div
          className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--danger)] bg-[var(--bg-elevated)] px-[18px] py-[18px]"
          data-testid="danger-delete-row"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Trash2
                  className="h-4 w-4 shrink-0 text-[var(--danger)]"
                  aria-hidden="true"
                />
                <span className="text-[14px] font-medium text-[var(--text)]">
                  Delete account
                </span>
              </div>

              {!deletionRequestedAt ? (
                <p className="mt-1 text-[12.5px] leading-[1.5] text-[var(--text-tertiary)]">
                  Permanently delete your account and all associated data.
                  Your account is locked immediately; data is hard-deleted after
                  a 7-day grace window. You can cancel by signing back in during
                  that time.
                </p>
              ) : (
                /* Grace-period state */
                <div className="mt-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]"
                      aria-hidden="true"
                    />
                    <p
                      className="text-[12.5px] leading-[1.5] text-[var(--text-secondary)]"
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
                      . Sign back in or click &ldquo;Cancel deletion&rdquo;
                      below to keep your account.
                    </p>
                  </div>
                </div>
              )}

              {deleteError && (
                <p
                  className="mt-2 text-[12.5px] text-[var(--danger)]"
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
                className="shrink-0"
              >
                Delete account
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCancelDeletion}
                disabled={isCancelPending}
                aria-busy={isCancelPending}
                aria-label="Cancel the pending account deletion"
                data-testid="cancel-deletion-button"
                className="shrink-0 flex items-center gap-1.5"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                {isCancelPending ? "Cancelling…" : "Cancel deletion"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Delete confirm dialog ─────────────────────────────────────────── */}
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

          <div className="mt-4">
            <label
              htmlFor="delete-confirm-input"
              className="mb-2 block text-[12.5px] text-[var(--text-secondary)]"
            >
              Type{" "}
              <span className="font-mono font-medium text-[var(--danger)]">
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
              className="mt-3 text-[12.5px] text-[var(--danger)]"
              role="alert"
              data-testid="delete-dialog-error"
            >
              {deleteError}
            </p>
          )}

          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={confirmInput !== "delete" || isDeletePending}
              aria-busy={isDeletePending}
              aria-label="Confirm account deletion"
              data-testid="confirm-delete-button"
            >
              {isDeletePending
                ? "Deleting…"
                : "Yes, delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
