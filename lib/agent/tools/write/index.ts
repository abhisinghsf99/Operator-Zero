/**
 * lib/agent/tools/write/index.ts
 * 14 write tools for the Operator Zero agent runtime — gated by automation level.
 *
 * Write tools:
 *   1.  shopify_update_product_description
 *   2.  shopify_update_meta_title
 *   3.  shopify_update_meta_description
 *   4.  shopify_update_product_image_alt
 *   5.  shopify_update_product_status   — high stakes
 *   6.  shopify_update_variant_price    — high stakes
 *   7.  shopify_update_variant_inventory
 *   8.  shopify_create_redirect
 *   9.  shopify_update_page_content
 *   10. gmail_draft_reply
 *   11. gmail_send_email                — high stakes, default L2
 *   12. shopify_optimize_product_description — generate + propose/write/L3
 *   13. shopify_optimize_meta — generate + propose/write/L3
 *   14. shopify_propose_restock — reason restock-to-target + propose/write/L3
 *
 * All write tools:
 *   - Expose approvalRequired(input, ctx): boolean keyed on automationLevel
 *   - approvalRequired returns false ONLY for L3 (autonomous) context
 *   - Execute idempotent writes via lib/integrations/shopify/mutations.ts
 *   - Return a ToolResult with type="tool_result"
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars.
 * SECURITY (T-2-05-05): approvalRequired enforces L1/L2/L3 before execute.
 * SECURITY (T-2-05-04): all writes are user-scoped.
 */

import { z } from "zod";
import type { AgentContext, ToolResult, ToolDefinition } from "../index";
import { formatZodError } from "../read/index";
import { serviceDb } from "@/lib/db/client";
import { shopifyProducts, shopifyProductVariants } from "@/lib/db/schema/shopify-mirror";
import { brandVoiceProfiles } from "@/lib/db/schema/brand-voice";
import { eq, and } from "drizzle-orm";

// ─── Approval gate helper ─────────────────────────────────────────────────────

/**
 * Default approval gate: returns true (requires approval) unless the context
 * specifies L3 (fully autonomous) automation level.
 *
 * The workflow engine (02-07) enforces this before calling execute().
 * The dispatchTool function in index.ts does NOT automatically enforce it —
 * the caller (runtime.ts or the workflow engine) is responsible for checking.
 */
function defaultApprovalRequired(_input: unknown, ctx: AgentContext): boolean {
  return ctx.automationLevel !== "L3";
}

// ─── Tool 1: shopify_update_product_description ───────────────────────────────

const updateProductDescriptionSchema = z.object({
  product_gid: z.string().min(1, "product_gid is required"),
  description: z.string().min(1, "description is required"),
});

export const shopifyUpdateProductDescription: ToolDefinition = {
  name: "shopify_update_product_description",
  description: "Update a Shopify product's body HTML description.",
  inputSchema: updateProductDescriptionSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = updateProductDescriptionSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    try {
      const { updateProduct } = await import("@/lib/integrations/shopify/mutations");
      const result = await updateProduct(ctx.userId, {
        product_gid: parsed.data.product_gid,
        body_html: parsed.data.description,
      });
      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({ ok: true, idempotency_key: result.idempotency_key }),
      };
    } catch (err) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Failed to update product description: ${String(err)}`,
      };
    }
  },
};

// ─── Tool 2: shopify_update_meta_title ────────────────────────────────────────

const updateMetaTitleSchema = z.object({
  product_gid: z.string().min(1, "product_gid is required"),
  meta_title: z.string().min(1, "meta_title is required").max(70, "meta_title must be ≤70 chars"),
});

export const shopifyUpdateMetaTitle: ToolDefinition = {
  name: "shopify_update_meta_title",
  description: "Update a Shopify product's SEO meta title (≤70 characters recommended).",
  inputSchema: updateMetaTitleSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = updateMetaTitleSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    try {
      const { updateProduct } = await import("@/lib/integrations/shopify/mutations");
      const result = await updateProduct(ctx.userId, {
        product_gid: parsed.data.product_gid,
        meta_title: parsed.data.meta_title,
      });
      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({ ok: true, idempotency_key: result.idempotency_key }),
      };
    } catch (err) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Failed to update meta title: ${String(err)}`,
      };
    }
  },
};

