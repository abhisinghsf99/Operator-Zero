"use client";

/**
 * components/activity/activity-filters.tsx
 * Activity log filter bar: quick chips + Filter popover + removable pills.
 *
 * D-12: Quick level/result chips (instant update) + Filter popover for
 *   workflow, date-range (presets + custom), result.
 * D-13: Date-range filter = Today / 7d / 30d / All time + custom from-to.
 * Pitfall 4: Date/workflow inputs debounce 300ms before URL update.
 * All filters combine with AND; active filters render as removable pills.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Filter chips: role="radio" + aria-checked
 *   - Active filter pills: "Remove filter" aria-label on dismiss button
 *   - Popover: aria-expanded, role="dialog"
 *   - Date inputs: aria-label
 *
 * DESIGN: Mirrors surface-activity.jsx filter chip strip
 */

import {
  useState,
  useTransition,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Filter, X, ChevronDown } from "lucide-react";
import type { ActivityFilters } from "@/app/app/activity/actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowOption {
  id: string;
  name: string;
}

interface ActivityFiltersProps {
  filters: ActivityFilters;
  workflowOptions: WorkflowOption[];
  totalCount?: number;
  /** Called with new filter state (in addition to URL update) */
  onFiltersChange?: (filters: ActivityFilters) => void;
  /** Whether to show Select Mode toggle */
  selectMode: boolean;
  onSelectModeToggle: () => void;
  selectedCount: number;
  onBulkRevert: () => void;
}

// ─── Date preset helpers ──────────────────────────────────────────────────────

type DatePreset = "today" | "7d" | "30d" | "all";

function getDateRange(preset: DatePreset): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { dateFrom: today.toISOString(), dateTo: undefined };
    case "7d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { dateFrom: d.toISOString(), dateTo: undefined };
    }
    case "30d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { dateFrom: d.toISOString(), dateTo: undefined };
    }
    case "all":
      return { dateFrom: undefined, dateTo: undefined };
  }
}

// ─── ActiveFilterPill ─────────────────────────────────────────────────────────

function ActiveFilterPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 26,
        padding: "0 8px 0 10px",
        borderRadius: "var(--r-pill)",
        background: "var(--acc-activity-bg)",
        color: "var(--acc-activity-ink)",
        fontSize: 12,
        fontWeight: 500,
        border: "0.5px solid color-mix(in oklch, var(--acc-activity-ink) 25%, transparent)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <button
        type="button"
        aria-label={`Remove filter: ${label}`}
        onClick={onRemove}
        style={{
          display: "grid",
          placeItems: "center",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "color-mix(in oklch, var(--acc-activity-ink) 20%, transparent)",
          color: "var(--acc-activity-ink)",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <X size={9} aria-hidden="true" />
      </button>
    </span>
  );
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 28,
        padding: "0 11px",
        borderRadius: "var(--r-pill)",
        background: active ? "var(--acc-activity-bg)" : "var(--bg-elevated)",
        color: active ? "var(--acc-activity-ink)" : "var(--text-secondary)",
        fontSize: 12.5,
        fontWeight: active ? 500 : 400,
        border: active
          ? "0.5px solid color-mix(in oklch, var(--acc-activity-ink) 30%, transparent)"
          : "0.5px solid var(--border)",
        cursor: "pointer",
        transition: "background 0.12s, color 0.12s, border 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{ fontSize: 11, opacity: 0.7 }}>{count}</span>
      )}
    </button>
  );
}

// ─── ActivityFilters ──────────────────────────────────────────────────────────

