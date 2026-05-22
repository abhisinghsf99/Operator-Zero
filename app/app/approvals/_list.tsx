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
 * WCAG 2.1 AA:
 *   - Checkboxes with aria-label
 *   - Bulk bar aria-label
 *   - Filter chips with role="tab" pattern
 *   - focus-visible ring on all interactive elements
 *
 * Calls bulkResolve Server Action for bulk triage.
 */

import { useState, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Inbox, CheckSquare, Clock, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { bulkResolve } from "./actions";
import { ApprovalDetail } from "./_detail";
import { useApprovalsSync } from "./_realtime-sync";
import type { PendingApproval } from "./actions";

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

function stakesColor(stakes: string) {
  if (stakes === "high") return "var(--danger)";
  if (stakes === "med") return "var(--warning)";
  return "var(--text-tertiary)";
}

function getActionDomain(actionType: string): FilterId {
  if (actionType.includes("product") || actionType.includes("catalog")) return "catalog";
  if (actionType.includes("meta") || actionType.includes("seo")) return "seo";
  if (actionType.includes("email") || actionType.includes("reply")) return "q_a";
  if (actionType.includes("inventory") || actionType.includes("stock")) return "inventory";
  return "catalog";
}

// ─── SurfaceHeader ────────────────────────────────────────────────────────────

function SurfaceHeader({
  kicker,
  title,
  subtitle,
  right,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <header
      className="shrink-0 border-b border-[var(--border)] bg-[var(--bg)]"
      style={{ padding: "28px 40px 20px" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className="m-0 font-mono text-[11.5px] uppercase tracking-[0.06em] opacity-80"
            style={{ color: "var(--acc-approval-ink)" }}
          >
            {kicker}
          </p>
          <h1
            className="display mt-1 text-[28px] tracking-[-0.015em] leading-[1.2]"
            style={{ color: "var(--text)" }}
          >
            {title}
          </h1>
          <p
            className="mt-1 text-[13.5px] leading-[1.5]"
            style={{ color: "var(--text-tertiary)" }}
          >
            {subtitle}
          </p>
        </div>
        {right && <div className="flex shrink-0 items-center gap-2 pt-1">{right}</div>}
      </div>
    </header>
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
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-[var(--r-pill)] border-[0.5px] px-3 py-[5px] text-[12px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1",
        active
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
          : "border-[var(--border-strong)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
      )}
      aria-pressed={active}
    >
      {label}
      {count > 0 && (
        <span
          className={cn(
            "font-mono text-[10.5px]",
            active ? "opacity-70 text-[var(--bg)]" : "text-[var(--text-tertiary)]"
          )}
        >
          {count}
        </span>
      )}
    </button>
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
  onClick: () => void;
  onToggleSelect: () => void;
  isLast: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex cursor-pointer gap-[10px] px-5 py-[14px] transition-colors duration-[120ms]",
        !isLast && "border-b border-[var(--border-hairline,var(--border))]",
        isActive
          ? "border-l-[3px] border-l-[var(--acc-approval-ink)] bg-[var(--acc-approval-bg)]"
          : "border-l-[3px] border-l-transparent hover:bg-[var(--bg-subtle)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
      )}
      data-testid="approval-row"
      aria-label={`${approval.action_summary} — ${approval.stakes} stakes`}
      aria-current={isActive ? "true" : undefined}
    >
      {/* Checkbox (select mode) */}
      {selectMode && (
        <div
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`Select: ${approval.action_summary}`}
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect();
            }
          }}
          className={cn(
            "mt-[3px] flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[var(--r-xs)] border-[0.5px] cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]",
            isSelected
              ? "border-[var(--acc-approval-ink)] bg-[var(--acc-approval-ink)] text-[var(--bg)]"
              : "border-[var(--border-strong)] bg-transparent"
          )}
        >
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <div className="flex items-center gap-2">
          {/* Stakes indicator */}
          <span
            className="font-mono text-[10px] uppercase tracking-[0.05em] font-semibold"
            style={{ color: stakesColor(approval.stakes) }}
            aria-label={`Stakes: ${approval.stakes}`}
          >
            {approval.stakes}
          </span>
          <span
            className="ml-auto font-mono text-[11px]"
            style={{ color: "var(--text-faint,var(--text-tertiary))" }}
            aria-label={`Age: ${formatAge(approval.created_at)}`}
          >
            {formatAge(approval.created_at)}
          </span>
        </div>
        <div
          className="truncate text-[13.5px] font-medium"
          style={{ color: "var(--text)" }}
        >
          {approval.action_summary}
        </div>
        <div
          className="truncate font-mono text-[11.5px] uppercase tracking-[0.04em]"
          style={{ color: "var(--text-tertiary)" }}
        >
          {approval.action_type}
        </div>
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
      className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3"
      role="toolbar"
      aria-label={`Bulk actions for ${count} selected approval${count !== 1 ? "s" : ""}`}
      data-testid="bulk-action-bar"
    >
      <span className="text-[12.5px] text-[var(--text-secondary)]">
        {count} selected
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onCancel}
          className="rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-deeper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
          disabled={isPending}
        >
          Cancel
        </button>
        <button
          onClick={onReject}
          disabled={isPending}
          aria-busy={isPending}
          className="rounded-[var(--r-sm)] border border-[var(--border)] bg-transparent px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
          aria-label={`Reject ${count} selected`}
          data-testid="bulk-reject-btn"
        >
          {isPending ? "Rejecting…" : `Reject (${count})`}
        </button>
        <button
          onClick={onApprove}
          disabled={isPending}
          aria-busy={isPending}
          className="rounded-[var(--r-sm)] bg-[var(--acc-approval-ink,#4f6ef7)] px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
          aria-label={`Approve ${count} selected`}
          data-testid="bulk-approve-btn"
        >
          {isPending ? "Approving…" : `Approve (${count})`}
        </button>
      </div>
    </div>
  );
}

