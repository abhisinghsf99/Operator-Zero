/**
 * lib/integrations/shopify/sync.ts
 * Shopify full-sync and incremental polling — Inngest-tier only.
 *
 * Provides:
 *   - shopifyFullSyncForUser(userId): paginate GraphQL → UPSERT mirror tables
 *   - shopifyIncrementalSyncForUser(userId): lighter sync for polling fallback
 *   - registerWebhooks(userId): register webhook subscriptions via Admin GraphQL
 *
 * Uses serviceDb (bypasses RLS) + explicit user_id filter on every query.
 *
 * MULTI-TENANT: every UPSERT includes user_id. No cross-tenant writes.
 *
 * THREAT MODEL:
 *   T-2-03-06 (idempotent writes): UPSERTs on composite PK (user_id, *_gid)
 */
import { serviceDb } from "@/lib/db/client";
import {
  shopifyProducts,
  shopifyProductVariants,
  shopifyOrders,
  shopifyPages,
  shopifyRedirects,
  shopifySyncState,
} from "@/lib/db/schema/shopify-mirror";
import { integrations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ShopifyAdapter } from "./client";

// ─── GraphQL query fragments ──────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query GetProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        bodyHtml
        vendor
        productType
        status
        tags
        seo { title description }
        createdAt
        updatedAt
        variants(first: 100) {
          nodes {
            id
            sku
            price
            inventoryQuantity
          }
        }
      }
    }
  }
`;

const ORDERS_QUERY = `
  query GetOrders($cursor: String) {
    orders(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        totalPriceSet { shopMoney { amount } }
        financialStatus
        fulfillmentStatus
        createdAt
      }
    }
  }
`;

const PAGES_QUERY = `
  query GetPages($cursor: String) {
    pages(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        body
        handle
      }
    }
  }
`;

const REDIRECTS_QUERY = `
  query GetRedirects($cursor: String) {
    urlRedirects(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        path
        target
      }
    }
  }