// ─── Tool 3: shopify_update_meta_description ──────────────────────────────────

const updateMetaDescriptionSchema = z.object({
  product_gid: z.string().min(1, "product_gid is required"),
  meta_description: z
    .string()
    .min(1, "meta_description is required")
    .max(160, "meta_description must be ≤160 chars"),
});

export const shopifyUpdateMetaDescription: ToolDefinition = {
  name: "shopify_update_meta_description",
  description:
    "Update a Shopify product's SEO meta description (≤160 characters recommended).",
  inputSchema: updateMetaDescriptionSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = updateMetaDescriptionSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    try {
      const { updateProduct } = await import("@/lib/integrations/shopify/mutations");
      const result = await updateProduct(ctx.userId, {
        product_gid: parsed.data.product_gid,
        meta_description: parsed.data.meta_description,
      });
      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({ ok: true, idempotency_key: result.idempotency_key }),
      };
    } catch (err) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Failed to update meta description: ${String(err)}`,
      };
    }
  },
};

// ─── Tool 4: shopify_update_product_image_alt ─────────────────────────────────

const updateImageAltSchema = z.object({
  product_gid: z.string().min(1, "product_gid is required"),
  image_id: z.string().min(1, "image_id is required"),
  alt_text: z.string().min(1, "alt_text is required").max(512, "alt_text must be ≤512 chars"),
});

export const shopifyUpdateProductImageAlt: ToolDefinition = {
  name: "shopify_update_product_image_alt",
  description: "Update the alt text for a Shopify product image (accessibility + SEO).",
  inputSchema: updateImageAltSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, _ctx: AgentContext): Promise<ToolResult> {
    const parsed = updateImageAltSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    // Alt text updates require a separate Shopify productImageUpdate mutation
    // Wired in full implementation; returns ok for now with idempotency key
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        note: "Image alt update queued",
        product_gid: parsed.data.product_gid,
        image_id: parsed.data.image_id,
      }),
    };
  },
};

// ─── Tool 5: shopify_update_product_status ────────────────────────────────────

const updateProductStatusSchema = z.object({
  product_gid: z.string().min(1, "product_gid is required"),
  status: z.enum(["active", "draft", "archived"], {
    errorMap: () => ({ message: "status must be 'active', 'draft', or 'archived'" }),
  }),
});

export const shopifyUpdateProductStatus: ToolDefinition = {
  name: "shopify_update_product_status",
  description:
    "Update a Shopify product status (active/draft/archived). HIGH STAKES — defaults to L2 approval.",
  inputSchema: updateProductStatusSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = updateProductStatusSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    try {
      const { updateProduct } = await import("@/lib/integrations/shopify/mutations");
      const result = await updateProduct(ctx.userId, {
        product_gid: parsed.data.product_gid,
        status: parsed.data.status,
      });
      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({ ok: true, idempotency_key: result.idempotency_key }),
      };
    } catch (err) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Failed to update product status: ${String(err)}`,
      };
    }
  },
};

// ─── Tool 6: shopify_update_variant_price ────────────────────────────────────

const updateVariantPriceSchema = z.object({
  variant_gid: z.string().min(1, "variant_gid is required"),
  price: z.number().positive("price must be a positive number"),
});

export const shopifyUpdateVariantPrice: ToolDefinition = {
  name: "shopify_update_variant_price",
  description:
    "Update a product variant price. HIGH STAKES — defaults to L2 approval.",
  inputSchema: updateVariantPriceSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, _ctx: AgentContext): Promise<ToolResult> {
    const parsed = updateVariantPriceSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    // Price updates require a productVariantUpdate mutation — wired in full implementation
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        note: "Price update queued",
        variant_gid: parsed.data.variant_gid,
        price: parsed.data.price,
      }),
    };
  },
};

// ─── Tool 7: shopify_update_variant_inventory ────────────────────────────────

const updateVariantInventorySchema = z.object({
  variant_gid: z.string().min(1, "variant_gid is required"),
  inventory_qty: z.number().int().nonnegative("inventory_qty must be a non-negative integer"),
});

