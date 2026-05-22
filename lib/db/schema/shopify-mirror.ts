/**
 * lib/db/schema/shopify-mirror.ts
 * Drizzle schemas for the Shopify mirror tables:
 *   shopify_products, shopify_product_variants, shopify_orders,
 *   shopify_pages, shopify_redirects, shopify_sync_state
 *
 * Mirror tables sync from Shopify on connect + webhooks + 15-min polling.
 * Writes go DIRECT to Shopify; mirror is updated by re-reading after write.
 * Column names match DATA-FLOW.md §7.1 verbatim.
 *
 * MULTI-TENANT: Composite PKs (user_id, <gid>) + RLS enforce isolation.
 *   Mirror tables use partial RLS — every query still needs user_id filter
 *   in application code for defense in depth.
 *
 * NOTE: These tables have composite PKs — no auto-generated UUID PK.
 *   The Shopify GIDs are the external system identifiers.
 *
 * THREAT MODEL:
 *   T-2-02-01 (cross-user access): RLS policy using auth.uid() = user_id
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgPolicy,
  index,
  integer,
  boolean,
  jsonb,
  primaryKey,
  numeric,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

// ─── shopify_products ──────────────────────────────────────────────────────────

export const shopifyProducts = pgTable(
  "shopify_products",
  {
    /**
     * Tenant discriminator. NOT NULL FK to auth.users(id) ON DELETE CASCADE.
     * FK expressed in migration SQL.
     */
    user_id: uuid("user_id").notNull(),

    /** Shopify GraphQL ID (gid://shopify/Product/...) */
    product_gid: text("product_gid").notNull(),

    /** Product title */
    title: text("title"),

    /** Product body HTML */
    body_html: text("body_html"),

    /** Product vendor */
    vendor: text("vendor"),

    /** Product type */
    product_type: text("product_type"),

    /** Product status: 'active' | 'draft' | 'archived' */
    status: text("status"),

    /** Product tags array */
    tags: text("tags").array(),

    /** SEO meta title (used by catalog audit for missing meta titles) */
    meta_title: text("meta_title"),

    /** SEO meta description */
    meta_description: text("meta_description"),

    /** When the product was created in Shopify */
    shopify_created_at: timestamp("shopify_created_at", { withTimezone: true }),

    /** When the product was last updated in Shopify */
    shopify_updated_at: timestamp("shopify_updated_at", { withTimezone: true }),

    /** When this mirror row was last synced from Shopify */
    last_synced_at: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Composite PK: (user_id, product_gid) */
    primaryKey({ columns: [table.user_id, table.product_gid] }),

    /** Lookup by user for catalog queries */
    index("idx_shopify_products_user").on(table.user_id),

    /** Incremental sync: find products updated after last sync */
    index("idx_shopify_products_updated").on(
      table.user_id,
      table.shopify_updated_at
    ),

    pgPolicy("shopify_products_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── shopify_product_variants ──────────────────────────────────────────────────

export const shopifyProductVariants = pgTable(
  "shopify_product_variants",
  {
    user_id: uuid("user_id").notNull(),

    /** Shopify GraphQL variant ID (gid://shopify/ProductVariant/...) */
    variant_gid: text("variant_gid").notNull(),

    /** Parent product GID for joining without going back to Shopify */
    product_gid: text("product_gid").notNull(),

    /** SKU */
    sku: text("sku"),

    /** Price (2 decimal places) */
    price: numeric("price", { precision: 10, scale: 2 }),

    /** Available inventory quantity */
    inventory_qty: integer("inventory_qty"),

    last_synced_at: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.variant_gid] }),

    index("idx_shopify_variants_user").on(table.user_id),

    pgPolicy("shopify_product_variants_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── shopify_orders ────────────────────────────────────────────────────────────

export const shopifyOrders = pgTable(
  "shopify_orders",
  {
    user_id: uuid("user_id").notNull(),

    /** Shopify GraphQL order ID (gid://shopify/Order/...) */
    order_gid: text("order_gid").notNull(),

    /** Order total amount */
    total: numeric("total", { precision: 10, scale: 2 }),

    /** Financial status: 'paid' | 'pending' | 'refunded' | etc. */
    financial_status: text("financial_status"),

    /** Fulfillment status: 'fulfilled' | 'unfulfilled' | 'partial' | etc. */
    fulfillment_status: text("fulfillment_status"),

    /** When the order was created in Shopify */
    shopify_created_at: timestamp("shopify_created_at", { withTimezone: true }),

    last_synced_at: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.order_gid] }),

    index("idx_shopify_orders_user").on(table.user_id),

    pgPolicy("shopify_orders_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── shopify_pages ─────────────────────────────────────────────────────────────

export const shopifyPages = pgTable(
  "shopify_pages",
  {
    user_id: uuid("user_id").notNull(),

    /** Shopify GraphQL page ID (gid://shopify/Page/...) */
    page_gid: text("page_gid").notNull(),

    /** Page title */
    title: text("title"),

    /** Page body HTML */
    body_html: text("body_html"),

    /** URL handle */
    handle: text("handle"),

    last_synced_at: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.page_gid] }),

    index("idx_shopify_pages_user").on(table.user_id),

    pgPolicy("shopify_pages_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── shopify_redirects ─────────────────────────────────────────────────────────

export const shopifyRedirects = pgTable(
  "shopify_redirects",
  {
    user_id: uuid("user_id").notNull(),

    /** Shopify redirect ID (numeric, stored as text for GID compatibility) */
    redirect_id: text("redirect_id").notNull(),

    /** Source path to redirect from */
    path: text("path"),

    /** Target URL or path to redirect to */
    target: text("target"),

    last_synced_at: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.redirect_id] }),

    index("idx_shopify_redirects_user").on(table.user_id),

    pgPolicy("shopify_redirects_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();

// ─── shopify_sync_state ────────────────────────────────────────────────────────

export const shopifySyncState = pgTable(
  "shopify_sync_state",
  {
    /**
     * PK — user_id IS the primary key (one sync state row per user).
     * FK to auth.users(id) ON DELETE CASCADE expressed in migration SQL.
     */
    user_id: uuid("user_id").primaryKey(),

    /** When the last full catalog sync completed (nullable) */
    last_full_sync_at: timestamp("last_full_sync_at", { withTimezone: true }),

    /** When the last webhook was received (nullable) */
    last_webhook_at: timestamp("last_webhook_at", { withTimezone: true }),

    /** When the last polling run completed (nullable) */
    last_poll_at: timestamp("last_poll_at", { withTimezone: true }),

    /**
     * Current sync health.
     * 'healthy' | 'webhooks_missing' | 'errored'
     */
    sync_status: text("sync_status"),

    /**
     * Registered Shopify webhook subscription IDs (JSONB array).
     * Used to verify webhooks are registered and to clean up on disconnect.
     */
    webhook_subscriptions: jsonb("webhook_subscriptions"),
  },
  (table) => [
    pgPolicy("shopify_sync_state_user_policy", {
      as: "permissive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ]
).enableRLS();