// ─── ApprovalsEmpty ───────────────────────────────────────────────────────────

function ApprovalsEmpty() {
  const router = useRouter();

  return (
    <div className="flex h-full flex-col overflow-auto" data-testid="approvals-empty">
      <SurfaceHeader
        kicker="Approval Inbox · 0 pending"
        title="All clear."
        subtitle="Nothing needs your approval right now. Empty is the goal state."
      />
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="flex max-w-[440px] flex-col items-center gap-[18px] text-center">
          <div
            className="grid h-[72px] w-[72px] place-items-center rounded-full"
            style={{
              background: "var(--acc-approval-bg)",
              color: "var(--acc-approval-ink)",
            }}
            aria-hidden="true"
          >
            <Inbox size={28} />
          </div>
          <div className="display text-[28px] leading-[1.2]" style={{ color: "var(--text)" }}>
            Inbox at zero.
          </div>
          <p
            className="m-0 text-[13.5px] leading-[1.55]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Your agent is running on its own. When something needs your judgment, you&apos;ll find it here — or inline in conversation, whichever you reach first.
          </p>
          {/* Gentle navigation link — NO task CTA (APRV-08) */}
          <button
            onClick={() => router.push("/app/activity")}
            className="text-[13px] text-[var(--acc-chat-ink,#4f6ef7)] underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          >
            See what&apos;s been running →
          </button>
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
  const [activeId, setActiveId] = useState<string | null>(initialApprovals[0]?.id ?? null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [isBulkPending, startBulkTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Subscribe to Realtime changes for cross-surface badge sync (APRV-05)
  useApprovalsSync(userId, initialCount);

  const router = useRouter();

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filteredApprovals = useMemo(() => {
    if (activeFilter === "all") return approvalsList;
    if (activeFilter === "high") return approvalsList.filter((a) => a.stakes === "high");
    return approvalsList.filter((a) => getActionDomain(a.action_type) === activeFilter);
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
  }, [removeIds, router]);

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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Surface header */}
      <SurfaceHeader
        kicker={`Approval Inbox · ${approvalsList.length} pending`}
        title="Things waiting for your nod."
        subtitle="Batch through them, or approve inline next time you're in chat — same queue, two doors."
        right={
          <div className="flex items-center gap-2">
            {/* Snooze toggle */}
            <a
              href={showSnoozed ? "/app/approvals" : "/app/approvals?showSnoozed=true"}
              className="flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]"
              aria-label={showSnoozed ? "Hide snoozed items" : "Show snoozed items"}
            >
              <Clock size={13} aria-hidden="true" />
              {showSnoozed ? "Hide snoozed" : "Show snoozed"}
            </a>
            {/* Select mode toggle */}
            <button
              onClick={() => {
                setSelectMode((s) => !s);
                setSelectedIds(new Set());
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12.5px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]",
                selectMode
                  ? "bg-[var(--acc-approval-bg)] text-[var(--acc-approval-ink)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              )}
              aria-pressed={selectMode}
              aria-label={selectMode ? "Exit select mode" : "Enter select mode for bulk actions"}
            >
              <CheckSquare size={13} aria-hidden="true" />
              {selectMode ? "Cancel select" : "Select"}
            </button>
          </div>
        }
      />

      {/* Filter chips */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-10 py-[14px]"
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
        <span className="ml-auto font-mono text-[11.5px] text-[var(--text-tertiary)]">
          stakes ↓ then recency ↓
        </span>
      </div>

      {/* Two-pane flex layout (PATTERNS.md) */}
      <div className="flex flex-1 overflow-hidden">
        {/* List panel — 380px on md+ */}
        <div
          className="hidden w-[380px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] md:flex"
          role="list"
          aria-label="Pending approvals"
        >
          {filteredApprovals.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--text-tertiary)]">
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
                onClick={() => setActiveId(a.id)}
                onToggleSelect={() => toggleSelect(a.id)}
                isLast={i === filteredApprovals.length - 1}
              />
            ))
          )}
        </div>

        {/* Detail panel — flex-1 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeApproval ? (
            <ApprovalDetail
              approval={activeApproval}
              onResolved={handleResolved}
            />
          ) : (
            <div
              className="flex h-full items-center justify-center p-20 text-center text-[13.5px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              Select an item to review.
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar — appears when items are selected (D-12) */}
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
          className="border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 text-[12.5px] text-[var(--danger)]"
          role="alert"
        >
          {bulkError}
        </div>
      )}
    </div>
  );
}
