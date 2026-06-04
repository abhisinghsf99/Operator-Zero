"use client";

/**
 * app/app/activity/_activity-view.tsx
 * Activity log client shell — composes all activity surface components.
 *
 * Holds state for:
 *   - selectedEntry (detail panel)
 *   - selectMode toggle + selectedIds (bulk-revert)
 *   - bulkRevertModal open/close
 *
 * D-07: Select mode toggle in header reveals row checkboxes + bulk-action bar.
 * D-08: Bulk revert modal splits revertable / blocked (handled by BulkRevertModal).
 *
 * WCAG 2.1 AA:
 *   - SurfaceHeader with kicker, title, subtitle
 *   - Region landmarks for log + detail panel
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { SurfaceHeader, Button } from "@/components/design/primitives";
import { ActivityFiltersBar } from "@/components/activity/activity-filters";
import { ActivityLog } from "@/components/activity/activity-log";
import { ActivityDetail } from "@/components/activity/activity-detail";
import { BulkRevertModal } from "@/components/activity/bulk-revert-modal";
import type { ActivityEntryRow, ActivityFilters, ActivityCursor } from "./actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowOption {
  id: string;
  name: string;
}

interface ActivityViewProps {
  userId: string;
  initialEntries: ActivityEntryRow[];
  initialCursor: ActivityCursor | null;
  /** Shopify GID → product title map for page 1 (grows as more pages load). */
  initialGidTitles: Record<string, string>;
  initialFilters: ActivityFilters;
  workflowOptions: WorkflowOption[];
  fetchError: string | null;
}

// ─── Resizable detail panel constants ───────────────────────────────────────────

const PANEL_MIN = 360;
const PANEL_MAX = 920;
const PANEL_DEFAULT = 460;
const PANEL_STORAGE_KEY = "oz.activity.detailWidth";

// ─── ActivityView ─────────────────────────────────────────────────────────────

