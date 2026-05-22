/**
 * tests/unit/shopify-webhook.test.ts
 * Wave-0 scaffold — INTEG-03: Webhook HMAC validation + polling fallback
 *
 * Tests Shopify webhook HMAC verification and 15-minute polling fallback.
 *
 * Requirement: INTEG-03 — Webhooks update mirror on change; 15-min polling fallback
 */
import { describe, it, expect } from "vitest";

describe("INTEG-03 — Shopify webhook HMAC + polling fallback", () => {
  it.todo("verifies X-Shopify-Hmac-Sha256 header before processing webhook payload");

  it.todo("rejects webhook with invalid HMAC (returns 401, does not process)");

  it.todo("returns 200 immediately after HMAC check (before async processing)");

  it.todo("enqueues Inngest event for async mirror update after 200 response");

  it.todo("handles PRODUCTS_CREATE webhook topic — upserts shopify_products");

  it.todo("handles PRODUCTS_UPDATE webhook topic — upserts shopify_products");

  it.todo("handles PRODUCTS_DELETE webhook topic — removes from mirror");

  it.todo("handles ORDERS_CREATE webhook topic");

  it.todo("polling fallback: shopify-poll cron runs every 15 minutes");

  it.todo("polling fallback: triggers incremental sync for all active users");
});
