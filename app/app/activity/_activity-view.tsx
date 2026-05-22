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

import { useState, useCallback } from "react";
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
  initialFilters: ActivityFilters;
  workflowOptions: WorkflowOption[];
  fetchError: string | null;
}

// ─── SurfaceHeader ────────────────────────────────────────────────────────────

function SurfaceHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header
      style={{
        padding: "28px 40px 20px",
        borderBottom: "0.5px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11.5,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--acc-activity-ink)",
          opacity: 0.8,
        }}
      >
        {kicker}
      </p>
      <h1
        className="display"
        style={{
          margin: "4px 0 0",
          fontSize: 28,
          letterSpacing: "-0.015em",
          color: "var(--text)",
          lineHeight: 1.2,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 13.5,
          lineHeight: 1.5,
          color: "var(--text-tertiary)",
        }}
      >
        {subtitle}
      </p>
    </header>
  );
}

// ─── ActivityView ─────────────────────────────────────────────────────────────

export function ActivityView({
  userId,
  initialEntries,
  initialCursor,
  initialFilters,
  workflowOptions,
  fetchError,
}: ActivityViewProps) {
  // Selected entry for detail panel
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntryRow | null>(
    initialEntries[0] ?? null
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
      {/* Surface header */}
      <SurfaceHeader
        kicker={`Activity · ${initialEntries.length}+ events`}
        title="Everything the agent has done."
        subtitle="A record of every autonomous action, every approval, every result. Inspectable, attributable, revertable."
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
            selectedEntryId={selectedEntry?.id ?? null}
            onSelectEntry={setSelectedEntry}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        </main>

        {/* Detail panel */}
        {selectedEntry && (
          <aside
            aria-label="Activity entry detail"
            style={{
              width: 420,
              flexShrink: 0,
              borderLeft: "0.5px solid var(--border)",
              overflowY: "auto",
              background: "var(--bg-subtle)",
            }}
          >
            <ActivityDetail
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
            />
          </aside>
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