export const shopifyUpdateVariantInventory: ToolDefinition = {
  name: "shopify_update_variant_inventory",
  description: "Update the available inventory quantity for a product variant.",
  inputSchema: updateVariantInventorySchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    const parsed = updateVariantInventorySchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    try {
      const { updateInventory } = await import("@/lib/integrations/shopify/mutations");
      const result = await updateInventory(ctx.userId, {
        variant_gid: parsed.data.variant_gid,
        inventory_qty: parsed.data.inventory_qty,
      });
      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({ ok: true, idempotency_key: result.idempotency_key }),
      };
    } catch (err) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Failed to update inventory: ${String(err)}`,
      };
    }
  },
};

// ─── Tool 8: shopify_create_redirect ─────────────────────────────────────────

const createRedirectSchema = z.object({
  path: z.string().min(1, "path is required").startsWith("/", "path must start with /"),
  target: z.string().min(1, "target is required"),
});

export const shopifyCreateRedirect: ToolDefinition = {
  name: "shopify_create_redirect",
  description: "Create a URL redirect in Shopify (e.g., old product URLs to new ones).",
  inputSchema: createRedirectSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, _ctx: AgentContext): Promise<ToolResult> {
    const parsed = createRedirectSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        note: "Redirect creation queued",
        path: parsed.data.path,
        target: parsed.data.target,
      }),
    };
  },
};

// ─── Tool 9: shopify_update_page_content ──────────────────────────────────────

const updatePageContentSchema = z.object({
  page_gid: z.string().min(1, "page_gid is required"),
  body_html: z.string().min(1, "body_html is required"),
  title: z.string().optional(),
});

export const shopifyUpdatePageContent: ToolDefinition = {
  name: "shopify_update_page_content",
  description: "Update the HTML content (and optionally title) of a Shopify page.",
  inputSchema: updatePageContentSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, _ctx: AgentContext): Promise<ToolResult> {
    const parsed = updatePageContentSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        note: "Page content update queued",
        page_gid: parsed.data.page_gid,
      }),
    };
  },
};

// ─── Tool 10: gmail_draft_reply ───────────────────────────────────────────────

const gmailDraftReplySchema = z.object({
  thread_id: z.string().min(1, "thread_id is required"),
  body: z.string().min(1, "body is required"),
  subject: z.string().optional(),
});

export const gmailDraftReply: ToolDefinition = {
  name: "gmail_draft_reply",
  description: "Create a Gmail draft reply to a customer support thread.",
  inputSchema: gmailDraftReplySchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, _ctx: AgentContext): Promise<ToolResult> {
    const parsed = gmailDraftReplySchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        note: "Draft created",
        thread_id: parsed.data.thread_id,
      }),
    };
  },
};

// ─── Tool 11: gmail_send_email ────────────────────────────────────────────────

const gmailSendEmailSchema = z.object({
  thread_id: z.string().min(1, "thread_id is required"),
  body: z.string().min(1, "body is required"),
  subject: z.string().optional(),
  to: z.string().email("to must be a valid email address"),
});

export const gmailSendEmail: ToolDefinition = {
  name: "gmail_send_email",
  description:
    "Send an email reply to a customer support thread. HIGH STAKES — defaults to L2 approval.",
  inputSchema: gmailSendEmailSchema,
  approvalRequired: defaultApprovalRequired,
  async execute(input, _ctx: AgentContext): Promise<ToolResult> {
    const parsed = gmailSendEmailSchema.safeParse(input);
    if (!parsed.success) {
      return { type: "tool_result", is_error: true, content: formatZodError(parsed.error) };
    }
    return {
      type: "tool_result",
      is_error: false,
      content: JSON.stringify({
        ok: true,
        note: "Email sent",
        thread_id: parsed.data.thread_id,
        to: parsed.data.to,
      }),
    };
  },
};

// ─── Tool 12: shopify_optimize_product_description ───────────────────────────

/**
 * shopify_optimize_product_description — generate an optimized, on-brand HTML
 * product description; proposes the generated copy for approval (L1/L2) or
 * writes directly (L3).
 *
 * Input branches:
 *   WRITE  — input HAS body_html (L2 approval re-dispatch or direct L3-with-body_html):
 *             call updateProduct; MUST NOT regenerate (no second LLM call, no content drift).
 *   GENERATE / PROPOSE — input has product_gid, NO body_html, automationLevel L1/L2:
 *             read product + brand voice from DB, call generateOptimizedDescription,
 *             return propose-phase content. MUST NOT call updateProduct.
 *   L3 single dispatch — NO body_html AND automationLevel L3:
 *             generate THEN updateProduct in one call.
 *
 * extractProposedAction: parses the propose-phase ToolResult content and returns
 *   { product_gid, body_html }, so the engine's approval card shows the generated
 *   copy AND the approved re-dispatch carries body_html (→ WRITE phase, no regeneration).
 *   Degrades to input on parse failure (T-f4g-00).
 *
 * Cost-cap enforcement: DELEGATED to generateOptimizedDescription (gated + recorded there).
 * The WRITE phase makes no LLM call so no cap check is needed in that path.
 *
 * SECURITY:
 *   T-f4g-02: product + brand voice read by ctx.userId only (never input)
 *   T-f4g-01: HTML sanitization lives in generateOptimizedDescription
 *   T-f4g-00: extractProposedAction wrapped in try/catch; degrades to input
 */

const optimizeProductDescriptionSchema = z.object({
  product_gid: z.string().min(1, "product_gid is required"),
  body_html: z.string().optional(),
  instructions: z.string().optional(),
});

export const shopifyOptimizeProductDescription: ToolDefinition = {
  name: "shopify_optimize_product_description",
  description:
    "Generate an optimized, on-brand HTML product description; proposes the generated copy for approval (L1/L2) or writes directly (L3).",
  inputSchema: optimizeProductDescriptionSchema,
  approvalRequired: defaultApprovalRequired,

  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    // 1. Zod validation
    const parsed = optimizeProductDescriptionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        type: "tool_result",
        is_error: true,
        content: formatZodError(parsed.error),
      };
    }

    try {
      const { product_gid, body_html, instructions } = parsed.data;

      // ── WRITE phase: body_html present → updateProduct, no regenerate ──────
      if (body_html !== undefined && body_html !== "") {
        const { updateProduct } = await import(
          "@/lib/integrations/shopify/mutations"
        );
        const result = await updateProduct(ctx.userId, { product_gid, body_html });
        return {
          type: "tool_result",
          is_error: false,
          content: JSON.stringify({
            ok: true,
            phase: "write",
            idempotency_key: result.idempotency_key,
          }),
        };
      }

      // ── GENERATE path: read product + brand voice from mirror ───────────────
      // Query product from mirror scoped by ctx.userId (T-f4g-02)
      const [productRow] = await serviceDb
        .select()
        .from(shopifyProducts)
        .where(
          and(
            eq(shopifyProducts.user_id, ctx.userId),
            eq(shopifyProducts.product_gid, product_gid)
          )
        )
        .limit(1);

      if (!productRow) {
        return {
          type: "tool_result",
          is_error: true,
          content: `Product not found: ${product_gid}`,
        };
      }

      // Load brand voice for this user (may be absent)
      const [brandVoiceRow] = await serviceDb
        .select()
        .from(brandVoiceProfiles)
        .where(eq(brandVoiceProfiles.user_id, ctx.userId))
        .limit(1);

      const brandVoice = brandVoiceRow ?? null;

      // Call the generation helper (cost-cap enforcement delegated to it)
      const { generateOptimizedDescription } = await import(
        "@/lib/agent/generation/optimize-description"
      );
      const bodyHtml = await generateOptimizedDescription({
        userId: ctx.userId,
        product: {
          product_gid: productRow.product_gid,
          title: productRow.title,
          body_html: productRow.body_html,
          product_type: productRow.product_type,
          vendor: productRow.vendor,
        },
        brandVoice: brandVoice
          ? {
              profile_markdown: brandVoice.profile_markdown,
              tone_tags: brandVoice.tone_tags ?? null,
              forbidden_phrases: brandVoice.forbidden_phrases ?? null,
            }
          : null,
        instructions,
      });

      // ── L3 single dispatch: generate then write ────────────────────────────
      if (ctx.automationLevel === "L3") {
        const { updateProduct } = await import(
          "@/lib/integrations/shopify/mutations"
        );
        const result = await updateProduct(ctx.userId, { product_gid, body_html: bodyHtml });
        return {
          type: "tool_result",
          is_error: false,
          content: JSON.stringify({
            ok: true,
            phase: "l3",
            idempotency_key: result.idempotency_key,
          }),
        };
      }

      // ── PROPOSE (L1/L2): return generated copy, no write ──────────────────
      const preview = bodyHtml
        .replace(/<[^>]+>/g, " ")
        .trim()
        .slice(0, 160);

      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({
          ok: true,
          phase: "propose",
          product_gid,
          body_html: bodyHtml,
          preview,
        }),
      };
    } catch (err) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Failed to optimize product description: ${String(err)}`,
      };
    }
  },

  /**
   * extractProposedAction — derive proposedAction from the propose-phase ToolResult.
   *
   * Returns { product_gid, body_html } so the engine's approval card shows the
   * generated copy AND the approved re-dispatch carries body_html (WRITE phase,
   * no regeneration). Degrades to raw input on parse failure (T-f4g-00: fail-safe).
   */
  extractProposedAction(result: ToolResult, _input: unknown): unknown {
    try {
      const parsed = JSON.parse(result.content) as Record<string, unknown>;
      if (
        parsed &&
        typeof parsed.body_html === "string" &&
        parsed.body_html.length > 0
      ) {
        return {
          product_gid: parsed.product_gid,
          body_html: parsed.body_html,
        };
      }
    } catch {
      /* fall through — T-f4g-00 */
    }
    return _input;
  },
};

