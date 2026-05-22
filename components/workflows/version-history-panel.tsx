"use client";

/**
 * components/workflows/version-history-panel.tsx
 * Version History panel with forward-only Restore (D-04/WF-14).
 *
 * Features:
 *   - Lists last 10 workflow versions (number + date + what changed)
 *   - The row matching workflows.current_version_id is marked "Current" with
 *     Restore disabled (RESEARCH Pitfall 6: disable current version restore)
 *   - Restore on any other version calls restoreVersion(workflowId, versionId)
 *     → creates a NEW forward version (does not overwrite history — D-04)
 *   - isPending guard on Restore to prevent double-submit
 *   - Sonner toast on success/error
 *
 * SECURITY: T-3-03-01 — restoreVersion Server Action verifies BOTH workflow_id
 *   AND user_id on version lookup before createWorkflowVersion.
 *
 * ACCESSIBILITY: WCAG 2.1 AA — list has aria-label; Restore buttons have
 *   aria-labels; disabled state communicated via aria-disabled.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { restoreVersion } from "@/lib/actions/workflows";
import type { WorkflowVersionData } from "@/app/app/workflows/[id]/page";

// ─── Props ────────────────────────────────────────────────────────────────────

interface VersionHistoryPanelProps {
  workflowId: string;
  versions: WorkflowVersionData[];
  currentVersionId: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── VersionHistoryPanel ──────────────────────────────────────────────────────

export function VersionHistoryPanel({
  workflowId,
  versions,
  currentVersionId,
}: VersionHistoryPanelProps) {
  const [localVersions, setLocalVersions] = useState(versions);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleRestore(versionId: string, versionNumber: number) {
    if (restoringId) return; // guard concurrent restores
    setRestoringId(versionId);

    startTransition(async () => {
      const result = await restoreVersion(workflowId, versionId);
      if ("error" in result) {
        toast.error(`Could not restore version ${versionNumber}: ${result.error}`);
      } else {
        toast.success(
          `Restored to v${versionNumber} — a new version was created. Refresh to see the latest.`
        );
        // Note: the page will revalidate via revalidatePath in the Server Action.
        // The panel will show the updated version list after navigation.
      }
      setRestoringId(null);
    });
  }

  if (localVersions.length === 0) {
    return (
      <div style={{ marginTop: 24 }}>
        <h3
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            marginBottom: 10,
          }}
        >
          Version history
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--text-faint)", fontStyle: "italic" }}>
          No versions yet.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="version-history-heading" style={{ marginTop: 24 }}>
      <h3
        id="version-history-heading"
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          marginBottom: 10,
        }}
      >
        Version history
      </h3>

      <ul
        style={{ listStyle: "none", margin: 0, padding: 0 }}
        aria-label="Workflow version history"
      >
        {localVersions.map((version) => {
          const isCurrent = version.id === currentVersionId;
          const isRestoring = restoringId === version.id;

          return (
            <li
              key={version.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 0",
                borderBottom: "0.5px solid var(--border)",
                opacity: isCurrent ? 1 : 0.85,
              }}
            >
              {/* Version number */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  minWidth: 28,
                  flexShrink: 0,
                }}
                aria-label={`Version ${version.version_number}`}
              >
                v{version.version_number}
              </span>

              {/* Date */}
              <span
                style={{
                  fontSize: 11.5,
                  color: "var(--text-secondary)",
                  flex: 1,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <time dateTime={new Date(version.created_at).toISOString()}>
                  {formatDate(version.created_at)}
                </time>
              </span>

              {/* Current badge OR Restore button */}
              {isCurrent ? (
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--font-mono)",
                    color: "var(--acc-workflow-ink)",
                    background: "var(--acc-workflow-bg)",
                    padding: "2px 7px",
                    borderRadius: "var(--r-xs)",
                    border: "0.5px solid var(--acc-workflow-ink)",
                    flexShrink: 0,
                  }}
                  aria-label="This is the current version"
                >
                  Current
                </span>
              ) : (
                <button
                  onClick={() => handleRestore(version.id, version.version_number)}
                  disabled={!!restoringId || isCurrent}
                  aria-label={`Restore to version ${version.version_number} (creates a new forward version — does not overwrite history)`}
                  aria-disabled={!!restoringId || isCurrent}
                  style={{
                    all: "unset",
                    fontSize: 11.5,
                    color:
                      restoringId === version.id
                        ? "var(--text-faint)"
                        : "var(--text-secondary)",
                    cursor: restoringId ? "not-allowed" : "pointer",
                    padding: "2px 7px",
                    borderRadius: "var(--r-xs)",
                    border: "0.5px solid var(--border)",
                    opacity: restoringId ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    flexShrink: 0,
                  }}
                >
                  {isRestoring ? "Restoring…" : "Restore"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p
        style={{
          fontSize: 11,
          color: "var(--text-faint)",
          marginTop: 8,
          lineHeight: 1.4,
          fontStyle: "italic",
        }}
      >
        Restore creates a new version — history is never overwritten.
      </p>
    </section>
  );
}
