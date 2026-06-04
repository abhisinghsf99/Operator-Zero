"use server";

/**
 * app/app/activity/actions.ts
 * Server Action for Activity log cursor pagination.
 *
 * fetchActivityPage — fetch a cursor-paginated page of activity entries
 *   (LIMIT 50, ordered occurred_at DESC, id DESC) with AND-combined filters
 *   and an optional shopify_updated_at join for product/page targets.
 *
 * SECURITY:
 *   - getClaims() verifies the session
 *   - withUserRls() enforces row-level security
 *   - Re-filters by user_id regardless of cursor value (T-3-04-03)
 *   - Cursor (occurred_at, id) from client is never trusted for ownership
 *
 * NOTE: This file handles ONLY cursor pagination. Revert / bulk-revert /
 *   saveAsWorkflow are in lib/actions/activity.ts (plan 01 — do not duplicate).
 */

import { z } from "zod";
import { eq, and, lt, or, gte, lte, inArray } from "drizzle-orm";
import { createClient } from "@/lib/auth/server";
import { withUserRls } from "@/lib/db/client";
import { activityEntries, shopifyProducts, workflows } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { resolveGidTitles } from "@/lib/activity/gid-titles.server";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityFilters {
  workflowId?: string;
  result?: string;
  automationLevel?: string;
  dateFrom?: string; // ISO date string
  dateTo?: string;   // ISO date string
}

export interface ActivityCursor {
  occurred_at: string; // ISO timestamp
  id: string;
}

export interface ActivityEntryRow {
  id: string;
  user_id: string;
  workflow_run_id: string | null;
  workflow_id: string | null;
  thread_id: string | null;
  agent_context: string | null;
  action_type: string;
  action_summary: string;
  result: string;
  result_details: string | null;
  automation_level: string | null;
  before_state: unknown;
  after_state: unknown;
  reasoning_chain: unknown;
  reasoning_chain_url: string | null;
  target_type: string | null;
  target_id: string | null;
  step_id: string | null;
  is_revertable: boolean;
  reverted_at: Date | null;
  reverted_by_entry_id: string | null;
  occurred_at: Date;
  // Joined from shopify_products for product/page targets (drift check)
  shopifyUpdatedAt?: Date | null;
  // Workflow name for display
  workflowName?: string | null;
}

// ─── Input schema ─────────────────────────────────────────────────────────────

const FetchActivityPageSchema = z.object({
  cursor: z
    .object({
      occurred_at: z.string(),
      id: z.string().uuid(),
    })
    .nullable()
    .optional(),
  filters: z
    .object({
      workflowId: z.string().uuid().optional(),
      result: z.string().optional(),
      automationLevel: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })
    .optional(),
});

// ─── requireAuth helper ───────────────────────────────────────────────────────

async function requireAuth(): Promise<{
  userId: string;
  claims: Record<string, unknown>;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Not authenticated");
  }
  return { userId, claims: data.claims as Record<string, unknown> };
}

// ─── fetchActivityPage ────────────────────────────────────────────────────────

export type FetchActivityPageResult =
  | {
      entries: ActivityEntryRow[];
      nextCursor: ActivityCursor | null;
      /**
       * Map of Shopify GID → resolved product title for every Product/
       * ProductVariant GID referenced by this page's entries. Variant GIDs
       * resolve to their parent product's title. Consumed at render time to
       * humanize summaries and the before/after diff. GIDs with no local
       * mirror row are simply absent (the client falls back to a short label).
       */
      gidTitles: Record<string, string>;
    }
  | { error: string };


/**
 * fetchActivityPage — cursor-paginated activity entries with AND filters.
 *
 * Pattern 5 (RESEARCH.md): cursor keyed on (occurred_at DESC, id DESC),
 * page size 50, AND-combined WHERE conditions.
 * Re-filters by user_id regardless of cursor (T-3-04-03).
 *
 * For product/page targets, joins shopify_products to get shopify_updated_at
 * so the client-side canRevert drift check has the value.
 *
 * @param cursor  - last entry cursor (null = first page)
 * @param filters - AND-combined filter conditions
 */
