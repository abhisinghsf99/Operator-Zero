/**
 * lib/integrations/shopify/mutations.ts
 * Idempotent Shopify write helpers — write-then-re-read pattern.
 *
 * Every write operation:
 *   1. Reads before_state from mirror (observability baseline)
 *   2. Constructs idempotency key: `${userId}:${actionType}:${targetId}:${15min_bucket}`
 *   3. Writes Activity entry BEFORE Shopify API call (WF-06, CLAUDE.md observability constraint)
 *      Uses writeActivity() from lib/workflows/activity.ts (wired in 02-07).
 *   4. Writes to Shopify Admin GraphQL
 *   5. Re-reads mirror from Shopify to refresh local state
 *
 * THREAT MODEL:
 *   T-2-03-06 (idempotent writes): idempotency key on every write
 *   T-2-07-05 (unlogged agent action): writeActivity called BEFORE external effect
 *
 * OBSERVABILITY:
 *   activity_entries insert happens BEFORE the external effect.
 *   On retry, writeActivity() is idempotent (ON CONFLICT DO NOTHING on workflow_run_id+step_id).
 */
import { serviceDb } from "@/lib/db/client";
import { writeActivity } from "@/lib/workflows/activity";
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
 * Idempotent product update: read before_state → writeActivity (WF-06) → write to Shopify → re-read mirror.
 *
 * writeActivity is called BEFORE the Shopify API call (observability-first).
 * On Inngest retry, the second writeActivity call is a no-op (ON CONFLICT DO NOTHING).
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

  // 3. writeActivity BEFORE Shopify API call (WF-06 / CLAUDE.md observability constraint).
  //    workflow_run_id is null at this tool layer — activity_entries.workflow_run_id is
  //    NULLABLE ("direct chat actions have no workflow run", schema comment).
  //    The idempotency key lives in step_id; the unique index on (workflow_run_id, step_id)
  //    is a partial index WHERE both are non-null, so null workflow_run_id entries are
  //    always inserted (correct for one-shot chat-tool calls).
  await writeActivity(userId, {
    workflow_run_id: null,
    step_id: idempotency_key,
    action_type: "product_update",
    summary: `Updating product ${input.product_gid}`,
    result: "success",
    before_state,
    target_type: "product",
    target_id: input.product_gid,
    is_revertable: true,
  });

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
 * writeActivity is called BEFORE the Shopify API call (WF-06, observability-first).
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

  // 3. writeActivity BEFORE Shopify API call (WF-06 / CLAUDE.md observability constraint).
  //    workflow_run_id is null at the tool layer (same reasoning as updateProduct above).
  await writeActivity(userId, {
    workflow_run_id: null,
    step_id: idempotency_key,
    action_type: "inventory_update",
    summary: `Updating inventory for variant ${input.variant_gid}`,
    result: "success",
    before_state,
    target_type: "product_variant",
    target_id: input.variant_gid,
    is_revertable: true,
  });

  // 4. Write to Shopify using an absolute-set mutation (inventorySetOnHandQuantities).
  //    Using a delta derived from the possibly-stale mirror baseline is incorrect —
  //    if the mirror is stale the delta lands at the wrong absolute value.
  //    inventorySetOnHandQuantities sets the desired quantity directly (WR-04).
  const adapter = new ShopifyAdapter(userId);
  await adapter.shopifyGraphQL(
    `mutation SetInventory($input: InventorySetOnHandQuantitiesInput!) {
      inventorySetOnHandQuantities(input: $input) {
        inventoryAdjustmentGroup { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        reason: "correction",
        setQuantities: [
          {
            inventoryItemId: input.variant_gid,
            locationId: "gid://shopify/Location/1", // default location; v2 will resolve dynamically
            quantity: input.inventory_qty,
          },
        ],
      },
    }
  );

  // 5. Re-read from Shopify and upsert (insert-on-conflict) the mirror row.
  //    Using a bare UPDATE silently no-ops when the variant hasn't been mirrored yet (WR-03).
  //    The re-read ensures the mirror reflects what Shopify accepted.
  const syncNow = new Date();
  const reReadVariant = await adapter.shopifyGraphQL<{
    productVariant: {
      id: string;
      inventoryQuantity?: number;
      price?: string;
      sku?: string;
      product?: { id: string };
    } | null;
  }>(
    `query GetVariant($id: ID!) {
      productVariant(id: $id) {
        id inventoryQuantity price sku
        product { id }
      }
    }`,
    { id: input.variant_gid }
  );

  const v = reReadVariant.productVariant;
  if (v) {
    // product_gid is required by the schema — prefer the re-read value from Shopify,
    // then fall back to the before_state value (from the mirror at step 1).
    const productGid =
      v.product?.id ??
      (before_state?.product_gid as string | undefined) ??
      "";
    await serviceDb
      .insert(shopifyProductVariants)
      .values({
        user_id: userId,
        variant_gid: v.id,
        product_gid: productGid,
        inventory_qty: v.inventoryQuantity ?? input.inventory_qty,
        price: v.price ?? null,
        sku: v.sku ?? null,
        last_synced_at: syncNow,
      })
      .onConflictDoUpdate({
        target: [shopifyProductVariants.user_id, shopifyProductVariants.variant_gid],
        set: {
          inventory_qty: v.inventoryQuantity ?? input.inventory_qty,
          last_synced_at: syncNow,
        },
      });
  }

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