`;

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ProductNode {
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
  variants?: {
    nodes: Array<{
      id: string;
      sku?: string;
      price?: string;
      inventoryQuantity?: number | null;
    }>;
  };
}

interface OrderNode {
  id: string;
  totalPriceSet?: { shopMoney?: { amount?: string } } | null;
  financialStatus?: string;
  fulfillmentStatus?: string;
  createdAt?: string;
}

interface PageNode {
  id: string;
  title?: string;
  body?: string;
  handle?: string;
}

interface RedirectNode {
  id: string;
  path?: string;
  target?: string;
}

// ─── Paginated fetch helper ────────────────────────────────────────────────────

type PagedResponse<T> = Record<string, { pageInfo: PageInfo; nodes: T[] }>;

async function fetchAllPages<T>(
  adapter: ShopifyAdapter,
  query: string,
  dataKey: string
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;

  while (true) {
    const data: PagedResponse<T> = await adapter.shopifyGraphQL<PagedResponse<T>>(
      query,
      cursor ? { cursor } : {}
    );

    const connection: { pageInfo: PageInfo; nodes: T[] } | undefined = data[dataKey];
    if (!connection) break;

    all.push(...connection.nodes);

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      break;
    }
    cursor = connection.pageInfo.endCursor;
  }

  return all;
}

// ─── Full sync ────────────────────────────────────────────────────────────────

/**
 * Full sync for a single user: fetches all Shopify data and UPSERTs into mirror.
 * Idempotent — safe to run multiple times; composite PK handles conflicts.
 */
export async function shopifyFullSyncForUser(userId: string): Promise<void> {
  const adapter = new ShopifyAdapter(userId);
  const now = new Date();

  // ── Products + variants ──────────────────────────────────────────────────
  let productCount = 0;
  try {
    const products = await fetchAllPages<ProductNode>(adapter, PRODUCTS_QUERY, "products");

    for (const product of products) {
      await serviceDb
        .insert(shopifyProducts)
        .values({
          user_id: userId,
          product_gid: product.id,
          title: product.title ?? null,
          body_html: product.bodyHtml ?? null,
          vendor: product.vendor ?? null,
          product_type: product.productType ?? null,
          status: product.status?.toLowerCase() ?? null,
          tags: product.tags ?? [],
          meta_title: product.seo?.title ?? null,
          meta_description: product.seo?.description ?? null,
          shopify_created_at: product.createdAt ? new Date(product.createdAt) : null,
          shopify_updated_at: product.updatedAt ? new Date(product.updatedAt) : null,
          last_synced_at: now,
        })
        .onConflictDoUpdate({
          target: [shopifyProducts.user_id, shopifyProducts.product_gid],
          set: {
            title: product.title ?? null,
            body_html: product.bodyHtml ?? null,
            vendor: product.vendor ?? null,
            product_type: product.productType ?? null,
            status: product.status?.toLowerCase() ?? null,
            tags: product.tags ?? [],
            meta_title: product.seo?.title ?? null,
            meta_description: product.seo?.description ?? null,
            shopify_created_at: product.createdAt ? new Date(product.createdAt) : null,
            shopify_updated_at: product.updatedAt ? new Date(product.updatedAt) : null,
            last_synced_at: now,
          },
        });

      productCount++;

      // Variants
      if (product.variants?.nodes) {
        for (const variant of product.variants.nodes) {
          await serviceDb
            .insert(shopifyProductVariants)
            .values({
              user_id: userId,
              variant_gid: variant.id,
              product_gid: product.id,
              sku: variant.sku ?? null,
              price: variant.price ?? null,
              inventory_qty: variant.inventoryQuantity ?? null,
              last_synced_at: now,
            })
            .onConflictDoUpdate({
              target: [shopifyProductVariants.user_id, shopifyProductVariants.variant_gid],
              set: {
                product_gid: product.id,
                sku: variant.sku ?? null,
                price: variant.price ?? null,
                inventory_qty: variant.inventoryQuantity ?? null,
                last_synced_at: now,
              },
            });
        }
      }
    }
  } catch (err) {
    // Log but continue — partial sync is better than no sync
    console.log(
      JSON.stringify({
        level: "error",
        event: "shopify.sync.products_failed",
        userId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
  }

  // ── Orders ───────────────────────────────────────────────────────────────
  try {
    const orders = await fetchAllPages<OrderNode>(adapter, ORDERS_QUERY, "orders");

    for (const order of orders) {
      await serviceDb
        .insert(shopifyOrders)
        .values({
          user_id: userId,
          order_gid: order.id,
          total: order.totalPriceSet?.shopMoney?.amount ?? null,
          financial_status: order.financialStatus ?? null,
          fulfillment_status: order.fulfillmentStatus ?? null,
          shopify_created_at: order.createdAt ? new Date(order.createdAt) : null,
          last_synced_at: now,
        })
        .onConflictDoUpdate({
          target: [shopifyOrders.user_id, shopifyOrders.order_gid],
          set: {
            total: order.totalPriceSet?.shopMoney?.amount ?? null,
            financial_status: order.financialStatus ?? null,
            fulfillment_status: order.fulfillmentStatus ?? null,
            shopify_created_at: order.createdAt ? new Date(order.createdAt) : null,
            last_synced_at: now,
          },
        });
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "error",
        event: "shopify.sync.orders_failed",
        userId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
  }

  // ── Pages ────────────────────────────────────────────────────────────────
  try {
    const pages = await fetchAllPages<PageNode>(adapter, PAGES_QUERY, "pages");

    for (const page of pages) {
      await serviceDb
        .insert(shopifyPages)
        .values({
          user_id: userId,
          page_gid: page.id,
          title: page.title ?? null,
          body_html: page.body ?? null,
          handle: page.handle ?? null,
          last_synced_at: now,
        })
        .onConflictDoUpdate({
          target: [shopifyPages.user_id, shopifyPages.page_gid],
          set: {
            title: page.title ?? null,
            body_html: page.body ?? null,
            handle: page.handle ?? null,
            last_synced_at: now,
          },
        });
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "error",
        event: "shopify.sync.pages_failed",
        userId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
  }

  // ── Redirects ────────────────────────────────────────────────────────────
  try {
    const redirects = await fetchAllPages<RedirectNode>(adapter, REDIRECTS_QUERY, "urlRedirects");

    for (const redirect of redirects) {
      await serviceDb
        .insert(shopifyRedirects)
        .values({
          user_id: userId,
          redirect_id: redirect.id,
          path: redirect.path ?? null,
          target: redirect.target ?? null,
          last_synced_at: now,
        })
        .onConflictDoUpdate({
          target: [shopifyRedirects.user_id, shopifyRedirects.redirect_id],
          set: {
            path: redirect.path ?? null,
            target: redirect.target ?? null,
            last_synced_at: now,
          },
        });
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "error",
        event: "shopify.sync.redirects_failed",
        userId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
  }

  // ── Update sync state ────────────────────────────────────────────────────
  await serviceDb
    .insert(shopifySyncState)
    .values({
      user_id: userId,
      last_full_sync_at: now,
      sync_status: "healthy",
    })
    .onConflictDoUpdate({
      target: [shopifySyncState.user_id],
      set: {
        last_full_sync_at: now,
        sync_status: "healthy",
      },
    });

  console.log(
    JSON.stringify({
      level: "info",
      event: "shopify.sync.full_sync_complete",
      userId,
      productCount,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Incremental sync for polling fallback — re-runs products sync for products
 * updated since last poll. For simplicity in v1, runs the same full sync.
 * Future: use updatedAt cursor for efficiency.
 */
export async function shopifyIncrementalSyncForUser(userId: string): Promise<void> {
  await serviceDb
    .insert(shopifySyncState)
    .values({
      user_id: userId,
      last_poll_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [shopifySyncState.user_id],
      set: { last_poll_at: new Date() },
    });

  // Delegate to full sync for v1 — incremental cursor-based sync in v2
  await shopifyFullSyncForUser(userId);
}

/**
 * Register Shopify webhook subscriptions via Admin GraphQL.
 * Stores subscription IDs in shopify_sync_state.webhook_subscriptions.
 */
export async function registerWebhooks(userId: string, shopDomain: string): Promise<void> {
  const adapter = new ShopifyAdapter(userId);
  const webhookEndpoint = process.env["NEXT_PUBLIC_APP_URL"]
    ? `${process.env["NEXT_PUBLIC_APP_URL"]}/api/webhooks/shopify`
    : null;

  if (!webhookEndpoint) {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "shopify.webhooks.skipped_no_endpoint",
        userId,
        shopDomain,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  const topics = [
    "PRODUCTS_CREATE",
    "PRODUCTS_UPDATE",
    "PRODUCTS_DELETE",
    "ORDERS_CREATE",
    "ORDERS_UPDATED",
    "INVENTORY_LEVELS_UPDATE",
  ];

  const subscriptionIds: string[] = [];

  for (const topic of topics) {
    try {
      const data = await adapter.shopifyGraphQL<{
        webhookSubscriptionCreate: {
          webhookSubscription?: { id: string };
          userErrors: Array<{ message: string }>;
        };
      }>(
        `mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: {
            callbackUrl: $callbackUrl,
            format: JSON
          }) {
            webhookSubscription { id }
            userErrors { message }
          }
        }`,
        { topic, callbackUrl: webhookEndpoint }
      );

      const result = data.webhookSubscriptionCreate;
      if (result.webhookSubscription?.id) {
        subscriptionIds.push(result.webhookSubscription.id);
      }
    } catch (err) {
      // Log per-topic failure but continue with others
      console.log(
        JSON.stringify({
          level: "warn",
          event: "shopify.webhooks.topic_failed",
          userId,
          topic,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  if (subscriptionIds.length > 0) {
    await serviceDb
      .insert(shopifySyncState)
      .values({
        user_id: userId,
        webhook_subscriptions: subscriptionIds,
      })
      .onConflictDoUpdate({
        target: [shopifySyncState.user_id],
        set: { webhook_subscriptions: subscriptionIds },
      });
  }

  console.log(
    JSON.stringify({
      level: "info",
      event: "shopify.webhooks.registered",
      userId,
      shopDomain,
      count: subscriptionIds.length,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Get all users with active Shopify integrations.
 * Used by the polling cron to enumerate users to sync.
 */
export async function getActiveShopifyUserIds(): Promise<string[]> {
  const rows = await serviceDb
    .select({ user_id: integrations.user_id })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "shopify"),
        eq(integrations.status, "active")
      )
    );

  return rows.map((r) => r.user_id);
}
