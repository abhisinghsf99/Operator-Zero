"use client";

/**
 * app/app/approvals/_realtime-sync.tsx
 * Supabase Realtime postgres_changes hook for cross-surface sync + badge decrement.
 *
 * useApprovalsSync — subscribes to the `approvals` table postgres_changes for the
 *   current user. Calls router.refresh() on any INSERT/UPDATE/DELETE so the RSC
 *   re-renders with fresh badge count and list data.
 *
 * ALWAYS cleans up channel on unmount (return () => supabase.removeChannel(channel))
 * to prevent memory leaks (Pitfall 1 from RESEARCH.md §1).
 *
 * Filter: user_id=eq.${userId} — combined with approvals RLS SELECT policy from
 * migration 0003, no cross-tenant leakage is possible (T-4-02-04).
 *
 * Pattern source: RESEARCH.md §1 verified pattern.
 *
 * EXPORTS:
 *   useApprovalsSync(userId, initialCount) — the Realtime hook
 *   ApprovalsBadgeSync — client wrapper for the sidebar badge
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/auth/client";

// ─── useApprovalsSync ─────────────────────────────────────────────────────────

/**
 * useApprovalsSync — subscribes to approvals postgres_changes for this user.
 *
 * On any change, calls router.refresh() so the RSC picks up fresh pending count
 * and list data. The realtime subscription is user-scoped via filter.
 *
 * @param userId       — the authenticated user UUID (filter: user_id=eq.{userId})
 * @param initialCount — initial pending count from the server RSC
 * @returns { pendingCount } — tracks local count (refreshed via router.refresh)
 */
export function useApprovalsSync(userId: string, initialCount: number) {
  const [pendingCount, setPendingCount] = useState(initialCount);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel("approvals-badge")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "approvals",
          filter: `user_id=eq.${userId}`,
        },
        (_payload) => {
          // Trigger RSC re-render — picks up fresh badge count and list data
          router.refresh();
        }
      )
      .subscribe();

    // CRITICAL: cleanup to prevent memory leak (Pitfall 1 — RESEARCH.md §1)
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return { pendingCount };
}

// ─── ApprovalsBadgeSync ───────────────────────────────────────────────────────

/**
 * ApprovalsBadgeSync — client component that renders the sidebar pending-count badge
 * and subscribes to Realtime so it decrements within 5s of any approval resolution (APRV-05).
 *
 * Used by the sidebar layout to wrap the Approvals nav item count.
 *
 * @param userId       — authenticated user UUID
 * @param initialCount — server-fetched pending count
 */
export function ApprovalsBadgeSync({
  userId,
  initialCount,
}: {
  userId: string;
  initialCount: number;
}) {
  // The hook triggers router.refresh() on changes, which re-renders the server layout
  // and passes the fresh count down as a new initialCount prop.
  useApprovalsSync(userId, initialCount);

  if (initialCount <= 0) return null;

  return (
    <span
      className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--acc-approval-ink,#4f6ef7)] px-1 font-mono text-[10px] text-white"
      aria-label={`${initialCount > 99 ? "99+" : initialCount} pending approvals`}
      data-testid="approvals-badge-count"
    >
      {initialCount > 99 ? "99+" : initialCount}
    </span>
  );
}
