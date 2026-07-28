/**
 * lib/activity/gid-titles.server.ts
 * Server-only resolver: Shopify GID → product title.
 *
 * Single source of truth used by every surface that renders agent-written
 * summaries (Activity, Workflows feed, Approvals, Chat). Given any set of
 * strings, it harvests the Product/ProductVariant GIDs they contain and
 * resolves each to the parent product's title (variant GIDs two-hop:
 * variant_gid → product_gid → title).
 *
 * SECURITY:
 *   - Uses serviceDb (bypasses RLS) but ALWAYS filters by the explicit user_id
 *     passed by the caller — same established pattern as writeActivity. Callers
 *     MUST pass the authenticated user's id.
 *   - Server-only module: imports serviceDb, and only server code (Server
 *     Actions / RSCs) imports it. Client components use the pure helpers in
 *     ./humanize-gids instead. (No `server-only` guard import — it would throw
 *     when the Vitest suite loads modules that transitively import this one.)
 */

import { and, eq, inArray } from "drizzle-orm";
import { serviceDb } from "@/lib/db/client";
import { shopifyProducts, shopifyProductVariants } from "@/lib/db/schema";
import { SHOPIFY_GID_RE } from "./humanize-gids";

/**
 * resolveGidTitles — harvest every Shopify GID in `texts` and resolve to the
 * parent product's title. Runs at most two indexed lookups. GIDs with no local
 * mirror row are simply absent from the map (callers fall back to a short label).
 *
 * @param userId — authenticated user UUID (explicit, never inferred)
 * @param texts  — any iterable of strings that may embed GIDs (summaries,
 *                 target ids, JSON-stringified state, etc.)
 */
export async function resolveGidTitles(
  userId: string,
  texts: Iterable<string>
): Promise<Record<string, string>> {
  const productGids = new Set<string>();
  const variantGids = new Set<string>();

  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(SHOPIFY_GID_RE)) {
      const [gid, kind] = match;
      if (kind === "ProductVariant") variantGids.add(gid);
      else productGids.add(gid);
    }
  }

  if (productGids.size === 0 && variantGids.size === 0) return {};

  const titles: Record<string, string> = {};

  // Resolve variant GIDs → parent product GID.
  const variantToProduct = new Map<string, string>();
  if (variantGids.size > 0) {
    const variantRows = await serviceDb
      .select({
        variant_gid: shopifyProductVariants.variant_gid,
        product_gid: shopifyProductVariants.product_gid,
      })
      .from(shopifyProductVariants)
      .where(
        and(
          eq(shopifyProductVariants.user_id, userId),
          inArray(shopifyProductVariants.variant_gid, [...variantGids])
        )
      );
    for (const row of variantRows) {
      variantToProduct.set(row.variant_gid, row.product_gid);
      productGids.add(row.product_gid);
    }
  }

  // Resolve all product GIDs → title.
  const productTitle = new Map<string, string>();
  if (productGids.size > 0) {
    const productRows = await serviceDb
      .select({
        product_gid: shopifyProducts.product_gid,
        title: shopifyProducts.title,
      })
      .from(shopifyProducts)
      .where(
        and(
          eq(shopifyProducts.user_id, userId),
          inArray(shopifyProducts.product_gid, [...productGids])
        )
      );
    for (const row of productRows) {
      if (row.title) productTitle.set(row.product_gid, row.title);
    }
  }

  for (const gid of productGids) {
    const t = productTitle.get(gid);
    if (t) titles[gid] = t;
  }
  for (const variantGid of variantGids) {
    const parent = variantToProduct.get(variantGid);
    const t = parent ? productTitle.get(parent) : undefined;
    if (t) titles[variantGid] = t;
  }

  return titles;
}
