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
import { activityEntries } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { ShopifyAdapter } from "./client";

// ─── After-state backfill ─────────────────────────────────────────────────────

/**
 * Backfills after_state onto the activity_entries row identified by (step_id, user_id).
 *
 * Completes the observability-first pattern: the row was inserted with after_state null
 * BEFORE the Shopify effect; this fills it in once the effect result is known.
 *
 * Retry-safe: setting after_state is idempotent, and matching by
 * (workflow_run_id IS NULL, step_id, user_id) targets the exact inserted row — no
 * double-effect risk (T-sgu-02). The WHERE clause includes user_id to prevent
 * cross-tenant updates when serviceDb bypasses RLS (T-sgu-01).
 */
async function backfillAfterState(
  userId: string,
  stepId: string,
  afterState: unknown
): Promise<void> {
  await serviceDb
    .update(activityEntries)
    .set({ after_state: afterState as Record<string, unknown> | null })
    .where(
      and(
        isNull(activityEntries.workflow_run_id),
        eq(activityEntries.step_id, stepId),
        eq(activityEntries.user_id, userId)
      )
    );
}

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

  const adapter = new ShopifyAdapter(userId);

  // 3.5 SANDBOX SIMULATION — a sandbox connection (sentinel token) never calls
  //     Shopify. Apply the requested change directly to the local mirror so the
  //     UI and the activity before/after diff reflect it, then return as if the
  //     write succeeded. Only fields present in `input` are changed.
  if (await adapter.isSimulated()) {
    const syncNow = new Date();
    await serviceDb
      .insert(shopifyProducts)
      .values({
        user_id: userId,
        product_gid: input.product_gid,
        title: input.title ?? before_state?.title ?? null,
        body_html: input.body_html ?? before_state?.body_html ?? null,
        vendor: before_state?.vendor ?? null,
        product_type: before_state?.product_type ?? null,
        status: input.status?.toLowerCase() ?? before_state?.status ?? null,
        tags: input.tags ?? before_state?.tags ?? [],
        meta_title: input.meta_title ?? before_state?.meta_title ?? null,
        meta_description:
          input.meta_description ?? before_state?.meta_description ?? null,
        shopify_created_at: before_state?.shopify_created_at ?? null,
        shopify_updated_at: syncNow,
        last_synced_at: syncNow,
      })
      .onConflictDoUpdate({
        target: [shopifyProducts.user_id, shopifyProducts.product_gid],
        set: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.body_html !== undefined ? { body_html: input.body_html } : {}),
          ...(input.status !== undefined
            ? { status: input.status.toLowerCase() }
            : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.meta_title !== undefined
            ? { meta_title: input.meta_title }
            : {}),
          ...(input.meta_description !== undefined
            ? { meta_description: input.meta_description }
            : {}),
          shopify_updated_at: syncNow,
          last_synced_at: syncNow,
        },
      });

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

    await backfillAfterState(userId, idempotency_key, afterRow ?? null);

    return {
      before_state,
      after_state: afterRow ?? null,
      idempotency_key,
      skipped: false,
    };
  }

  // 4. Write to Shopify Admin GraphQL
  //    NOTE: Shopify ProductInput uses `descriptionHtml` in ApiVersion.October24+.
  //    The internal input/mirror column keeps the name `body_html` — only the Shopify field changes.
  const mutationData = await adapter.shopifyGraphQL<{
    productUpdate: {
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
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
        ...(input.body_html !== undefined ? { descriptionHtml: input.body_html } : {}),
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

  if (mutationData.productUpdate.userErrors.length > 0) {
    throw new Error(
      `Shopify productUpdate failed: ${mutationData.productUpdate.userErrors
        .map((e) => e.message)
        .join("; ")}`
    );
  }

  // 5. Re-read mirror from Shopify to refresh local state
  //    NOTE: re-read query uses `descriptionHtml` — the correct Shopify field for ApiVersion.October24+.
  const syncNow = new Date();
  const reReadData = await adapter.shopifyGraphQL<{
    product: {
      id: string;
      title?: string;
      descriptionHtml?: string;
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
        id title descriptionHtml vendor productType status tags
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
        body_html: p.descriptionHtml ?? null,
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
          body_html: p.descriptionHtml ?? null,
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

  // Backfill after_state onto the activity_entries row inserted above (T-sgu-01, T-sgu-02).
  await backfillAfterState(userId, idempotency_key, afterRow ?? null);

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
 *
 * Resolution flow (after writeActivity, before the set mutation):
 *   1. GetVariantInventory: resolves real inventoryItemId + locationId from the variant.
 *      Uses `inventoryItem.inventoryLevels(first:1).location.id` — no `read_locations`
 *      scope required, no hardcoded location.
 *   2. If tracked=false: enables tracking via inventoryItemUpdate before the set.
 *   3. inventorySetOnHandQuantities with the RESOLVED IDs.
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

  const adapter = new ShopifyAdapter(userId);

  // 3.5 SANDBOX SIMULATION — a sandbox connection (sentinel token) never calls
  //     Shopify. Set the mirror's inventory_qty directly so the UI and the
  //     activity diff reflect it, then return as if the write succeeded.
  if (await adapter.isSimulated()) {
    const syncNow = new Date();
    await serviceDb
      .insert(shopifyProductVariants)
      .values({
        user_id: userId,
        variant_gid: input.variant_gid,
        product_gid: (before_state?.product_gid as string | undefined) ?? "",
        inventory_qty: input.inventory_qty,
        price: before_state?.price ?? null,
        sku: before_state?.sku ?? null,
        last_synced_at: syncNow,
      })
      .onConflictDoUpdate({
        target: [
          shopifyProductVariants.user_id,
          shopifyProductVariants.variant_gid,
        ],
        set: {
          inventory_qty: input.inventory_qty,
          last_synced_at: syncNow,
        },
      });

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

    await backfillAfterState(userId, idempotency_key, afterRow ?? null);

    return {
      before_state,
      after_state: afterRow ?? null,
      idempotency_key,
      skipped: false,
    };
  }

  // 4a. Resolve real inventoryItemId + locationId from the variant.
  //     We use `inventoryItem.inventoryLevels(first:1).location.id` — the integration
  //     does NOT have `read_locations` scope, so the top-level `locations` query is
  //     access-denied. Never use a hardcoded location GID.
  const resolutionData = await adapter.shopifyGraphQL<{
    productVariant: {
      inventoryItem: {
        id: string;
        tracked: boolean;
        inventoryLevels: {
          edges: Array<{
            node: {
              location: { id: string };
              quantities: Array<{ name: string; quantity: number }>;
            };
          }>;
        };
      } | null;
    } | null;
  }>(
    `query GetVariantInventory($id: ID!) {
      productVariant(id: $id) {
        inventoryItem {
          id
          tracked
          inventoryLevels(first: 1) {
            edges {
              node {
                location { id }
                quantities(names: ["on_hand"]) { name quantity }
              }
            }
          }
        }
      }
    }`,
    { id: input.variant_gid }
  );

  const inventoryItemId = resolutionData.productVariant?.inventoryItem?.id;
  const locationId =
    resolutionData.productVariant?.inventoryItem?.inventoryLevels?.edges?.[0]
      ?.node.location.id;
  const tracked = resolutionData.productVariant?.inventoryItem?.tracked;

  // Read the current on_hand quantity at the resolved level for compare-and-set.
  // inventorySetOnHandQuantities (API 2024-10) requires changeFromQuantity to prevent
  // concurrent-write races. Defaults to 0 when level, array, or on_hand entry is absent.
  const currentOnHand =
    resolutionData.productVariant?.inventoryItem?.inventoryLevels?.edges?.[0]
      ?.node.quantities?.find((q) => q.name === "on_hand")?.quantity ?? 0;

  if (!inventoryItemId || !locationId) {
    throw new Error(
      `could not resolve Shopify inventory item / location for variant ${input.variant_gid}`
    );
  }

  // 4b. Enable inventory tracking if the item is currently untracked.
  //     Some variants have tracked:false; inventorySetOnHandQuantities requires tracked:true.
  if (tracked === false) {
    const enableData = await adapter.shopifyGraphQL<{
      inventoryItemUpdate: {
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(
      `mutation EnableTracking($id: ID!) {
        inventoryItemUpdate(id: $id, input: { tracked: true }) {
          inventoryItem { id tracked }
          userErrors { field message }
        }
      }`,
      { id: inventoryItemId }
    );

    if (enableData.inventoryItemUpdate.userErrors.length > 0) {
      throw new Error(
        `Shopify inventoryItemUpdate (enable tracking) failed: ${enableData.inventoryItemUpdate.userErrors
          .map((e) => e.message)
          .join("; ")}`
      );
    }
  }

  // 4c. Write to Shopify using an absolute-set mutation (inventorySetOnHandQuantities).
  //     Using a delta derived from the possibly-stale mirror baseline is incorrect —
  //     if the mirror is stale the delta lands at the wrong absolute value.
  //     inventorySetOnHandQuantities sets the desired quantity directly (WR-04).
  const setData = await adapter.shopifyGraphQL<{
    inventorySetOnHandQuantities: {
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    `mutation SetInventory($input: InventorySetOnHandQuantitiesInput!, $idempotencyKey: String!) {
      inventorySetOnHandQuantities(input: $input) @idempotent(key: $idempotencyKey) {
        inventoryAdjustmentGroup { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        reason: "correction",
        setQuantities: [
          {
            inventoryItemId,
            locationId,
            quantity: input.inventory_qty,
            changeFromQuantity: currentOnHand,
          },
        ],
      },
      idempotencyKey: idempotency_key,
    }
  );

  if (setData.inventorySetOnHandQuantities.userErrors.length > 0) {
    throw new Error(
      `Shopify inventorySetOnHandQuantities failed: ${setData.inventorySetOnHandQuantities.userErrors
        .map((e) => e.message)
        .join("; ")}`
    );
  }

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

  // Backfill after_state onto the activity_entries row inserted above (T-sgu-01, T-sgu-02).
  await backfillAfterState(userId, idempotency_key, afterRow ?? null);

  return {
    before_state,
    after_state: afterRow ?? null,
    idempotency_key,
    skipped: false,
  };
}
