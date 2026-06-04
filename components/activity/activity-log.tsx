"use client";

/**
 * components/activity/activity-log.tsx
 * Virtualized, day-grouped activity log with infinite scroll (ACT-07).
 *
 * Uses @tanstack/react-virtual over a flattened array of:
 *   { type: 'header', day: string } | { type: 'row', entry: ActivityEntryRow }
 *
 * estimateSize: 36px for day headers, 52px for entry rows.
 * overscan: 10 rows (renders 10 items above/below viewport for smooth scroll).
 * Infinite scroll: calls fetchActivityPage when the last item is near the viewport.
 *
 * PERFORMANCE (ACT-07):
 *   Only visible rows are in the DOM regardless of total loaded count.
 *   Cursor pagination loads 50 entries per page via fetchActivityPage Server Action.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Day headers: aria-label, role="heading"
 *   - List: role="list", aria-label
 *   - Loading state: aria-busy, aria-live
 *   - Empty state: described region
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fetchActivityPage } from "@/app/app/activity/actions";
import { ActivityRow } from "./activity-row";
import { SectionHeader } from "@/components/design/primitives";
import type { ActivityEntryRow, ActivityFilters, ActivityCursor } from "@/app/app/activity/actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FlatItem =
  | { type: "header"; day: string; isoDay: string }
  | { type: "row"; entry: ActivityEntryRow };

interface ActivityLogProps {
  initialEntries: ActivityEntryRow[];
  initialCursor: ActivityCursor | null;
  filters: ActivityFilters;
  /** Shopify GID → product title map for humanizing row summaries. */
  gidTitles: Record<string, string>;
  /** Merge newly-resolved GID titles when a page loads. */
  onMergeGidTitles: (more: Record<string, string>) => void;
  selectedEntryId: string | null;
  onSelectEntry: (entry: ActivityEntryRow) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDayLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const entryDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  if (entryDay.getTime() === today.getTime()) return "Today";
  if (entryDay.getTime() === yesterday.getTime()) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year:
      date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getIsoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Build flattened day-grouped array for virtualizer */
function buildFlatItems(entries: ActivityEntryRow[]): FlatItem[] {
  const items: FlatItem[] = [];
  let lastIsoDay = "";

  for (const entry of entries) {
    const date = new Date(entry.occurred_at);
    const isoDay = getIsoDay(date);

    if (isoDay !== lastIsoDay) {
      items.push({ type: "header", day: getDayLabel(date), isoDay });
      lastIsoDay = isoDay;
    }
    items.push({ type: "row", entry });
  }

  return items;
}

// ─── ActivityLog ───────────────────────────────────────────────────────────────

export function ActivityLog({
  initialEntries,
  initialCursor,
  filters,
  gidTitles,
  onMergeGidTitles,
  selectedEntryId,
  onSelectEntry,
  selectMode,
  selectedIds,
  onToggleSelect,
}: ActivityLogProps) {
  const [entries, setEntries] = useState<ActivityEntryRow[]>(initialEntries);
  const [cursor, setCursor] = useState<ActivityCursor | null>(initialCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // Reset when filters change (new page 1 from RSC)
  useEffect(() => {
    setEntries(initialEntries);
    setCursor(initialCursor);
    setLoadError(null);
  }, [initialEntries, initialCursor]);

  // Build flattened array for virtualizer
  const flatItems = buildFlatItems(entries);

  // ─── Virtualizer ─────────────────────────────────────────────────────────────

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flatItems[index];
      return item?.type === "header" ? 36 : 52;
    },
    overscan: 10,
  });

  // ─── Infinite scroll ──────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadError(null);

    const result = await fetchActivityPage(cursor, filters);

    if ("error" in result) {
      setLoadError(result.error);
    } else {
      setEntries((prev) => [...prev, ...result.entries]);
      setCursor(result.nextCursor);
      onMergeGidTitles(result.gidTitles);
    }
    setIsLoadingMore(false);
  }, [cursor, isLoadingMore, filters, onMergeGidTitles]);

  // Detect when virtualizer renders the last item and trigger loadMore
  const virtualItems = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    if (virtualItems.length === 0) return;
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    // If last rendered item is within 5 of the total, load more
    if (
      lastItem.index >= flatItems.length - 5 &&
      cursor &&
      !isLoadingMore
    ) {
      loadMore();
    }
  }, [virtualItems, flatItems.length, cursor, isLoadingMore, loadMore]);

  // ─── Empty state ──────────────────────────────────────────────────────────────

  if (entries.length === 0 && !isLoadingMore) {
    return (
      <div
        role="region"
        aria-label="No activity entries"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 10,
          padding: "60px 40px",
          color: "var(--text-tertiary)",
        }}
      >
        <p style={{ fontSize: 13.5, margin: 0 }}>
          No activity yet. The agent&apos;s actions will appear here.
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      ref={parentRef}
      role="list"
      aria-label="Activity log entries"
      aria-busy={isLoadingMore}
      style={{
        flex: 1,
        overflow: "auto",
        padding: "20px 40px 60px",
        background: "var(--bg)",
        position: "relative",
      }}
    >
      {/* Vertical timeline rule behind rows */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "calc(40px + 9px)",
          top: 20,
          bottom: 60,
          width: 0.5,
          background: "var(--border)",
          pointerEvents: "none",
        }}
      />

      {/* Virtualizer total height container */}
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = flatItems[virtualRow.index];
          if (!item) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {item.type === "header" ? (
                <div
                  role="heading"
                  aria-level={3}
                  aria-label={`Activity entries: ${item.day}`}
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "var(--bg)",
                    paddingTop: 4,
                    zIndex: 1,
                  }}
                >
                  <SectionHeader>{item.day}</SectionHeader>
                </div>
              ) : (
                <div role="listitem">
                  <ActivityRow
                    entry={item.entry}
                    gidTitles={gidTitles}
                    isActive={selectedEntryId === item.entry.id}
                    isSelected={selectedIds.has(item.entry.id)}
                    selectMode={selectMode}
                    onClick={() => onSelectEntry(item.entry)}
                    onToggleSelect={() => onToggleSelect(item.entry.id)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Loading more indicator */}
      {isLoadingMore && (
        <div
          aria-live="polite"
          aria-label="Loading more entries"
          style={{
            padding: "16px 0",
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--text-tertiary)",
          }}
        >
          Loading more...
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "12px 16px",
            marginTop: 8,
            background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
            border: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
            borderRadius: "var(--r-md)",
            fontSize: 13,
            color: "var(--text)",
          }}
        >
          Failed to load more entries: {loadError}
        </div>
      )}

      {/* End of list indicator */}
      {!cursor && entries.length > 0 && !isLoadingMore && (
        <div
          aria-label="End of activity log"
          style={{
            padding: "16px 0 8px",
            textAlign: "center",
            fontSize: 11.5,
            color: "var(--text-tertiary)",
          }}
        >
          {entries.length} {entries.length === 1 ? "entry" : "entries"} total
        </div>
      )}
    </div>
  );
}
