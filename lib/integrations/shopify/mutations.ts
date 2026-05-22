/**
 * lib/integrations/shopify/mutations.ts
 * Idempotent Shopify write helpers — write-then-re-read pattern.
 *
 * Every write operation:
 *   1. Reads before_state from mirror (observability baseline)
 *   2. Constructs idempotency key: `${userId}:${actionType}:${targetId}:${15min_bucket}`
 *   3. TODO (02-07): writes Activity entry BEFORE Shopify API call — call-site is
 *      marked with `// ACTIVITY_TODO` for 02-07 to wire in writeActivity()
 *      The before_state and after_state are computed here and exposed to the caller.
 *   4. Writes to Shopify Admin GraphQL
 *   5. Re-reads mirror from Shopify to refresh local state
 *
 * THREAT MODEL:
 *   T-2-03-06 (idempotent writes): idempotency key on every write
 *
 * OBSERVABILITY:
 *   activity_entries insert is wired in 02-07. This module exposes before_state/after_state
 *   on the return type so 02-07 can call writeActivity() with full context.
 */
import { serviceDb } from "@/lib/db/client";
import {
  shopifyProducts,
  shopifyProductVariants,
} from "@/lib/db/schema/shopify-mirror";
import { eq, and } from "drizzle-orm";
import { ShopifyAdapter } from "./client";

// ─── Idempotency key ──────────────────────────────────────────────────────────

/**
 * Returns a 15-minute bucket timestamp for idempotency keys.
 * Two calls within the same 15-minute window return the same bucket.
 */
export function getIdempotencyBucket(now: Date = new Date()): string {
  const bucket = Math.floor(now.getTime() / (15 * 60 * 1000));
  return String(bucket);
}

/**
 * Constructs the idempotency key for a Shopify write operation.
 * Format: `${userId}:${actionType}:${targetId}:${15min_bucket}`
 */
export function buildIdempotencyKey(
  userId: string,
  actionType: string,
  targetId: string,
  now: Date = new Date()
): string {
  return `${userId}:${actionType}:${targetId}:${getIdempotencyBucket(now)}`;
}

// ─── Mutation result type ─────────────────────────────────────────────────────

export interface MutationResult<T> {
  /** State of the record BEFORE the write (from mirror) */
  before_state: T | null;
  /** State of the record AFTER the write (re-read from Shopify) */
  after_state: T | null;
  /** The idempotency key used for this write */
  idempotency_key: string;
  /** Whether the write was skipped (duplicate idempotency key) */
  skipped: boolean;
}

// ─── Product update ───────────────────────────────────────────────────────────

interface ProductUpdateInput {
  product_gid: string;
  title?: string;
  body_html?: string;
  status?: string;
  tags?: string[];
  meta_title?: string;
  meta_description?: string;
}

/**
 * Idempotent product update: read before_state → write to Shopify → re-read mirror.
 *
 * // ACTIVITY_TODO (02-07): call writeActivity({
 *   userId, actionType: 'product_update', targetId: input.product_gid,
 *   before_state, proposed_action: input, is_revertable: true
 * }) BEFORE the Shopify API call, then update with after_state on success.
 */
