/**
 * app/app/activity/page.tsx
 * Activity log RSC — page 1 (ACT-01..ACT-08).
 *
 * Awaits searchParams (Next.js 15 — searchParams is a Promise),
 * parses AND-combined filters, fetches page 1 cursor-paginated,
 * joins shopify_updated_at for product/page targets (drift check).
 * Passes entries + filter state to the ActivityView client shell.
 *
 * ARCHITECTURE:
 *   Mirrors settings/page.tsx: onboarding gate, parallel fetch (if needed),
 *   passes data to _activity-view.tsx client island.
 *
 * SECURITY:
 *   - getOrCreateProfile() verifies the session
 *   - fetchActivityPage re-filters by user_id (T-3-04-03)
 *   - shopify_updated_at joined server-side — client parity only (T-3-04-02)
 *
 * WCAG 2.1 AA:
 *   - data-testid for e2e testing
 *   - Semantic heading structure passed to client shell
 */

import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/auth/server";
import { withUserRls } from "@/lib/db/client";
import { workflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchActivityPage } from "./actions";
import { ActivityView } from "./_activity-view";
import type { ActivityFilters } from "./actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ActivityPageProps {
  /** Next.js 15: searchParams is a Promise — must be awaited */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  // 1. Validate session + onboarding gate (mirrors settings/page.tsx)
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

  // 2. Await searchParams (Next.js 15 requirement — same pattern as params)
  const params = await searchParams;

  // 3. Parse AND-combined filters from URL search params (D-12, D-13)
  const filters: ActivityFilters = {};

  const workflowId = typeof params["workflowId"] === "string" ? params["workflowId"] : undefined;
  if (workflowId) filters.workflowId = workflowId;

  const result = typeof params["result"] === "string" ? params["result"] : undefined;
  if (result) filters.result = result;

  const automationLevel = typeof params["automationLevel"] === "string" ? params["automationLevel"] : undefined;
  if (automationLevel) filters.automationLevel = automationLevel;

  const dateFrom = typeof params["dateFrom"] === "string" ? params["dateFrom"] : undefined;
  if (dateFrom) filters.dateFrom = dateFrom;

  const dateTo = typeof params["dateTo"] === "string" ? params["dateTo"] : undefined;
  if (dateTo) filters.dateTo = dateTo;

  // 4. Fetch page 1 (cursor = null) with filters
  // product/page entries will carry shopifyUpdatedAt via join in fetchActivityPage
  const pageResult = await fetchActivityPage(null, filters);

  const initialEntries = "entries" in pageResult ? pageResult.entries : [];
  const initialCursor = "nextCursor" in pageResult ? pageResult.nextCursor : null;
  const initialGidTitles =
    "gidTitles" in pageResult ? pageResult.gidTitles : {};
  const fetchError = "error" in pageResult ? pageResult.error : null;

  // 5. Fetch workflow list for filter popover (workflow selector)
  const workflowList = await withUserRls(
    claims as Record<string, unknown>,
    async (tx) => {
      return tx
        .select({ id: workflows.id, name: workflows.name })
        .from(workflows)
        .where(eq(workflows.user_id, userId))
        .orderBy(workflows.name);
    }
  );

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[var(--bg)]"
      data-testid="activity-page"
    >
      <ActivityView
        userId={userId}
        initialEntries={initialEntries}
        initialCursor={initialCursor}
        initialGidTitles={initialGidTitles}
        initialFilters={filters}
        workflowOptions={workflowList}
        fetchError={fetchError}
      />
    </div>
  );
}
