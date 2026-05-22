"use client";

/**
 * components/activity/bulk-revert-modal.tsx
 * Atomic bulk-revert confirmation modal (D-08 / ACT-05).
 *
 * Calls bulkRevertActivity(selectedIds, dryRun:true) on open to classify
 * revertable vs blocked entries. On confirm, calls dryRun:false (atomic).
 * If all selected items are blocked, only Cancel is offered (D-08).
 *
 * SECURITY:
 *   - Imports bulkRevertActivity from lib/actions/activity (NOT the route-local
 *     app/app/activity/actions.ts which is cursor pagination only)
 *   - All Server Action ownership checks enforced server-side
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Dialog focus-trapped (Radix Dialog)
 *   - Destructive confirm button: aria-label
 *   - Loading state: aria-busy
 *   - Result split: aria-live
 */

import { useEffect, useState, useTransition } from "react";
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
  bulkRevertActivity,
  type BulkRevertActivityResult,
} from "@/lib/actions/activity";
import { AlertTriangle, Check, X } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BulkRevertModalProps {
  open: boolean;
  selectedIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

interface ClassificationState {
  /** IDs that CAN be reverted (from the dry-run) — drives the confirm count. */
  revertable: string[];
  blocked: Array<{ id: string; reason: string }>;
}

// ─── BulkRevertModal ──────────────────────────────────────────────────────────

export function BulkRevertModal({
  open,
  selectedIds,
  onClose,
  onSuccess,
}: BulkRevertModalProps) {
  const [classification, setClassification] =
    useState<ClassificationState | null>(null);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isExecuted, setIsExecuted] = useState(false);
  const [, startTransition] = useTransition();

  // Classify entries on open (dryRun=true)
  useEffect(() => {
    if (!open || selectedIds.length === 0) return;

    setClassification(null);
    setClassifyError(null);
    setExecuteError(null);
    setIsExecuted(false);
    setIsClassifying(true);

    void (async () => {
      const result: BulkRevertActivityResult = await bulkRevertActivity(
        selectedIds,
        true // dryRun — classify without writing
      );

      setIsClassifying(false);

      if ("error" in result) {
        setClassifyError(result.error);
        return;
      }

      setClassification({
        // CR-02: count revertable entries (dry run never reverts anything)
        revertable: result.revertable,
        blocked: result.blocked,
      });
    })();
  }, [open, selectedIds]);

  // Execute revert (dryRun=false)
  function handleConfirm() {
    if (!classification || classification.revertable.length === 0) return;

    startTransition(async () => {
      setExecuteError(null);
      const result: BulkRevertActivityResult = await bulkRevertActivity(
        selectedIds,
        false // execute atomic revert
      );

      if ("error" in result) {
        setExecuteError(result.error);
        return;
      }

      setIsExecuted(true);
      // Brief delay before closing so user sees success state
      setTimeout(() => {
        onSuccess();
      }, 800);
    });
  }

  const allBlocked =
    classification !== null &&
    classification.revertable.length === 0 &&
    classification.blocked.length > 0;

  const revertableCount = classification?.revertable?.length ?? 0;
  const blockedCount = classification?.blocked?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        style={{ maxWidth: 480 }}
        aria-describedby="bulk-revert-description"
      >
        <DialogHeader>
          <DialogTitle>
            {isExecuted
              ? "Revert complete"
              : allBlocked
              ? "No entries can be reverted"
              : "Confirm bulk revert"}
          </DialogTitle>
          <DialogDescription id="bulk-revert-description">
            {isClassifying
              ? "Checking which entries can be reverted..."
              : isExecuted
              ? `Successfully reverted ${revertableCount} action${revertableCount === 1 ? "" : "s"}.`
              : allBlocked
              ? "All selected entries are blocked from reverting. See reasons below."
              : `${revertableCount} of ${selectedIds.length} selected action${selectedIds.length === 1 ? "" : "s"} can be reverted.`}
          </DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {isClassifying && (
          <div
            aria-live="polite"
            aria-busy={true}
            style={{
              padding: "16px 0",
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-tertiary)",
            }}
          >
            Checking revertability...
          </div>
        )}

        {/* Classification error */}
        {classifyError && (
          <div
            role="alert"
            style={{
              padding: "12px 14px",
              background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
              border: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
              borderRadius: "var(--r-md)",
              fontSize: 13,
              color: "var(--text)",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <AlertTriangle
              size={14}
              style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }}
              aria-hidden="true"
            />
            {classifyError}
          </div>
        )}

        {/* Classification result */}
        {classification && !isExecuted && (
          <div
            aria-live="polite"
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {/* Revertable items */}
            {revertableCount > 0 && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "color-mix(in oklch, var(--success) 8%, var(--bg))",
                  border: "0.5px solid color-mix(in oklch, var(--success) 30%, transparent)",
                  borderRadius: "var(--r-md)",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <Check
                  size={14}
                  style={{ color: "var(--success)", flexShrink: 0 }}
                  aria-hidden="true"
                />
                <span style={{ fontSize: 13, color: "var(--text)" }}>
                  <strong style={{ fontWeight: 600 }}>
                    {revertableCount} action{revertableCount === 1 ? "" : "s"}
                  </strong>{" "}
                  will be reverted
                </span>
              </div>
            )}

            {/* Blocked items */}
            {blockedCount > 0 && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "var(--bg-subtle)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <X
                    size={14}
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                    {blockedCount} action{blockedCount === 1 ? "" : "s"} cannot be reverted
                  </span>
                </div>
                <ul
                  aria-label="Blocked revert reasons"
                  style={{
                    margin: 0,
                    padding: "0 0 0 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {/* Show unique reasons (not all IDs) */}
                  {[...new Set(classification.blocked.map((b) => b.reason))].map(
                    (reason) => (
                      <li
                        key={reason}
                        style={{
                          fontSize: 12.5,
                          color: "var(--text-tertiary)",
                          lineHeight: 1.5,
                        }}
                      >
                        {reason}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Success state */}
        {isExecuted && (
          <div
            aria-live="polite"
            style={{
              padding: "12px 14px",
              background: "color-mix(in oklch, var(--success) 8%, var(--bg))",
              border: "0.5px solid color-mix(in oklch, var(--success) 30%, transparent)",
              borderRadius: "var(--r-md)",
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
              color: "var(--text)",
            }}
          >
            <Check
              size={14}
              style={{ color: "var(--success)" }}
              aria-hidden="true"
            />
            Revert{revertableCount !== 1 ? "s" : ""} applied successfully.
          </div>
        )}

        {/* Execute error */}
        {executeError && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
              border: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
              borderRadius: "var(--r-md)",
              fontSize: 13,
              color: "var(--text)",
            }}
          >
            {executeError}
          </div>
        )}

        <DialogFooter>
          {/* Cancel / Close */}
          <DialogClose asChild>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 34,
                padding: "0 16px",
                borderRadius: "var(--r-sm)",
                background: "transparent",
                color: "var(--text-secondary)",
                border: "0.5px solid var(--border)",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {isExecuted ? "Close" : "Cancel"}
            </button>
          </DialogClose>

          {/* Confirm — only shown when there are revertable items and not yet executed */}
          {!allBlocked && !isExecuted && !isClassifying && classification && revertableCount > 0 && (
            <button
              type="button"
              onClick={handleConfirm}
              aria-label={`Confirm: revert ${revertableCount} action${revertableCount === 1 ? "" : "s"}`}
              style={{
                height: 34,
                padding: "0 16px",
                borderRadius: "var(--r-sm)",
                background: "var(--text)",
                color: "var(--bg)",
                border: "0.5px solid transparent",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Revert {revertableCount} action{revertableCount === 1 ? "" : "s"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