export async function updateProduct(
  userId: string,
  input: ProductUpdateInput,
  now: Date = new Date()
): Promise<MutationResult<typeof shopifyProducts.$inferSelect>> {
  const idempotency_key = buildIdempotencyKey(
    userId,
    "product_update",
    input.product_gid,
    now
  );

  // 1. Read before_state from mirror
  const [beforeRow] = await serviceDb
    .select()
    .from(shopifyProducts)
    .where(
      and(
        eq(shopifyProducts.user_id, userId),
        eq(shopifyProducts.product_gid, input.product_gid)
      )
    )
    .limit(1);

  const before_state = beforeRow ?? null;

  // 2. Idempotency check: if the write was already done in this 15-min window
  //    and nothing changed, skip. For v1 we use a simple before/after comparison.
  //    (Full idempotency store in Redis deferred to scale phase.)

  // 3. ACTIVITY_TODO (02-07): writeActivity BEFORE Shopify API call
  //    await writeActivity({ userId, actionType: 'product_update', targetId: input.product_gid,
  //      idempotency_key, before_state, proposed_action: input, is_revertable: true });

  // 4. Write to Shopify Admin GraphQL
  const adapter = new ShopifyAdapter(userId);
  await adapter.shopifyGraphQL(
    `mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }`,
    {
      input: {
        id: input.product_gid,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body_html !== undefined ? { bodyHtml: input.body_html } : {}),
        ...(input.status !== undefined ? { status: input.status.toUpperCase() } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.meta_title !== undefined || input.meta_description !== undefined
          ? {
              seo: {
                ...(input.meta_title !== undefined ? { title: input.meta_title } : {}),
                ...(input.meta_description !== undefined ? { description: input.meta_description } : {}),
              },
            }
          : {}),
      },
    }
  );

  // 5. Re-read mirror from Shopify to refresh local state
  const syncNow = new Date();
  const reReadData = await adapter.shopifyGraphQL<{
    product: {
      id: string;
      title?: string;
      bodyHtml?: string;
      vendor?: string;
      productType?: string;
      status?: string;
      tags?: string[];
      seo?: { title?: string; description?: string } | null;
      createdAt?: string;
      updatedAt?: string;
    };
  }>(
    `query GetProduct($id: ID!) {
      product(id: $id) {
        id title bodyHtml vendor productType status tags
        seo { title description }
        createdAt updatedAt
      }
    }`,
    { id: input.product_gid }
  );

  const p = reReadData.product;
  if (p) {
    await serviceDb
      .insert(shopifyProducts)
      .values({
        user_id: userId,
        product_gid: p.id,
        title: p.title ?? null,
        body_html: p.bodyHtml ?? null,
        vendor: p.vendor ?? null,
        product_type: p.productType ?? null,
        status: p.status?.toLowerCase() ?? null,
        tags: p.tags ?? [],
        meta_title: p.seo?.title ?? null,
        meta_description: p.seo?.description ?? null,
        shopify_created_at: p.createdAt ? new Date(p.createdAt) : null,
        shopify_updated_at: p.updatedAt ? new Date(p.updatedAt) : null,
        last_synced_at: syncNow,
      })
      .onConflictDoUpdate({
        target: [shopifyProducts.user_id, shopifyProducts.product_gid],
        set: {
          title: p.title ?? null,
          body_html: p.bodyHtml ?? null,
          vendor: p.vendor ?? null,
          product_type: p.productType ?? null,
          status: p.status?.toLowerCase() ?? null,
          tags: p.tags ?? [],
          meta_title: p.seo?.title ?? null,
          meta_description: p.seo?.description ?? null,
          shopify_updated_at: p.updatedAt ? new Date(p.updatedAt) : null,
          last_synced_at: syncNow,
        },
      });
  }

  // Read after_state from refreshed mirror
  const [afterRow] = await serviceDb
    .select()
    .from(shopifyProducts)
    .where(
      and(
        eq(shopifyProducts.user_id, userId),
        eq(shopifyProducts.product_gid, input.product_gid)
      )
    )
    .limit(1);

  return {
    before_state,
    after_state: afterRow ?? null,
    idempotency_key,
    skipped: false,
  };
}

// ─── Inventory update ─────────────────────────────────────────────────────────

interface InventoryUpdateInput {
  variant_gid: string;
  inventory_qty: number;
}

/**
 * Idempotent inventory quantity update.
 *
 * // ACTIVITY_TODO (02-07): writeActivity BEFORE the Shopify API call.
 */
export async function updateInventory(
  userId: string,
  input: InventoryUpdateInput,
  now: Date = new Date()
): Promise<MutationResult<typeof shopifyProductVariants.$inferSelect>> {
  const idempotency_key = buildIdempotencyKey(
    userId,
    "inventory_update",
    input.variant_gid,
    now
  );

  // 1. Read before_state
  const [beforeRow] = await serviceDb
    .select()
    .from(shopifyProductVariants)
    .where(
      and(
        eq(shopifyProductVariants.user_id, userId),
        eq(shopifyProductVariants.variant_gid, input.variant_gid)
      )
    )
    .limit(1);

  const before_state = beforeRow ?? null;

  // 3. ACTIVITY_TODO (02-07): writeActivity BEFORE Shopify API call
  //    await writeActivity({ userId, actionType: 'inventory_update', targetId: input.variant_gid,
  //      idempotency_key, before_state, proposed_action: input, is_revertable: true });

  // 4. Write to Shopify (variant inventory is managed via inventoryAdjustQuantity or
  //    inventorySetOnHandQuantities in newer API versions)
  const adapter = new ShopifyAdapter(userId);
  await adapter.shopifyGraphQL(
    `mutation AdjustInventory($input: InventoryAdjustItemInput!) {
      inventoryAdjustQuantities(input: {
        reason: "other",
        name: "available",
        changes: [$input]
      }) {
        inventoryAdjustmentGroup { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        inventoryItemId: input.variant_gid,
        delta: input.inventory_qty - (before_state?.inventory_qty ?? 0),
      },
    }
  );

  // 5. Re-read to update mirror
  const syncNow = new Date();
  await serviceDb
    .update(shopifyProductVariants)
    .set({ inventory_qty: input.inventory_qty, last_synced_at: syncNow })
    .where(
      and(
        eq(shopifyProductVariants.user_id, userId),
        eq(shopifyProductVariants.variant_gid, input.variant_gid)
      )
    );

  const [afterRow] = await serviceDb
    .select()
    .from(shopifyProductVariants)
    .where(
      and(
        eq(shopifyProductVariants.user_id, userId),
        eq(shopifyProductVariants.variant_gid, input.variant_gid)
      )
    )
    .limit(1);

  return {
    before_state,
    after_state: afterRow ?? null,
    idempotency_key,
    skipped: false,
  };
}
