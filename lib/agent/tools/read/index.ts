/**
 * lib/agent/tools/read/index.ts
 * 11 always-safe read tools for the Operator Zero agent runtime.
 *
 * Read tools:
 *   1.  shopify_list_products
 *   2.  shopify_get_product
 *   3.  shopify_list_orders
 *   4.  shopify_get_inventory
 *   5.  shopify_list_pages
 *   6.  shopify_list_redirects
 *   7.  gmail_list_threads
 *   8.  gmail_get_thread
 *   9.  recall_memory
 *   10. search_activity
 *   11. get_brand_voice
 *
 * All read tools:
 *   - Have no approvalRequired gate (always safe per AGENT-02)
 *   - Query the Shopify/Gmail mirror tables via serviceDb with explicit user_id
 *   - Return a ToolResult with type="tool_result" and JSON content
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars.
 * SECURITY (T-2-05-04): all queries filter by user_id.
 */

import { z } from "zod";
import { serviceDb } from "@/lib/db/client";
import {
  shopifyProducts,
  shopifyProductVariants,
  shopifyOrders,
  shopifyPages,
  shopifyRedirects,
  gmailThreads,
  gmailMessages,
  activityEntries,
  brandVoiceProfiles,
  memoryItems,
} from "@/lib/db/schema";
import { eq, and, isNull, desc, like, or } from "drizzle-orm";
import { recallMemory } from "@/lib/agent/memory";
import type { AgentContext, ToolResult, ToolDefinition } from "../index";

// ─── Tool 1: shopify_list_products ────────────────────────────────────────────

const shopifyListProductsSchema = z.object({
  status: z.enum(["active", "draft", "archived"]).optional(),
  limit: z.number().int().positive().max(50).optional().default(20),
  search: z.string().optional(),
});

export const shopifyListProducts: ToolDefinition = {
  name: "shopify_list_products",
  description:
    "List products from the Shopify catalog mirror. Optionally filter by status or search term.",
  inputSchema: shopifyListProductsSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const { userId } = ctx;
    const parsed = shopifyListProductsSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const { status, limit = 20, search } = parsed.data;

    const conditions = [eq(shopifyProducts.user_id, userId)];
    if (status) conditions.push(eq(shopifyProducts.status, status));

    const rows = await serviceDb
      .select()
      .from(shopifyProducts)
      .where(and(...conditions))
      .orderBy(desc(shopifyProducts.last_synced_at))
      .limit(limit);

    const filtered = search
      ? rows.filter(
          (r) =>
            r.title?.toLowerCase().includes(search.toLowerCase()) ||
            r.body_html?.toLowerCase().includes(search.toLowerCase())
        )
      : rows;

    return { type: "tool_result", is_error: false, content: JSON.stringify(filtered) };
  },
};

// ─── Tool 2: shopify_get_product ──────────────────────────────────────────────

const shopifyGetProductSchema = z.object({
  product_gid: z.string().min(1, "product_gid is required"),
});