export async function fetchActivityPage(
  cursor: ActivityCursor | null,
  filters?: ActivityFilters
): Promise<FetchActivityPageResult> {
  const parsed = FetchActivityPageSchema.safeParse({ cursor, filters });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await requireAuth());
  } catch {
    return { error: "Not authenticated" };
  }

  try {
    const result = await withUserRls(claims, async (tx) => {
      const PAGE_SIZE = 50;

      // Build AND conditions (Pattern 5: RESEARCH.md)
      // Always include user_id filter — never trust cursor for ownership (T-3-04-03)
      const conditions: ReturnType<typeof eq>[] = [
        eq(activityEntries.user_id, userId),
      ];

      // Cursor condition: (occurred_at, id) keyed cursor for stable pagination
      if (cursor) {
        const cursorOccurredAt = new Date(cursor.occurred_at);
        conditions.push(
          or(
            lt(activityEntries.occurred_at, cursorOccurredAt),
            and(
              sql`${activityEntries.occurred_at} = ${cursorOccurredAt}`,
              lt(activityEntries.id, cursor.id)
            )!
          )!
        );
      }

      // AND-combined filter conditions
      if (filters?.workflowId) {
        conditions.push(eq(activityEntries.workflow_id, filters.workflowId));
      }
      if (filters?.result) {
        conditions.push(eq(activityEntries.result, filters.result));
      }
      if (filters?.automationLevel) {
        conditions.push(
          eq(activityEntries.automation_level, filters.automationLevel)
        );
      }
      if (filters?.dateFrom) {
        conditions.push(
          gte(activityEntries.occurred_at, new Date(filters.dateFrom))
        );
      }
      if (filters?.dateTo) {
        conditions.push(
          lte(activityEntries.occurred_at, new Date(filters.dateTo))
        );
      }

      // Fetch entries (ordered occurred_at DESC, id DESC for stable cursor)
      const entries = await tx
        .select()
        .from(activityEntries)
        .where(and(...conditions))
        .orderBy(
          sql`${activityEntries.occurred_at} DESC`,
          sql`${activityEntries.id} DESC`
        )
        .limit(PAGE_SIZE);

      if (entries.length === 0) {
        return {
          entries: [] as ActivityEntryRow[],
          nextCursor: null,
          gidTitles: {} as Record<string, string>,
        };
      }

      // Fetch shopify_updated_at for product/page targets in one join query
      // (WARNING 2: client-side canRevert drift check needs this value)
      const productOrPageEntries = entries.filter(
        (e) =>
          (e.target_type === "product" || e.target_type === "page") &&
          e.target_id
      );

      const shopifyMap = new Map<string, Date | null>();
      if (productOrPageEntries.length > 0) {
        const targetIds = productOrPageEntries.map((e) => e.target_id!);
        const shopifyRows = await tx
          .select({
            product_gid: shopifyProducts.product_gid,
            shopify_updated_at: shopifyProducts.shopify_updated_at,
          })
          .from(shopifyProducts)
          .where(
            and(
              eq(shopifyProducts.user_id, userId),
              inArray(shopifyProducts.product_gid, targetIds)
            )
          );
        for (const row of shopifyRows) {
          shopifyMap.set(row.product_gid, row.shopify_updated_at);
        }
      }

      // Fetch workflow names for display in activity rows
      const workflowIds = [
        ...new Set(entries.filter((e) => e.workflow_id).map((e) => e.workflow_id!)),
      ];
      const workflowNameMap = new Map<string, string>();
      if (workflowIds.length > 0) {
        const wfRows = await tx
          .select({ id: workflows.id, name: workflows.name })
          .from(workflows)
          .where(
            and(
              eq(workflows.user_id, userId),
              inArray(workflows.id, workflowIds)
            )
          );
        for (const wf of wfRows) {
          workflowNameMap.set(wf.id, wf.name);
        }
      }

      // Merge shopify_updated_at into entries
      const enrichedEntries: ActivityEntryRow[] = entries.map((e) => ({
        ...e,
        shopifyUpdatedAt:
          (e.target_type === "product" || e.target_type === "page") && e.target_id
            ? (shopifyMap.get(e.target_id) ?? null)
            : undefined,
        workflowName: e.workflow_id ? (workflowNameMap.get(e.workflow_id) ?? null) : null,
      }));

      // Resolve Product/ProductVariant GIDs → product titles for clean display
      const gidTitles = await resolveGidTitles(
        userId,
        enrichedEntries.flatMap((e) => [
          e.action_summary,
          e.target_id ?? "",
          e.before_state ? JSON.stringify(e.before_state) : "",
          e.after_state ? JSON.stringify(e.after_state) : "",
        ])
      );

      // Compute next cursor from last entry (if we got a full page)
      const nextCursor: ActivityCursor | null =
        entries.length === PAGE_SIZE
          ? {
              occurred_at: entries[entries.length - 1]!.occurred_at.toISOString(),
              id: entries[entries.length - 1]!.id,
            }
          : null;

      return { entries: enrichedEntries, nextCursor, gidTitles };
    });

    return result;
  } catch (err) {
    return { error: String(err) };
  }
}