export function ActivityView({
  userId,
  initialEntries,
  initialCursor,
  initialGidTitles,
  initialFilters,
  workflowOptions,
  fetchError,
}: ActivityViewProps) {
  // Selected entry for detail panel
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntryRow | null>(
    initialEntries[0] ?? null
  );

  // GID → title map; grows as more pages load (merged via onMergeGidTitles)
  const [gidTitles, setGidTitles] =
    useState<Record<string, string>>(initialGidTitles);
  const handleMergeGidTitles = useCallback(
    (more: Record<string, string>) => {
      setGidTitles((prev) => ({ ...prev, ...more }));
    },
    []
  );

  // ─── Resizable detail panel (drag the divider to widen/narrow) ───────────────
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const dragStateRef = useRef<{ startX: number; startW: number } | null>(null);

  // Restore persisted width on mount (client-only — avoids hydration mismatch)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PANEL_STORAGE_KEY);
      if (saved) {
        const n = Number(saved);
        if (Number.isFinite(n)) {
          setPanelWidth(Math.min(Math.max(n, PANEL_MIN), PANEL_MAX));
        }
      }
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);

  const clampWidth = useCallback((w: number) => {
    const ceiling =
      typeof window !== "undefined"
        ? Math.min(PANEL_MAX, window.innerWidth - PANEL_MIN)
        : PANEL_MAX;
    return Math.min(Math.max(w, PANEL_MIN), Math.max(PANEL_MIN, ceiling));
  }, []);

  const persistWidth = useCallback((w: number) => {
    try {
      window.localStorage.setItem(PANEL_STORAGE_KEY, String(Math.round(w)));
    } catch {
      /* ignore */
    }
  }, []);

  const handleDividerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startW: panelWidth };
      const onMove = (ev: PointerEvent) => {
        const drag = dragStateRef.current;
        if (!drag) return;
        // Dragging left (toward the log) widens the panel.
        const next = clampWidth(drag.startW + (drag.startX - ev.clientX));
        setPanelWidth(next);
      };
      const onUp = () => {
        dragStateRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setPanelWidth((w) => {
          persistWidth(w);
          return w;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [panelWidth, clampWidth, persistWidth]
  );

  const handleDividerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const STEP = 24;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPanelWidth((w) => {
          const next = clampWidth(w + STEP);
          persistWidth(next);
          return next;
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPanelWidth((w) => {
          const next = clampWidth(w - STEP);
          persistWidth(next);
          return next;
        });
      }
    },
    [clampWidth, persistWidth]
  );

  // Select mode for bulk operations (D-07)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk revert modal state (D-08)
  const [bulkRevertOpen, setBulkRevertOpen] = useState(false);

  const handleToggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) {
        // Exiting select mode — clear selection
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkRevert = useCallback(() => {
    if (selectedIds.size > 0) {
      setBulkRevertOpen(true);
    }
  }, [selectedIds]);

  const handleBulkRevertSuccess = useCallback(() => {
    setBulkRevertOpen(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Surface header — matches surface-activity.jsx SurfaceHeader with accent="activity" */}
      <SurfaceHeader
        kicker={`Activity · ${initialEntries.length}+ events`}
        title="Everything the agent has done."
        subtitle="A record of every autonomous action, every approval, every result. Inspectable, attributable, revertable."
        accent="activity"
        right={
          <>
            <Button variant="ghost" icon="Calendar">All time</Button>
            <Button variant="secondary" icon="Filter">Filter</Button>
          </>
        }
      />

      {/* Filter bar */}
      <ActivityFiltersBar
        filters={initialFilters}
        workflowOptions={workflowOptions}
        selectMode={selectMode}
        onSelectModeToggle={handleToggleSelectMode}
        selectedCount={selectedIds.size}
        onBulkRevert={handleBulkRevert}
      />

      {/* Error banner */}
      {fetchError && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "12px 40px",
            background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
            borderBottom: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
            fontSize: 13,
            color: "var(--text)",
          }}
        >
          Failed to load activity: {fetchError}
        </div>
      )}

      {/* Log + detail split */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* Activity log (virtualized) */}
        <main
          aria-label="Activity log"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          <ActivityLog
            initialEntries={initialEntries}
            initialCursor={initialCursor}
            filters={initialFilters}
            gidTitles={gidTitles}
            onMergeGidTitles={handleMergeGidTitles}
            selectedEntryId={selectedEntry?.id ?? null}
            onSelectEntry={setSelectedEntry}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        </main>

        {/* Resize divider + detail panel */}
        {selectedEntry && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize detail panel"
              aria-valuenow={Math.round(panelWidth)}
              aria-valuemin={PANEL_MIN}
              aria-valuemax={PANEL_MAX}
              tabIndex={0}
              onPointerDown={handleDividerPointerDown}
              onKeyDown={handleDividerKeyDown}
              onDoubleClick={() => {
                setPanelWidth(PANEL_DEFAULT);
                persistWidth(PANEL_DEFAULT);
              }}
              style={{
                flexShrink: 0,
                width: 7,
                marginLeft: -3,
                marginRight: -3,
                cursor: "col-resize",
                position: "relative",
                zIndex: 2,
                display: "flex",
                justifyContent: "center",
                touchAction: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget.firstChild as HTMLElement).style.background =
                  "var(--acc-activity-ink)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget.firstChild as HTMLElement).style.background =
                  "var(--border)";
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 0.5,
                  height: "100%",
                  background: "var(--border)",
                  transition: "background 0.12s",
                }}
              />
            </div>
            <aside
              aria-label="Activity entry detail"
              style={{
                width: panelWidth,
                flexShrink: 0,
                overflowY: "auto",
                background: "var(--bg-subtle)",
              }}
            >
              <ActivityDetail
                entry={selectedEntry}
                gidTitles={gidTitles}
                onClose={() => setSelectedEntry(null)}
              />
            </aside>
          </>
        )}
      </div>

      {/* Bulk revert modal (D-08) */}
      <BulkRevertModal
        open={bulkRevertOpen}
        selectedIds={Array.from(selectedIds)}
        onClose={() => setBulkRevertOpen(false)}
        onSuccess={handleBulkRevertSuccess}
      />
    </div>
  );
}
