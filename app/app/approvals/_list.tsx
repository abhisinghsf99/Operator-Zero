"use client";

/**
 * app/app/approvals/_list.tsx
 * Approval Inbox client shell — list panel + bulk-action bar.
 *
 * ApprovalsView: top-level client shell holding state for:
 *   - selectedApprovalId (detail panel focus)
 *   - selectMode toggle + selectedIds (bulk triage — D-12)
 *   - showSnoozed toggle (APRV-06)
 *   - activeFilter (FilterChip)
 *
 * ApprovalsList: the 380px scrollable list panel.
 * ApprovalRow: single approval item with checkbox, stakes, summary, age.
 * FilterChip: filter tabs (all / high / catalog / seo / q_a / inventory).
 * BulkActionBar: appears when selectedIds.size > 0 in select mode.
 * ApprovalsEmpty: "All clear" empty state — no task CTA (APRV-08).
 *
 * Mobile drill-down (D-11, UX-01):
 *   - On mobile (<md), shows list OR detail (not both columns).
 *   - When activeId is set on mobile, list is hidden; detail fills full width.
 *   - Back button (aria-label="Back to approvals list") clears activeId, returns focus.
 *   - All actions (approve/reject/snooze/edit/bulk) work at 375px — no read-only stripping.
 *
 * WCAG 2.1 AA:
 *   - Checkboxes with aria-label
 *   - Bulk bar aria-label
 *   - Filter chips with role="tab" pattern
 *   - focus-visible ring on all interactive elements
 *
 * Calls bulkResolve Server Action for bulk triage.
 */

import { useState, useTransition, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { bulkResolve } from "./actions";
import { ApprovalDetail } from "./_detail";
import { useApprovalsSync } from "./_realtime-sync";
import type { PendingApproval } from "./actions";
import {
  SurfaceHeader,
  StakesIndicator,
  DomainBadge,
  Button,
  Kbd,
} from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FilterId = "all" | "high" | "catalog" | "seo" | "q_a" | "inventory";

interface ApprovalsViewProps {
  userId: string;
  initialApprovals: PendingApproval[];
  initialCount: number;
  showSnoozed?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAge(date: Date): string {
  const ageMs = Date.now() - new Date(date).getTime();
  const ageMin = Math.floor(ageMs / 60_000);
  const ageHr = Math.floor(ageMin / 60);
  const ageDay = Math.floor(ageHr / 24);
  if (ageMin < 1) return "just now";
  if (ageMin < 60) return `${ageMin}m`;
  if (ageHr < 24) return `${ageHr}h`;
  return `${ageDay}d`;
}

function getActionDomain(actionType: string): FilterId {
  if (actionType.includes("product") || actionType.includes("catalog")) return "catalog";
  if (actionType.includes("meta") || actionType.includes("seo")) return "seo";
  if (actionType.includes("email") || actionType.includes("reply")) return "q_a";
  if (actionType.includes("inventory") || actionType.includes("stock")) return "inventory";
  return "catalog";
}

/** Map FilterId back to domain label used by DomainBadge */
function filterIdToDomainLabel(filterId: FilterId): string | null {
  const map: Record<FilterId, string | null> = {
    all: null,
    high: null,
    catalog: "Catalog",
    seo: "SEO",
    q_a: "Q&A",
    inventory: "Inventory",
  };
  return map[filterId];
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset" as unknown as undefined,
        cursor: "pointer",
        padding: "5px 12px",
        background: active ? "var(--text)" : "transparent",
        color: active ? "var(--bg)" : "var(--text-secondary)",
        border: "0.5px solid",
        borderColor: active ? "var(--text)" : "var(--border-strong)",
        borderRadius: "var(--r-pill)",
        fontSize: 12,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        transition: "background 0.12s, color 0.12s",
        fontFamily: "inherit",
      }}
      aria-pressed={active}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-approval-ink)] focus-visible:ring-offset-1"
    >
      {label}
      {count > 0 && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: active ? "var(--bg)" : "var(--text-tertiary)",
            opacity: active ? 0.7 : 1,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function Checkbox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onChange();
        }
      }}
      style={{
        width: 14,
        height: 14,
        borderRadius: "var(--r-xs)",
        border: "0.5px solid",
        borderColor: checked ? "var(--acc-approval-ink)" : "var(--border-strong)",
        background: checked ? "var(--acc-approval-ink)" : "transparent",
        color: "var(--bg)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-approval-ink)]"
    >
      {checked && <Icons.Check size={10} strokeWidth={2.5} />}
    </div>
  );
}

// ─── ApprovalRow ──────────────────────────────────────────────────────────────

