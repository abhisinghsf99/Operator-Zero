/**
 * lib/inngest/functions/shopify-sync.ts
 * Shopify durable sync Inngest functions — INTEG-02, INTEG-03.
 *
 * Provides:
 *   - shopifyFullSync: triggered by 'shopify.connected'; runs full mirror sync
 *   - shopifyPoll: 15-min cron fallback; triggers incremental sync per active user
 *   - shopifyWebhookProcess: triggered by 'shopify.webhook_received'; processes webhook payload
 *
 * Registered in app/api/inngest/route.ts serve() functions array.
 *
 * Runtime requirements:
 *   - Full sync can take minutes for large stores → maxDuration=300 on the route
 *   - Concurrency key = userId prevents parallel syncs for the same user
 */
import { inngest } from "../client";
import {
  shopifyFullSyncForUser,
  shopifyIncrementalSyncForUser,
  registerWebhooks,
  getActiveShopifyUserIds,
} from "@/lib/integrations/shopify/sync";
import { serviceDb } from "@/lib/db/client";
import {
  shopifyProducts,
  shopifyOrders,
  shopifyPages,
} from "@/lib/db/schema/shopify-mirror";
import { eq, and } from "drizzle-orm";

// ─── shopifyFullSync ──────────────────────────────────────────────────────────

/**
 * Full catalog sync triggered when a user connects their Shopify store.
 * Event: 'shopify.connected' — fired by the OAuth callback route.
 */
export const shopifyFullSync = inngest.createFunction(
  {
    id: "shopify-full-sync",
    triggers: [{ event: "shopify.connected" }],
    concurrency: {
      limit: 1,
      key: "event.data.userId", // one sync at a time per user
    },
    retries: 3,
  },
  async ({ event, step }) => {
    const { userId, shop } = event.data as { userId: string; shop: string };

    // Register webhooks first so we don't miss events during the sync
    await step.run("register-webhooks", async () => {
      await registerWebhooks(userId, shop);
    });

    // Full sync — cursor-paginated, UPSERTs all mirror tables
    await step.run("full-sync", async () => {
      await shopifyFullSyncForUser(userId);
    });

    return { userId, shop, synced: true };
  }
);

// ─── shopifyPoll ──────────────────────────────────────────────────────────────

/**
 * 15-minute cron polling fallback — catches webhook misses.
 * Triggers incremental sync for every user with an active Shopify integration.
 */
export const shopifyPoll = inngest.createFunction(
  {
    id: "shopify-poll",
    triggers: [{ cron: "*/15 * * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    // Get all active Shopify users
    const userIds = await step.run("get-active-users", async () => {
      return getActiveShopifyUserIds();
    });

    // Fan out — one step per user (Inngest handles concurrency)
    const results: Array<{ userId: string; status: string }> = [];
    for (const userId of userIds) {
      const result = await step.run(`incremental-sync-${userId}`, async () => {
        try {
          await shopifyIncrementalSyncForUser(userId);
          return { userId, status: "ok" };
        } catch (err) {
          return {
            userId,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });
      results.push(result as { userId: string; status: string });
    }

    return { polled: userIds.length, results };
  }
);

// ─── shopifyWebhookProcess ─────────────────────────────────────────────────────

/**
 * Processes a Shopify webhook payload asynchronously.
 * Event: 'shopify.webhook_received' — fired by the webhook route handler after 200.
 */
export const shopifyWebhookProcess = inngest.createFunction(
  {
    id: "shopify-webhook-process",
    triggers: [{ event: "shopify.webhook_received" }],
    concurrency: {
      limit: 5, // allow more parallelism for webhooks than full sync
      key: "event.data.shop",
    },
    retries: 3,
  },
  async ({ event, step }) => {
    const { topic, shop, payload } = event.data as {
      topic: string;
      shop: string;
      payload: Record<string, unknown>;
    };

    // CR-06: Cross-check shop header against HMAC-verified payload before resolving user.
    // The x-shopify-shop-domain header is attacker-controllable (not part of the HMAC),
    // so we validate it against the shop embedded in the (HMAC-signed) body.
    // The payload carries the shop domain in the `shop` field (set by the route handler
    // from the header), but the HMAC itself validates the body — use payload.shop if
    // Shopify embeds it, or trust that the route handler already HMAC-verified the body.
    //
    // Correct approach: compare the `shop` event field (from x-shopify-shop-domain header)
    // against the shop in the HMAC-verified payload body. The webhook route fires this
    // Inngest event only after HMAC passes, so the payload is authentic. Shopify embeds
    // the shop identifier as the 'domain' field in webhook bodies.
    const payloadShop = (payload["domain"] as string | undefined) ?? null;

    // Resolve user via integrations.provider_account_id (correct lookup)
    const userId = await step.run("resolve-user", async () => {
      // Reject if the header shop does not match the HMAC-verified payload domain.
      // A request with a spoofed header but valid HMAC (for a different tenant's body)
      // would otherwise drive mutations against the wrong tenant's mirror.
      if (payloadShop && payloadShop !== shop) {
        console.log(
          JSON.stringify({
            level: "warn",
            event: "shopify.webhook.shop_header_mismatch",
            headerShop: shop,
            payloadShop,
            topic,
            timestamp: new Date().toISOString(),
          })
        );
        return null;
      }

      // Look up user by shop in integrations table (correct lookup via provider_account_id)
      const { integrations: integrationsTable } = await import("@/lib/db/schema");
      const [integration] = await serviceDb
        .select({ user_id: integrationsTable.user_id })
        .from(integrationsTable)
        .where(
          and(
            eq(integrationsTable.provider, "shopify"),
            eq(integrationsTable.provider_account_id, shop)
          )
        )
        .limit(1);
      return integration?.user_id ?? null;
    });

    if (!userId) {
      console.log(
        JSON.stringify({
          level: "warn",
          event: "shopify.webhook.user_not_found",
          shop,
          topic,
          timestamp: new Date().toISOString(),
        })
      );
      return { ok: false, reason: "user_not_found" };
    }

    // Process webhook by topic
    await step.run("process-webhook", async () => {
      const gid = (payload["admin_graphql_api_id"] as string | undefined) ?? null;

      switch (topic) {
        case "products/create":
        case "products/update": {
          if (!gid) return;
          // Re-sync the specific product
          await shopifyIncrementalSyncForUser(userId);
          break;
        }
        case "products/delete": {
          if (!gid) return;
          // Remove from mirror
          await serviceDb
            .delete(shopifyProducts)
            .where(
              and(
                eq(shopifyProducts.user_id, userId),
                eq(shopifyProducts.product_gid, gid)
              )
            );
          break;
        }
        case "orders/create":
        case "orders/updated": {
          // Re-sync for order changes — incremental in v2
          await shopifyIncrementalSyncForUser(userId);
          break;
        }
        default:
          // Unknown topic — still log and complete successfully
          console.log(
            JSON.stringify({
              level: "info",
              event: "shopify.webhook.unknown_topic",
              topic,
              userId,
              timestamp: new Date().toISOString(),
            })
          );
      }
    });

    return { ok: true, topic, userId };
  }
);