export const shopifyGetProduct: ToolDefinition = {
  name: "shopify_get_product",
  description: "Get a single product by its Shopify GID from the mirror.",
  inputSchema: shopifyGetProductSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = shopifyGetProductSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const rows = await serviceDb
      .select()
      .from(shopifyProducts)
      .where(
        and(
          eq(shopifyProducts.user_id, ctx.userId),
          eq(shopifyProducts.product_gid, parsed.data.product_gid)
        )
      )
      .limit(1);

    if (!rows[0]) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Product not found: ${parsed.data.product_gid}`,
      };
    }
    return { type: "tool_result", is_error: false, content: JSON.stringify(rows[0]) };
  },
};

// ─── Tool 3: shopify_list_orders ──────────────────────────────────────────────

const shopifyListOrdersSchema = z.object({
  financial_status: z.string().optional(),
  fulfillment_status: z.string().optional(),
  limit: z.number().int().positive().max(50).optional().default(20),
});

export const shopifyListOrders: ToolDefinition = {
  name: "shopify_list_orders",
  description: "List recent Shopify orders. Optionally filter by financial or fulfillment status.",
  inputSchema: shopifyListOrdersSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = shopifyListOrdersSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const { financial_status, fulfillment_status, limit = 20 } = parsed.data;

    const conditions = [eq(shopifyOrders.user_id, ctx.userId)];
    if (financial_status) conditions.push(eq(shopifyOrders.financial_status, financial_status));
    if (fulfillment_status)
      conditions.push(eq(shopifyOrders.fulfillment_status, fulfillment_status));

    const rows = await serviceDb
      .select()
      .from(shopifyOrders)
      .where(and(...conditions))
      .orderBy(desc(shopifyOrders.shopify_created_at))
      .limit(limit);

    return { type: "tool_result", is_error: false, content: JSON.stringify(rows) };
  },
};

// ─── Tool 4: shopify_get_inventory ────────────────────────────────────────────

const shopifyGetInventorySchema = z.object({
  product_gid: z.string().optional(),
  variant_gid: z.string().optional(),
  low_stock_threshold: z.number().int().nonnegative().optional(),
});

export const shopifyGetInventory: ToolDefinition = {
  name: "shopify_get_inventory",
  description:
    "Get inventory levels for product variants. Filter by product_gid, variant_gid, or low stock threshold.",
  inputSchema: shopifyGetInventorySchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = shopifyGetInventorySchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const { product_gid, variant_gid } = parsed.data;

    const conditions = [eq(shopifyProductVariants.user_id, ctx.userId)];
    if (variant_gid) conditions.push(eq(shopifyProductVariants.variant_gid, variant_gid));
    if (product_gid) conditions.push(eq(shopifyProductVariants.product_gid, product_gid));

    const rows = await serviceDb
      .select()
      .from(shopifyProductVariants)
      .where(and(...conditions))
      .limit(100);

    return { type: "tool_result", is_error: false, content: JSON.stringify(rows) };
  },
};

// ─── Tool 5: shopify_list_pages ───────────────────────────────────────────────

const shopifyListPagesSchema = z.object({
  limit: z.number().int().positive().max(50).optional().default(20),
  search: z.string().optional(),
});

export const shopifyListPages: ToolDefinition = {
  name: "shopify_list_pages",
  description: "List Shopify content pages from the mirror.",
  inputSchema: shopifyListPagesSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = shopifyListPagesSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const { limit = 20, search } = parsed.data;

    const rows = await serviceDb
      .select()
      .from(shopifyPages)
      .where(eq(shopifyPages.user_id, ctx.userId))
      .orderBy(desc(shopifyPages.last_synced_at))
      .limit(limit);

    const filtered = search
      ? rows.filter(
          (r) =>
            r.title?.toLowerCase().includes(search.toLowerCase()) ||
            r.handle?.toLowerCase().includes(search.toLowerCase())
        )
      : rows;

    return { type: "tool_result", is_error: false, content: JSON.stringify(filtered) };
  },
};

// ─── Tool 6: shopify_list_redirects ──────────────────────────────────────────

const shopifyListRedirectsSchema = z.object({
  limit: z.number().int().positive().max(100).optional().default(50),
  path: z.string().optional(),
});

export const shopifyListRedirects: ToolDefinition = {
  name: "shopify_list_redirects",
  description: "List Shopify URL redirects from the mirror. Optionally filter by source path.",
  inputSchema: shopifyListRedirectsSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = shopifyListRedirectsSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const { limit = 50, path } = parsed.data;

    const conditions = [eq(shopifyRedirects.user_id, ctx.userId)];
    if (path) conditions.push(eq(shopifyRedirects.path, path));

    const rows = await serviceDb
      .select()
      .from(shopifyRedirects)
      .where(and(...conditions))
      .limit(limit);

    return { type: "tool_result", is_error: false, content: JSON.stringify(rows) };
  },
};

// ─── Tool 7: gmail_list_threads ───────────────────────────────────────────────

const gmailListThreadsSchema = z.object({
  support_only: z.boolean().optional().default(false),
  limit: z.number().int().positive().max(50).optional().default(20),
});

export const gmailListThreads: ToolDefinition = {
  name: "gmail_list_threads",
  description:
    "List recent Gmail threads from the mirror. Optionally filter to customer support threads only.",
  inputSchema: gmailListThreadsSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = gmailListThreadsSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const { support_only, limit = 20 } = parsed.data;

    const conditions = [eq(gmailThreads.user_id, ctx.userId)];
    if (support_only) conditions.push(eq(gmailThreads.is_customer_support, true));

    const rows = await serviceDb
      .select()
      .from(gmailThreads)
      .where(and(...conditions))
      .orderBy(desc(gmailThreads.last_message_at))
      .limit(limit);

    return { type: "tool_result", is_error: false, content: JSON.stringify(rows) };
  },
};

// ─── Tool 8: gmail_get_thread ─────────────────────────────────────────────────

const gmailGetThreadSchema = z.object({
  gmail_thread_id: z.string().min(1, "gmail_thread_id is required"),
});

export const gmailGetThread: ToolDefinition = {
  name: "gmail_get_thread",
  description: "Get a full Gmail thread with all its messages.",
  inputSchema: gmailGetThreadSchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = gmailGetThreadSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }

    const thread = await serviceDb
      .select()
      .from(gmailThreads)
      .where(
        and(
          eq(gmailThreads.user_id, ctx.userId),
          eq(gmailThreads.gmail_thread_id, parsed.data.gmail_thread_id)
        )
      )
      .limit(1);

    if (!thread[0]) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Thread not found: ${parsed.data.gmail_thread_id}`,
      };
    }

    const messages = await serviceDb
      .select()
      .from(gmailMessages)
      .where(
        and(
          eq(gmailMessages.user_id, ctx.userId),
          eq(gmailMessages.gmail_thread_id, parsed.data.gmail_thread_id)
        )
      )
      .orderBy(gmailMessages.gmail_received_at);

    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({ thread: thread[0], messages }),
    };
  },
};