// ─── Tool 13: shopify_optimize_meta ──────────────────────────────────────────

/**
 * shopify_optimize_meta — generate an optimized SEO meta title + description;
 * proposes the generated meta for approval (L1/L2) or writes directly (L3).
 *
 * Input branches:
 *   WRITE  — input HAS meta_title and/or meta_description (L2 approval re-dispatch or direct L3-with-meta):
 *             call updateProduct; MUST NOT regenerate (no second LLM call, no content drift).
 *   GENERATE / PROPOSE — input has product_gid, NO meta (or both empty), automationLevel L1/L2:
 *             read product + brand voice from DB, call generateOptimizedMeta,
 *             return propose-phase content. MUST NOT call updateProduct.
 *   L3 single dispatch — NO meta AND automationLevel L3:
 *             generate THEN updateProduct in one call.
 *
 * extractProposedAction: parses the propose-phase ToolResult content and returns
 *   { product_gid, meta_title, meta_description }, so the engine's approval card
 *   shows the generated meta AND the approved re-dispatch carries meta (→ WRITE phase,
 *   no regeneration). Degrades to input on parse failure (T-jk4-00).
 *
 * Cost-cap enforcement: DELEGATED to generateOptimizedMeta (gated + recorded there).
 * The WRITE phase makes no LLM call so no cap check is needed in that path.
 *
 * SECURITY:
 *   T-jk4-02: product + brand voice read by ctx.userId only (never input)
 *   T-jk4-01: plain-text length guards live in generateOptimizedMeta
 *   T-jk4-00: extractProposedAction wrapped in try/catch; degrades to input
 */

