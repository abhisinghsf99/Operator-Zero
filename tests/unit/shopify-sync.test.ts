/**
 * tests/unit/shopify-sync.test.ts
 * Wave-0 scaffold — INTEG-02: Full-sync UPSERT idempotency to mirror
 *
 * Tests that the Shopify full-sync function correctly UPSERTs product/variant/order
 * data into the mirror tables and handles cursor pagination correctly.
 *
 * Requirement: INTEG-02 — Full catalog/orders/content/inventory sync on connect via Inngest
 */
import { describe, it, expect } from "vitest";

describe("INTEG-02 — Shopify full-sync UPSERT idempotency", () => {
  it.todo("upserts shopify_products on repeat sync without duplicates");

  it.todo("upserts shopify_product_variants on repeat sync without duplicates");

  it.todo("upserts shopify_orders on repeat sync without duplicates");

  it.todo("upserts shopify_pages on repeat sync without duplicates");

  it.todo("upserts shopify_redirects on repeat sync without duplicates");

  it.todo("follows cursor pagination — processes all pages before completing");

  it.todo("updates shopify_sync_state.last_full_sync_at on completion");

  it.todo("continues with partial sync if a page errors (does not abort entire sync)");

  it.todo("scopes all UPSERTs to the requesting user_id (no cross-tenant writes)");
});
