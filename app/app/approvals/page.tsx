/**
 * app/app/approvals/page.tsx
 * Approval Inbox RSC — APRV-01..APRV-08.
 *
 * Auth/gate mirrors activity/page.tsx:
 *   getOrCreateProfile → onboarding gate → getClaims → session gate.
 *
 * Parallel-loads pending approvals + pending count via Promise.all.
 * Passes data to the ApprovalsView client shell.
 *
 * SECURITY:
 *   - getOrCreateProfile() verifies the session
 *   - getPendingApprovals/fetchPendingCount filter by userId (serviceDb + user_id)
 *
 * WCAG 2.1 AA:
 *   - data-testid for e2e testing
 *   - Two-pane flex layout (380px list + flex-1 detail), mobile-first fallback
 */

import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/auth/server";
import { getPendingApprovals, fetchPendingCount } from "./actions";
import { ApprovalsView } from "./_list";

interface ApprovalsPageProps {
  /** Next.js 15: searchParams is a Promise */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  // 1. Validate session + onboarding gate (mirrors activity/page.tsx)
  const profile = await getOrCreateProfile();
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const userId = profile.user_id;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) {
    redirect("/login");
  }

  // 2. Await searchParams (Next.js 15 requirement)
  const params = await searchParams;
  const showSnoozed = params["showSnoozed"] === "true";

  // 3. Parallel-load pending approvals + badge count (APRV-01)
  const [pendingApprovals, pendingCount] = await Promise.all([
    getPendingApprovals(userId, { showSnoozed }),
    fetchPendingCount(userId),
  ]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[var(--bg)]"
      data-testid="approvals-page"
    >
      <ApprovalsView
        userId={userId}
        initialApprovals={pendingApprovals}
        initialCount={pendingCount}
        showSnoozed={showSnoozed}
      />
    </div>
  );
}