function ApprovalRow({
  approval,
  isActive,
  isSelected,
  selectMode,
  onClick,
  onToggleSelect,
  isLast,
}: {
  approval: PendingApproval;
  isActive: boolean;
  isSelected: boolean;
  selectMode: boolean;
  onClick: (el: HTMLDivElement | null) => void;
  onToggleSelect: () => void;
  isLast: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const domainLabel = filterIdToDomainLabel(getActionDomain(approval.action_type));

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={() => onClick(rowRef.current)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(rowRef.current);
        }
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-subtle)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
      style={{
        padding: "14px 20px",
        borderBottom: isLast ? "none" : "0.5px solid var(--border-hairline)",
        borderLeft: "3px solid",
        borderLeftColor: isActive ? "var(--acc-approval-ink)" : "transparent",
        background: isActive ? "var(--acc-approval-bg)" : "transparent",
        cursor: "pointer",
        display: "flex",
        gap: 10,
        transition: "background 0.12s",
      }}
      data-testid="approval-row"
      aria-label={`${approval.action_summary} — ${approval.stakes} stakes`}
      aria-current={isActive ? "true" : undefined}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-approval-ink)] focus-visible:ring-inset"
    >
      {/* Checkbox — always shown when selectMode is active */}
      {selectMode && (
        <div style={{ paddingTop: 2 }}>
          <Checkbox
            checked={isSelected}
            onChange={onToggleSelect}
            ariaLabel={`Select: ${approval.action_summary}`}
          />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StakesIndicator level={approval.stakes === "med" ? "medium" : (approval.stakes as "low" | "medium" | "high")} />
          <span
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              fontFamily: "var(--font-mono)",
              marginLeft: "auto",
            }}
            aria-label={`Age: ${formatAge(approval.created_at)}`}
          >
            {formatAge(approval.created_at)}
          </span>
        </div>
        <div
          style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 500 }}
          className="truncate"
        >
          {approval.action_summary}
        </div>
        <div
          style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}
          className="truncate"
        >
          {approval.action_type}
        </div>
        {domainLabel && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <DomainBadge domain={domainLabel} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BulkActionBar ────────────────────────────────────────────────────────────

function BulkActionBar({
  count,
  onApprove,
  onReject,
  onCancel,
  isPending,
}: {
  count: number;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 20px",
        borderTop: "0.5px solid var(--border)",
        background: "var(--bg-elevated)",
        boxShadow: "var(--shadow-md)",
      }}
      role="toolbar"
      aria-label={`Bulk actions for ${count} selected approval${count !== 1 ? "s" : ""}`}
      data-testid="bulk-action-bar"
    >
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
        {count} selected
      </span>
      <span style={{ flex: 1 }} />
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={isPending}
      >
        Cancel
      </Button>
      <Button
        variant="danger"
        size="sm"
        icon="X"
        onClick={onReject}
        disabled={isPending}
        aria-label={`Reject ${count} selected`}
      >
        {isPending ? "Rejecting…" : `Reject (${count})`}
      </Button>
      <Button
        variant="primary"
        accent="approval"
        size="sm"
        icon="CheckDouble"
        onClick={onApprove}
        disabled={isPending}
        aria-label={`Approve ${count} selected`}
      >
        {isPending ? "Approving…" : `Approve (${count})`}
      </Button>
    </div>
  );
}

// ─── ApprovalsEmpty ───────────────────────────────────────────────────────────

function ApprovalsEmpty() {
  const router = useRouter();

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}
      data-testid="approvals-empty"
    >
      <SurfaceHeader
        kicker="Approval Inbox · 0 pending"
        title="All clear."
        subtitle="Nothing needs your approval right now. Empty is the goal state."
        accent="approval"
      />
      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            maxWidth: 440,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "var(--acc-approval-bg)",
              color: "var(--acc-approval-ink)",
              display: "grid",
              placeItems: "center",
            }}
            aria-hidden="true"
          >
            <Icons.CheckDouble size={28} />
          </div>
          <div
            className="display"
            style={{ fontSize: 28, lineHeight: 1.2, color: "var(--text)" }}
          >
            Inbox at zero.
          </div>
          <p
            style={{
              color: "var(--text-tertiary)",
              lineHeight: 1.55,
              margin: 0,
              fontSize: 13.5,
            }}
          >
            Your agent is running on its own. When something needs your judgment,
            you&apos;ll find it here — or inline in conversation, whichever you reach first.
          </p>
          <Button
            variant="ghost"
            onClick={() => router.push("/app/activity")}
          >
            See what&apos;s been running →
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ApprovalsView ────────────────────────────────────────────────────────────

/**
 * ApprovalsView — main client shell.
 *
 * Holds all approval inbox state and wires up the realtime sync hook.
 */