export function ActivityFiltersBar({
  filters,
  workflowOptions,
  totalCount,
  onFiltersChange,
  selectMode,
  onSelectModeToggle,
  selectedCount,
  onBulkRevert,
}: ActivityFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    }
    if (popoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverOpen]);

  // ─── URL update helpers ─────────────────────────────────────────────────────

  const updateURL = useCallback(
    (newFilters: ActivityFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      // Reset to page 1 on filter change (clear cursor)
      params.delete("cursor");

      if (newFilters.automationLevel) {
        params.set("automationLevel", newFilters.automationLevel);
      } else {
        params.delete("automationLevel");
      }
      if (newFilters.result) {
        params.set("result", newFilters.result);
      } else {
        params.delete("result");
      }
      if (newFilters.workflowId) {
        params.set("workflowId", newFilters.workflowId);
      } else {
        params.delete("workflowId");
      }
      if (newFilters.dateFrom) {
        params.set("dateFrom", newFilters.dateFrom);
      } else {
        params.delete("dateFrom");
      }
      if (newFilters.dateTo) {
        params.set("dateTo", newFilters.dateTo);
      } else {
        params.delete("dateTo");
      }

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
      onFiltersChange?.(newFilters);
    },
    [searchParams, pathname, router, onFiltersChange, startTransition]
  );

  // Instant update for quick chips (level, result)
  const setQuickFilter = useCallback(
    (key: keyof ActivityFilters, value: string | undefined) => {
      const newFilters = { ...filters, [key]: value };
      updateURL(newFilters);
    },
    [filters, updateURL]
  );

  // Debounced update for slow inputs (date, workflow) — Pitfall 4
  const setDebouncedFilter = useCallback(
    (key: keyof ActivityFilters, value: string | undefined) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const newFilters = { ...filters, [key]: value };
        updateURL(newFilters);
      }, 300);
    },
    [filters, updateURL]
  );

  // ─── Active filter pills ────────────────────────────────────────────────────

  const activePills: { label: string; onRemove: () => void }[] = [];

  if (filters.automationLevel) {
    const levelLabels: Record<string, string> = {
      L1: "Manual (L1)",
      L2: "Approved (L2)",
      L3: "Autonomous (L3)",
    };
    activePills.push({
      label: levelLabels[filters.automationLevel] ?? filters.automationLevel,
      onRemove: () => setQuickFilter("automationLevel", undefined),
    });
  }
  if (filters.result) {
    activePills.push({
      label:
        filters.result === "success"
          ? "Succeeded"
          : filters.result === "failed"
          ? "Failed"
          : filters.result === "partial"
          ? "Partial"
          : filters.result,
      onRemove: () => setQuickFilter("result", undefined),
    });
  }
  if (filters.workflowId) {
    const wf = workflowOptions.find((w) => w.id === filters.workflowId);
    activePills.push({
      label: wf ? `Workflow: ${wf.name}` : "Workflow filter",
      onRemove: () => updateURL({ ...filters, workflowId: undefined }),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    const fromLabel = filters.dateFrom
      ? new Date(filters.dateFrom).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "Start";
    const toLabel = filters.dateTo
      ? new Date(filters.dateTo).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "Now";
    activePills.push({
      label: `${fromLabel} – ${toLabel}`,
      onRemove: () =>
        updateURL({ ...filters, dateFrom: undefined, dateTo: undefined }),
    });
  }

  // ─── Bulk action bar (select mode) ─────────────────────────────────────────

  if (selectMode && selectedCount > 0) {
    return (
      <div
        role="toolbar"
        aria-label="Bulk actions"
        style={{
          padding: "10px 40px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "0.5px solid var(--border)",
          background: "var(--acc-activity-bg)",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--acc-activity-ink)",
          }}
        >
          {selectedCount} selected
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onBulkRevert}
          style={{
            height: 32,
            padding: "0 14px",
            borderRadius: "var(--r-sm)",
            background: "var(--bg-elevated)",
            color: "var(--text)",
            border: "0.5px solid var(--border-strong)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Revert selected
        </button>
        <button
          type="button"
          onClick={onSelectModeToggle}
          style={{
            height: 32,
            padding: "0 14px",
            borderRadius: "var(--r-sm)",
            background: "transparent",
            color: "var(--text-secondary)",
            border: "0.5px solid var(--border)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "14px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      {/* Quick chips row */}
      <div
        role="radiogroup"
        aria-label="Filter by automation level or result"
        style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
      >
        {/* Quick level chips */}
        <FilterChip
          label="All"
          active={!filters.automationLevel && !filters.result}
          onClick={() =>
            updateURL({
              ...filters,
              automationLevel: undefined,
              result: undefined,
            })
          }
        />
        <FilterChip
          label="Autonomous"
          active={filters.automationLevel === "L3"}
          onClick={() =>
            setQuickFilter(
              "automationLevel",
              filters.automationLevel === "L3" ? undefined : "L3"
            )
          }
        />
        <FilterChip
          label="Approved"
          active={filters.automationLevel === "L2"}
          onClick={() =>
            setQuickFilter(
              "automationLevel",
              filters.automationLevel === "L2" ? undefined : "L2"
            )
          }
        />
        <FilterChip
          label="Manual"
          active={filters.automationLevel === "L1"}
          onClick={() =>
            setQuickFilter(
              "automationLevel",
              filters.automationLevel === "L1" ? undefined : "L1"
            )
          }
        />
        <FilterChip
          label="Needs review"
          active={filters.result === "failed"}
          onClick={() =>
            setQuickFilter(
              "result",
              filters.result === "failed" ? undefined : "failed"
            )
          }
        />

        <div style={{ flex: 1 }} />

        {/* Select mode toggle */}
        <button
          type="button"
          onClick={onSelectModeToggle}
          aria-pressed={selectMode}
          style={{
            height: 28,
            padding: "0 11px",
            borderRadius: "var(--r-pill)",
            background: selectMode ? "var(--bg-subtle)" : "transparent",
            color: "var(--text-secondary)",
            border: "0.5px solid var(--border)",
            fontSize: 12.5,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          Select
        </button>

        {/* Filter popover trigger */}
        <div ref={popoverRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setPopoverOpen((o) => !o)}
            aria-expanded={popoverOpen}
            aria-controls="activity-filter-popover"
            aria-haspopup="true"
            style={{
              height: 28,
              padding: "0 11px",
              borderRadius: "var(--r-pill)",
              background:
                activePills.length > 0
                  ? "var(--acc-activity-bg)"
                  : "var(--bg-elevated)",
              color:
                activePills.length > 0
                  ? "var(--acc-activity-ink)"
                  : "var(--text)",
              border:
                activePills.length > 0
                  ? "0.5px solid color-mix(in oklch, var(--acc-activity-ink) 30%, transparent)"
                  : "0.5px solid var(--border-strong)",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Filter size={12} aria-hidden="true" />
            Filter
            {activePills.length > 0 && (
              <span
                style={{
                  background: "var(--acc-activity-ink)",
                  color: "var(--bg)",
                  borderRadius: "var(--r-pill)",
                  padding: "0 5px",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {activePills.length}
              </span>
            )}
            <ChevronDown
              size={11}
              aria-hidden="true"
              style={{
                transform: popoverOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.12s",
              }}
            />
          </button>

          {/* Filter popover */}
          {popoverOpen && (
            <div
              id="activity-filter-popover"
              role="dialog"
              aria-label="Activity filters"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                width: 300,
                background: "var(--bg-elevated)",
                border: "0.5px solid var(--border-strong)",
                borderRadius: "var(--r-md)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                padding: "16px",
                zIndex: 100,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {/* Workflow filter */}
              {workflowOptions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label
                    htmlFor="filter-workflow"
                    style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}
                  >
                    Workflow
                  </label>
                  <select
                    id="filter-workflow"
                    value={filters.workflowId ?? ""}
                    onChange={(e) =>
                      setDebouncedFilter(
                        "workflowId",
                        e.target.value || undefined
                      )
                    }
                    style={{
                      height: 32,
                      padding: "0 8px",
                      borderRadius: "var(--r-sm)",
                      border: "0.5px solid var(--border-strong)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <option value="">All workflows</option>
                    {workflowOptions.map((wf) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date range */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span
                  style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}
                >
                  Date range
                </span>
                {/* Presets (D-13) */}
                <div
                  role="radiogroup"
                  aria-label="Date range presets"
                  style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                >
                  {(
                    [
                      { id: "today", label: "Today" },
                      { id: "7d", label: "7 days" },
                      { id: "30d", label: "30 days" },
                      { id: "all", label: "All time" },
                    ] as { id: DatePreset; label: string }[]
                  ).map((preset) => {
                    const range = getDateRange(preset.id);
                    const isActive =
                      filters.dateFrom === range.dateFrom &&
                      filters.dateTo === range.dateTo;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() =>
                          updateURL({
                            ...filters,
                            dateFrom: range.dateFrom,
                            dateTo: range.dateTo,
                          })
                        }
                        style={{
                          height: 26,
                          padding: "0 10px",
                          borderRadius: "var(--r-pill)",
                          background: isActive
                            ? "var(--acc-activity-bg)"
                            : "var(--bg-subtle)",
                          color: isActive
                            ? "var(--acc-activity-ink)"
                            : "var(--text-secondary)",
                          border: isActive
                            ? "0.5px solid color-mix(in oklch, var(--acc-activity-ink) 30%, transparent)"
                            : "0.5px solid var(--border)",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                {/* Custom from–to (D-13) */}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="date"
                    id="filter-date-from"
                    aria-label="From date"
                    value={
                      filters.dateFrom
                        ? new Date(filters.dateFrom).toISOString().split("T")[0]
                        : ""
                    }
                    onChange={(e) =>
                      setDebouncedFilter(
                        "dateFrom",
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : undefined
                      )
                    }
                    style={{
                      flex: 1,
                      height: 30,
                      padding: "0 6px",
                      borderRadius: "var(--r-sm)",
                      border: "0.5px solid var(--border-strong)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: 12.5,
                    }}
                  />
                  <span
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                    aria-hidden="true"
                  >
                    –
                  </span>
                  <input
                    type="date"
                    id="filter-date-to"
                    aria-label="To date"
                    value={
                      filters.dateTo
                        ? new Date(filters.dateTo).toISOString().split("T")[0]
                        : ""
                    }
                    onChange={(e) =>
                      setDebouncedFilter(
                        "dateTo",
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : undefined
                      )
                    }
                    style={{
                      flex: 1,
                      height: 30,
                      padding: "0 6px",
                      borderRadius: "var(--r-sm)",
                      border: "0.5px solid var(--border-strong)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: 12.5,
                    }}
                  />
                </div>
              </div>

              {/* Result filter */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span
                  style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}
                >
                  Result
                </span>
                <div
                  role="radiogroup"
                  aria-label="Filter by result"
                  style={{ display: "flex", gap: 6 }}
                >
                  {["All", "Success", "Partial", "Failed"].map((r) => {
                    const val =
                      r === "All" ? undefined : r.toLowerCase();
                    const isActive = filters.result === val || (!filters.result && r === "All");
                    return (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() =>
                          setQuickFilter("result", val)
                        }
                        style={{
                          height: 26,
                          padding: "0 10px",
                          borderRadius: "var(--r-pill)",
                          background: isActive
                            ? "var(--acc-activity-bg)"
                            : "var(--bg-subtle)",
                          color: isActive
                            ? "var(--acc-activity-ink)"
                            : "var(--text-secondary)",
                          border: isActive
                            ? "0.5px solid color-mix(in oklch, var(--acc-activity-ink) 30%, transparent)"
                            : "0.5px solid var(--border)",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Clear all */}
              {activePills.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    updateURL({});
                    setPopoverOpen(false);
                  }}
                  style={{
                    height: 32,
                    borderRadius: "var(--r-sm)",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    border: "0.5px solid var(--border)",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Active filter pills (removable, D-12) */}
      {activePills.length > 0 && (
        <div
          role="list"
          aria-label="Active filters"
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
        >
          {activePills.map((pill) => (
            <div role="listitem" key={pill.label}>
              <ActiveFilterPill label={pill.label} onRemove={pill.onRemove} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