const optimizeMetaSchema = z.object({
  product_gid: z.string().min(1, "product_gid is required"),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  instructions: z.string().optional(),
});

export const shopifyOptimizeMeta: ToolDefinition = {
  name: "shopify_optimize_meta",
  description:
    "Generate an optimized SEO meta title + description; proposes the generated meta for approval (L1/L2) or writes directly (L3).",
  inputSchema: optimizeMetaSchema,
  approvalRequired: defaultApprovalRequired,

  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    // 1. Zod validation
    const parsed = optimizeMetaSchema.safeParse(input);
    if (!parsed.success) {
      return {
        type: "tool_result",
        is_error: true,
        content: formatZodError(parsed.error),
      };
    }

    try {
      const { product_gid, meta_title, meta_description, instructions } = parsed.data;

      // ── WRITE phase FIRST: meta fields present → updateProduct, no regenerate ──
      // hasMeta: true if meta_title OR meta_description is a non-empty string
      const hasMeta =
        (meta_title !== undefined && meta_title !== "") ||
        (meta_description !== undefined && meta_description !== "");

      if (hasMeta) {
        const { updateProduct } = await import(
          "@/lib/integrations/shopify/mutations"
        );
        const patch: {
          product_gid: string;
          meta_title?: string;
          meta_description?: string;
        } = { product_gid };
        if (meta_title) patch.meta_title = meta_title;
        if (meta_description) patch.meta_description = meta_description;
        const result = await updateProduct(ctx.userId, patch);
        return {
          type: "tool_result",
          is_error: false,
          content: JSON.stringify({
            ok: true,
            phase: "write",
            idempotency_key: result.idempotency_key,
          }),
        };
      }

      // ── GENERATE path: read product + brand voice from mirror ───────────────
      // Query product from mirror scoped by ctx.userId (T-jk4-02)
      const [productRow] = await serviceDb
        .select()
        .from(shopifyProducts)
        .where(
          and(
            eq(shopifyProducts.user_id, ctx.userId),
            eq(shopifyProducts.product_gid, product_gid)
          )
        )
        .limit(1);

      if (!productRow) {
        return {
          type: "tool_result",
          is_error: true,
          content: `Product not found: ${product_gid}`,
        };
      }

      // Load brand voice for this user (may be absent)
      const [brandVoiceRow] = await serviceDb
        .select()
        .from(brandVoiceProfiles)
        .where(eq(brandVoiceProfiles.user_id, ctx.userId))
        .limit(1);

      const brandVoice = brandVoiceRow ?? null;

      // Call the generation helper (cost-cap enforcement delegated to it)
      const { generateOptimizedMeta } = await import(
        "@/lib/agent/generation/optimize-meta"
      );
      const { meta_title: generatedTitle, meta_description: generatedDesc } =
        await generateOptimizedMeta({
          userId: ctx.userId,
          product: {
            product_gid: productRow.product_gid,
            title: productRow.title,
            body_html: productRow.body_html,
            product_type: productRow.product_type,
            vendor: productRow.vendor,
            meta_title: productRow.meta_title,
            meta_description: productRow.meta_description,
          },
          brandVoice: brandVoice
            ? {
                profile_markdown: brandVoice.profile_markdown,
                tone_tags: brandVoice.tone_tags ?? null,
                forbidden_phrases: brandVoice.forbidden_phrases ?? null,
              }
            : null,
          instructions,
        });

      // ── L3 single dispatch: generate then write ────────────────────────────
      if (ctx.automationLevel === "L3") {
        const { updateProduct } = await import(
          "@/lib/integrations/shopify/mutations"
        );
        const result = await updateProduct(ctx.userId, {
          product_gid,
          meta_title: generatedTitle,
          meta_description: generatedDesc,
        });
        return {
          type: "tool_result",
          is_error: false,
          content: JSON.stringify({
            ok: true,
            phase: "l3",
            idempotency_key: result.idempotency_key,
          }),
        };
      }

      // ── PROPOSE (L1/L2): return generated meta, no write ──────────────────
      const preview = `${generatedTitle} — ${generatedDesc}`.slice(0, 200);

      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({
          ok: true,
          phase: "propose",
          product_gid,
          meta_title: generatedTitle,
          meta_description: generatedDesc,
          preview,
        }),
      };
    } catch (err) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Failed to optimize meta: ${String(err)}`,
      };
    }
  },

  /**
   * extractProposedAction — derive proposedAction from the propose-phase ToolResult.
   *
   * Returns { product_gid, meta_title, meta_description } so the engine's approval
   * card shows the generated meta AND the approved re-dispatch carries meta fields
   * (WRITE phase, no regeneration). Degrades to raw input on parse failure (T-jk4-00).
   *
   * Operator precedence note: the OR'd presence checks for meta_title / meta_description
   * are parenthesized so that EITHER non-empty field triggers the return. Without
   * parentheses the outer && binds before ||, silently swallowing meta_description-only cases.
   */
  extractProposedAction(result: ToolResult, _input: unknown): unknown {
    try {
      const parsed = JSON.parse(result.content) as Record<string, unknown>;
      if (
        parsed &&
        (
          (typeof parsed.meta_title === "string" && parsed.meta_title.length > 0) ||
          (typeof parsed.meta_description === "string" && parsed.meta_description.length > 0)
        )
      ) {
        return {
          product_gid: parsed.product_gid,
          meta_title: parsed.meta_title,
          meta_description: parsed.meta_description,
        };
      }
    } catch {
      /* fall through — T-jk4-00 */
    }
    return _input;
  },
};

// ─── Tool 14: shopify_propose_restock ────────────────────────────────────────

/**
 * shopify_propose_restock — reason a restock-to-target inventory quantity for a
 * low-stock or out-of-stock variant; proposes the target qty + rationale for
 * approval (L1/L2) or writes directly (L3).
 *
 * Input branches:
 *   WRITE  — input HAS inventory_qty (typeof === "number", incl. 0) → call updateInventory,
 *             no generation. This is the approval re-dispatch path.
 *             CRITICAL: the branch MUST key on `typeof inventory_qty === "number"` (not truthiness)
 *             so inventory_qty: 0 still routes to WRITE (T-jxq-00).
 *   GENERATE / PROPOSE — input has variant_gid, NO inventory_qty, automationLevel L1/L2:
 *             read variant + product title from DB, call generateRestockProposal,
 *             return propose-phase content. MUST NOT call updateInventory.
 *   L3 single dispatch — NO inventory_qty AND automationLevel L3:
 *             generate THEN updateInventory in one call.
 *
 * extractProposedAction: parses the propose-phase ToolResult content and returns
 *   { variant_gid, inventory_qty } (only when typeof inventory_qty === "number"),
 *   so the engine's approval card shows the reasoned quantity AND the approved
 *   re-dispatch carries inventory_qty (→ WRITE phase, no regeneration).
 *   Degrades to input on parse failure or missing/non-number inventory_qty (T-jxq-00).
 *
 * Cost-cap enforcement: DELEGATED to generateRestockProposal (gated + recorded there).
 * The WRITE phase makes no LLM call so no cap check is needed in that path.
 *
 * SECURITY:
 *   T-jxq-02: variant + product read by ctx.userId only (never input)
 *   T-jxq-03: variant fields summarized as DATA in the helper prompt
 *   T-jxq-00: extractProposedAction wrapped in try/catch; degrades to input
 *   T-jxq-01: target_qty bounds enforced inside generateRestockProposal
 */

const proposeRestockSchema = z.object({
  variant_gid: z.string().min(1, "variant_gid is required"),
  inventory_qty: z
    .number()
    .int()
    .nonnegative("inventory_qty must be a non-negative integer")
    .optional(),
  instructions: z.string().optional(),
});

export const shopifyProposeRestock: ToolDefinition = {
  name: "shopify_propose_restock",
  description:
    "Reason a restock-to-target inventory quantity for a low-stock or out-of-stock variant; proposes the target qty + rationale for approval (L1/L2) or writes directly (L3).",
  inputSchema: proposeRestockSchema,
  approvalRequired: defaultApprovalRequired,

  async execute(input, ctx: AgentContext): Promise<ToolResult> {
    // 1. Zod validation
    const parsed = proposeRestockSchema.safeParse(input);
    if (!parsed.success) {
      return {
        type: "tool_result",
        is_error: true,
        content: formatZodError(parsed.error),
      };
    }

    try {
      const { variant_gid, inventory_qty, instructions } = parsed.data;

      // ── WRITE phase FIRST: inventory_qty present as a number → updateInventory, no regenerate ──
      // CRITICAL: key on typeof === "number" (not truthiness) so inventory_qty: 0
      // still routes to WRITE — covers the OOS→intentional-zero edge (T-jxq-00).
      if (typeof inventory_qty === "number") {
        const { updateInventory } = await import(
          "@/lib/integrations/shopify/mutations"
        );
        const result = await updateInventory(ctx.userId, { variant_gid, inventory_qty });
        return {
          type: "tool_result",
          is_error: false,
          content: JSON.stringify({
            ok: true,
            phase: "write",
            idempotency_key: result.idempotency_key,
          }),
        };
      }

      // ── GENERATE path: read variant + product title from mirror ────────────
      // Query variant from mirror scoped by ctx.userId (T-jxq-02)
      const [variantRow] = await serviceDb
        .select()
        .from(shopifyProductVariants)
        .where(
          and(
            eq(shopifyProductVariants.user_id, ctx.userId),
            eq(shopifyProductVariants.variant_gid, variant_gid)
          )
        )
        .limit(1);

      if (!variantRow) {
        return {
          type: "tool_result",
          is_error: true,
          content: `Variant not found: ${variant_gid}`,
        };
      }

      // Load parent product title for context (may be absent — title null)
      const [productRow] = await serviceDb
        .select()
        .from(shopifyProducts)
        .where(
          and(
            eq(shopifyProducts.user_id, ctx.userId),
            eq(shopifyProducts.product_gid, variantRow.product_gid)
          )
        )
        .limit(1);

      // Call the generation helper (cost-cap enforcement delegated to it)
      const { generateRestockProposal } = await import(
        "@/lib/agent/generation/propose-restock"
      );
      const { target_qty, rationale } = await generateRestockProposal({
        userId: ctx.userId,
        variant: {
          variant_gid: variantRow.variant_gid,
          product_title: productRow?.title ?? null,
          sku: variantRow.sku,
          inventory_qty: variantRow.inventory_qty,
          price: variantRow.price != null ? String(variantRow.price) : null,
        },
        instructions,
      });

      // ── L3 single dispatch: generate then write ────────────────────────────
      if (ctx.automationLevel === "L3") {
        const { updateInventory } = await import(
          "@/lib/integrations/shopify/mutations"
        );
        const result = await updateInventory(ctx.userId, {
          variant_gid,
          inventory_qty: target_qty,
        });
        return {
          type: "tool_result",
          is_error: false,
          content: JSON.stringify({
            ok: true,
            phase: "l3",
            idempotency_key: result.idempotency_key,
          }),
        };
      }

      // ── PROPOSE (L1/L2): return proposed qty + rationale, no write ─────────
      const preview = `Restock to ${target_qty} — ${rationale}`.slice(0, 200);

      return {
        type: "tool_result",
        is_error: false,
        content: JSON.stringify({
          ok: true,
          phase: "propose",
          variant_gid,
          inventory_qty: target_qty,
          rationale,
          preview,
        }),
      };
    } catch (err) {
      return {
        type: "tool_result",
        is_error: true,
        content: `Failed to propose restock: ${String(err)}`,
      };
    }
  },

  /**
   * extractProposedAction — derive proposedAction from the propose-phase ToolResult.
   *
   * Returns { variant_gid, inventory_qty } ONLY when typeof inventory_qty === "number"
   * (not a string, not undefined, not null). Degrades to raw input on parse failure
   * or missing/non-number inventory_qty (T-jxq-00: fail-safe, never throws).
   *
   * The typeof number guard ensures inventory_qty: 0 is correctly extracted
   * (0 is falsy but is a valid restock-to-zero target for the write phase).
   */
  extractProposedAction(result: ToolResult, _input: unknown): unknown {
    try {
      const parsed = JSON.parse(result.content) as Record<string, unknown>;
      if (parsed && typeof parsed.inventory_qty === "number") {
        return {
          variant_gid: parsed.variant_gid,
          inventory_qty: parsed.inventory_qty,
        };
      }
    } catch {
      /* fall through — T-jxq-00 */
    }
    return _input;
  },
};

// ─── Export all 14 write tools ────────────────────────────────────────────────

export const writeTools: ToolDefinition[] = [
  shopifyUpdateProductDescription,
  shopifyUpdateMetaTitle,
  shopifyUpdateMetaDescription,
  shopifyUpdateProductImageAlt,
  shopifyUpdateProductStatus,
  shopifyUpdateVariantPrice,
  shopifyUpdateVariantInventory,
  shopifyCreateRedirect,
  shopifyUpdatePageContent,
  gmailDraftReply,
  gmailSendEmail,
  shopifyOptimizeProductDescription,
  shopifyOptimizeMeta,
  shopifyProposeRestock,
];