// ─── Tool 9: recall_memory ────────────────────────────────────────────────────

const recallMemorySchema = z.object({
  query: z.string().min(1, "query is required"),
  top_k: z.number().int().positive().max(20).optional().default(5),
});

export const recallMemoryTool: ToolDefinition = {
  name: "recall_memory",
  description:
    "Semantically search stored memory items using the query string. Returns the most relevant memory items.",
  inputSchema: recallMemorySchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = recallMemorySchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const results = await recallMemory(ctx.userId, parsed.data.query, parsed.data.top_k ?? 5);
    return { type: "tool_result", is_error: false, content: JSON.stringify(results) };
  },
};

// ─── Tool 10: search_activity ─────────────────────────────────────────────────

const searchActivitySchema = z.object({
  action_type: z.string().optional(),
  limit: z.number().int().positive().max(50).optional().default(20),
  search: z.string().optional(),
});

export const searchActivity: ToolDefinition = {
  name: "search_activity",
  description: "Search the activity log for past agent actions. Filter by action type or keyword.",
  inputSchema: searchActivitySchema,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = searchActivitySchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    const { action_type, limit = 20 } = parsed.data;

    const conditions = [eq(activityEntries.user_id, ctx.userId)];
    if (action_type) conditions.push(eq(activityEntries.action_type, action_type));

    const rows = await serviceDb
      .select()
      .from(activityEntries)
      .where(and(...conditions))
      .orderBy(desc(activityEntries.occurred_at))
      .limit(limit);

    return { type: "tool_result", is_error: false, content: JSON.stringify(rows) };
  },
};

// ─── Tool 11: get_brand_voice ─────────────────────────────────────────────────

const getBrandVoiceSchema = z.object({});

export const getBrandVoice: ToolDefinition = {
  name: "get_brand_voice",
  description: "Read the brand voice profile for this store.",
  inputSchema: getBrandVoiceSchema,
  async execute(_input, ctx: AgentContext): Promise<ToolResult> {
    const rows = await serviceDb
      .select()
      .from(brandVoiceProfiles)
      .where(eq(brandVoiceProfiles.user_id, ctx.userId))
      .limit(1);

    if (!rows[0]) {
      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({ message: "No brand voice profile found. Create one to get started." }),
      };
    }

    return { type: "tool_result", is_error: false, content: JSON.stringify(rows[0]) };
  },
};

// ─── Shared helper ────────────────────────────────────────────────────────────

export function formatZodError(err: z.ZodError): string {
  return err.errors.map((e) => `${e.path.join(".") || "input"}: ${e.message}`).join("; ");
}

// ─── Export all 11 read tools ─────────────────────────────────────────────────

export const readTools: ToolDefinition[] = [
  shopifyListProducts,
  shopifyGetProduct,
  shopifyListOrders,
  shopifyGetInventory,
  shopifyListPages,
  shopifyListRedirects,
  gmailListThreads,
  gmailGetThread,
  recallMemoryTool,
  searchActivity,
  getBrandVoice,
];