export function ApprovalsView({
  userId,
  initialApprovals,
  initialCount,
  showSnoozed = false,
}: ApprovalsViewProps) {
  const [approvalsList, setApprovalsList] = useState<PendingApproval[]>(initialApprovals);
  // Desktop: default to first item. Mobile: start with no active item (show list first).
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [isBulkPending, startBulkTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Ref to the last activated list row — for returning focus on Back (D-11)
  const lastActivatedRowRef = useRef<HTMLDivElement | null>(null);
  // Ref to the detail heading — for moving focus on open (D-11)
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Subscribe to Realtime changes for cross-surface badge sync (APRV-05)
  useApprovalsSync(userId, initialCount);

  const router = useRouter();

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filteredApprovals = useMemo(() => {
    let list = approvalsList;
    if (activeFilter === "high") {
      list = approvalsList.filter((a) => a.stakes === "high");
    } else if (activeFilter !== "all") {
      list = approvalsList.filter((a) => getActionDomain(a.action_type) === activeFilter);
    }
    // Sort by stakes (high > med > low) then recency
    const stakesRank: Record<string, number> = { high: 0, med: 1, medium: 1, low: 2 };
    return [...list].sort((a, b) => {
      const sr = (stakesRank[a.stakes] ?? 2) - (stakesRank[b.stakes] ?? 2);
      if (sr !== 0) return sr;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [approvalsList, activeFilter]);

  // Count for each filter chip
  const filterCounts = useMemo(() => ({
    all: approvalsList.length,
    high: approvalsList.filter((a) => a.stakes === "high").length,
    catalog: approvalsList.filter((a) => getActionDomain(a.action_type) === "catalog").length,
    seo: approvalsList.filter((a) => getActionDomain(a.action_type) === "seo").length,
    q_a: approvalsList.filter((a) => getActionDomain(a.action_type) === "q_a").length,
    inventory: approvalsList.filter((a) => getActionDomain(a.action_type) === "inventory").length,
  }), [approvalsList]);

  const activeApproval = approvalsList.find((a) => a.id === activeId) ?? null;

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const removeIds = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setApprovalsList((prev) => prev.filter((a) => !idSet.has(a.id)));
    setSelectedIds(new Set());
    if (activeId && idSet.has(activeId)) {
      const remaining = approvalsList.filter((a) => !idSet.has(a.id));
      setActiveId(remaining[0]?.id ?? null);
    }
  }, [activeId, approvalsList]);

  const handleResolved = useCallback((approvalId: string) => {
    removeIds([approvalId]);
    // Router refresh picks up the fresh pending count for the badge
    router.refresh();
    // On mobile, return to list after resolution
    setActiveId(null);
  }, [removeIds, router]);

  // Mobile Back: clear activeId, return focus to last activated row (D-11)
  const handleMobileBack = useCallback(() => {
    setActiveId(null);
    // Return focus to the last activated row after state update
    requestAnimationFrame(() => {
      lastActivatedRowRef.current?.focus();
    });
  }, []);

  // Activate an approval row: set activeId + move focus to detail heading on mobile (D-11)
  const handleRowActivate = useCallback((id: string, rowEl: HTMLDivElement | null) => {
    lastActivatedRowRef.current = rowEl;
    setActiveId(id);
    // Move focus to the detail heading after render
    requestAnimationFrame(() => {
      detailHeadingRef.current?.focus();
    });
  }, []);

  const handleBulkApprove = () => {
    const ids = Array.from(selectedIds);
    startBulkTransition(async () => {
      setBulkError(null);
      const result = await bulkResolve(ids, "approved");
      if ("error" in result) {
        setBulkError(result.error);
        return;
      }
      removeIds(ids);
      setSelectMode(false);
      router.refresh();
    });
  };

  const handleBulkReject = () => {
    const ids = Array.from(selectedIds);
    startBulkTransition(async () => {
      setBulkError(null);
      const result = await bulkResolve(ids, "rejected");
      if ("error" in result) {
        setBulkError(result.error);
        return;
      }
      removeIds(ids);
      setSelectMode(false);
      router.refresh();
    });
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (approvalsList.length === 0) {
    return <ApprovalsEmpty />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Surface header — approval accent, real SurfaceHeader primitive */}
      <SurfaceHeader
        kicker={`Approval Inbox · ${approvalsList.length} pending`}
        title="Things waiting for your nod."
        subtitle="Batch through them, or approve inline next time you're in chat — same queue, two doors."
        accent="approval"
        right={
          <>
            {/* Snooze toggle (ghost) */}
            <Button
              variant="ghost"
              size="md"
              icon="Clock"
              onClick={() => {
                const url = showSnoozed ? "/app/approvals" : "/app/approvals?showSnoozed=true";
                router.push(url);
              }}
              aria-label={showSnoozed ? "Hide snoozed items" : "Show snoozed items"}
            >
              {showSnoozed ? "Hide snoozed" : "Snoozed"}
            </Button>
            {/* Select/Approve selected (secondary) */}
            <Button
              variant="secondary"
              size="md"
              icon="CheckDouble"
              onClick={() => {
                if (selectMode && selectedIds.size > 0) {
                  // approve selected
                  handleBulkApprove();
                } else {
                  setSelectMode((s) => !s);
                  setSelectedIds(new Set());
                }
              }}
              aria-pressed={selectMode}
              aria-label={
                selectMode
                  ? selectedIds.size > 0
                    ? `Approve ${selectedIds.size} selected`
                    : "Exit select mode"
                  : "Enter select mode for bulk actions"
              }
              data-testid="select-mode-toggle"
            >
              {selectMode
                ? selectedIds.size > 0
                  ? `Approve (${selectedIds.size})`
                  : "Cancel select"
                : "Select"}
            </Button>
          </>
        }
      />

      {/* Filter chips */}
      <div
        style={{
          padding: "14px 40px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "0.5px solid var(--border)",
          flexShrink: 0,
        }}
        role="tablist"
        aria-label="Filter approvals"
      >
        {(
          [
            { id: "all" as FilterId, label: "All" },
            { id: "high" as FilterId, label: "High stakes" },
            { id: "catalog" as FilterId, label: "Catalog" },
            { id: "seo" as FilterId, label: "SEO" },
            { id: "q_a" as FilterId, label: "Q&A" },
            { id: "inventory" as FilterId, label: "Inventory" },
          ] as const
        ).map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            count={filterCounts[f.id]}
            active={activeFilter === f.id}
            onClick={() => setActiveFilter(f.id)}
          />
        ))}
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 11.5,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          stakes ↓ then recency ↓
        </span>
      </div>

      {/* Two-pane flex layout (PATTERNS.md) + mobile drill-down (D-11, UX-01) */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/*
          List panel:
            Desktop (md+): 380px fixed width, always visible.
            Mobile (<md):  Full width, visible when NO activeId; hidden when detail is open.
          No read-only stripping: select-mode + bulk-bar work at 375px (D-11, UX-01).
        */}
        <div
          className={cn(
            "shrink-0 overflow-y-auto",
            "md:flex md:w-[380px]",
            // Mobile: full width list, hidden when detail is open
            activeId ? "hidden md:flex" : "flex w-full"
          )}
          style={{
            flexDirection: "column",
            borderRight: "0.5px solid var(--border)",
            background: "var(--bg)",
          }}
          role="list"
          aria-label="Pending approvals"
          data-testid="approvals-list"
        >
          {filteredApprovals.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-tertiary)",
              }}
            >
              No items for this filter.
            </div>
          ) : (
            filteredApprovals.map((a, i) => (
              <ApprovalRow
                key={a.id}
                approval={a}
                isActive={a.id === activeId}
                isSelected={selectedIds.has(a.id)}
                selectMode={selectMode}
                onClick={(rowEl) => handleRowActivate(a.id, rowEl)}
                onToggleSelect={() => toggleSelect(a.id)}
                isLast={i === filteredApprovals.length - 1}
              />
            ))
          )}
        </div>

        {/*
          Detail panel:
            Desktop (md+): flex-1, always visible (shows "select an item" placeholder).
            Mobile (<md):  Full width, visible only when activeId is set.
                           Shows Back affordance at top (aria-label="Back to approvals list").
        */}
        <div
          className={cn(
            "overflow-hidden",
            "md:flex md:flex-1",
            // Mobile: full width detail, only visible when detail is open
            activeId ? "flex flex-1" : "hidden md:flex"
          )}
          style={{ flexDirection: "column", background: "var(--bg-subtle)" }}
        >
          {/* Mobile-only Back affordance (D-11) */}
          {activeId && (
            <div
              className="md:hidden"
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
                aria-label="Back to approvals list"
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
                className="hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-approval-ink)] focus-visible:ring-offset-1"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Back
              </button>
            </div>
          )}

          {activeApproval ? (
            <ApprovalDetail
              approval={activeApproval}
              onResolved={handleResolved}
              detailHeadingRef={detailHeadingRef}
            />
          ) : (
            <div
              style={{
                display: "flex",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                padding: 80,
                textAlign: "center",
                color: "var(--text-tertiary)",
                fontSize: 13.5,
              }}
            >
              Select an item to review.
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar — appears when items are selected in select mode (D-12) */}
      {selectMode && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onApprove={handleBulkApprove}
          onReject={handleBulkReject}
          onCancel={() => { setSelectMode(false); setSelectedIds(new Set()); }}
          isPending={isBulkPending}
        />
      )}

      {/* Bulk error */}
      {bulkError && (
        <div
          style={{
            borderTop: "0.5px solid var(--border)",
            background: "var(--bg-elevated)",
            padding: "12px 20px",
            fontSize: 12.5,
            color: "var(--danger)",
          }}
          role="alert"
        >
          {bulkError}
        </div>
      )}
    </div>
  );
}
