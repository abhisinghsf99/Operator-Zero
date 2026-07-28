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
 * Mobile drill-down (D-11, UX-01):
 *   - On mobile (<md), shows log OR detail (not both columns).
 *   - When selectedEntry is set on mobile, log is hidden; detail fills full width.
 *   - Back button (aria-label="Back to activity") clears selectedEntry, returns focus.
 *   - All actions (select-mode, bulk-revert, filters, detail revert) work at 390px.
 *   - Resize divider + aside are desktop-only (hidden md:flex wrapper).
 *
 * WCAG 2.1 AA:
 *   - SurfaceHeader with kicker, title, subtitle
 *   - Region landmarks for log + detail panel
 *   - focus-visible ring on Back button
 *   - Focus restoration on Back (lastActivatedRowRef pattern)
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
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
  // Mobile: default to null (shows log first). Desktop: default to first entry.
  // The desktop default is restored via useEffect after hydration to avoid
  // SSR/hydration mismatch (same pattern as panel-width restore below).
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntryRow | null>(null);

  // GID → title map; grows as more pages load (merged via onMergeGidTitles)
  const [gidTitles, setGidTitles] =
    useState<Record<string, string>>(initialGidTitles);
  const handleMergeGidTitles = useCallback(
    (more: Record<string, string>) => {
      setGidTitles((prev) => ({ ...prev, ...more }));
    },
    []
  );

  // Ref to the last activated log row — for returning focus on Back (D-11)
  const lastActivatedRowRef = useRef<HTMLElement | null>(null);

  // ─── Resizable detail panel (drag the divider to widen/narrow) ───────────────
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const dragStateRef = useRef<{ startX: number; startW: number } | null>(null);

  // Restore persisted width + set desktop-default entry on mount (client-only)
  useEffect(() => {
    // Restore panel width
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

    // Desktop-only default selection: only set when still null AND on md+ viewport
    setSelectedEntry((current) => {
      if (current !== null) return current; // don't clobber a user selection
      if (window.matchMedia("(min-width: 768px)").matches) {
        return initialEntries[0] ?? null;
      }
      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Activate a log row: capture the activating element for focus restoration (D-11)
  const handleSelectEntry = useCallback((entry: ActivityEntryRow) => {
    // Capture current focused element as the activating row
    lastActivatedRowRef.current = document.activeElement as HTMLElement | null;
    setSelectedEntry(entry);
  }, []);

  // Mobile Back: clear selectedEntry, return focus to last activated row (D-11)
  const handleMobileBack = useCallback(() => {
    setSelectedEntry(null);
    requestAnimationFrame(() => {
      lastActivatedRowRef.current?.focus();
    });
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

      {/* Error banner — responsive horizontal padding */}
      {fetchError && (
        <div
          role="alert"
          aria-live="assertive"
          className="px-4 md:px-10"
          style={{
            paddingTop: 12,
            paddingBottom: 12,
            background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
            borderBottom: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
            fontSize: 13,
            color: "var(--text)",
          }}
        >
          Failed to load activity: {fetchError}
        </div>
      )}

      {/* Log + detail split (mobile drill-down + desktop resizable split) */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/*
          Activity log — main region:
            Desktop (md+): flex-1, always visible alongside detail.
            Mobile (<md):  Full width, hidden when detail is open.
        */}
        <main
          aria-label="Activity log"
          className={cn(
            "flex flex-col overflow-hidden min-w-0",
            selectedEntry ? "hidden md:flex md:flex-1" : "flex flex-1 w-full"
          )}
        >
          <ActivityLog
            initialEntries={initialEntries}
            initialCursor={initialCursor}
            filters={initialFilters}
            gidTitles={gidTitles}
            onMergeGidTitles={handleMergeGidTitles}
            selectedEntryId={selectedEntry?.id ?? null}
            onSelectEntry={handleSelectEntry}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        </main>

        {/*
          Desktop-only: resize divider + fixed-width aside.
          Both are hidden below md so drag handlers cannot fire on mobile.
          They are direct children of the outer flex row (not wrapped) so they
          participate in the flex layout at md+.
        */}
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
              className="hidden md:flex"
              style={{
                flexShrink: 0,
                width: 7,
                marginLeft: -3,
                marginRight: -3,
                cursor: "col-resize",
                position: "relative",
                zIndex: 2,
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
              className="hidden md:flex"
              style={{
                width: panelWidth,
                flexShrink: 0,
                overflowY: "auto",
                background: "var(--bg-subtle)",
                flexDirection: "column",
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

        {/*
          Mobile-only: full-width detail view.
          Rendered only when selectedEntry is set; hidden at md+ (desktop uses the aside above).
        */}
        {selectedEntry && (
          <div className="flex flex-col flex-1 w-full md:hidden">
            {/* Mobile Back affordance (D-11) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                borderBottom: "0.5px solid var(--border)",
                background: "var(--bg)",
                padding: "10px 16px",
                flexShrink: 0,
              }}
            >
              <button
                onClick={handleMobileBack}
                aria-label="Back to activity"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  padding: "6px 8px",
                  borderRadius: "var(--r-sm)",
                }}
                className="hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-activity-ink)] focus-visible:ring-offset-1"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Back
              </button>
            </div>

            {/* Full-width detail — scrolls within the padded main content area */}
            <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-subtle)" }}>
              <ActivityDetail
                entry={selectedEntry}
                gidTitles={gidTitles}
                onClose={() => setSelectedEntry(null)}
              />
            </div>
          </div>
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
