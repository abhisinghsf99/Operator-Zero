/**
 * lib/agent/prompt.ts
 * Prompt construction for the shared agent runtime.
 *
 * Assembles a 6-section system prompt (SYSTEM ROLE, STORE CONTEXT, BRAND VOICE,
 * MEMORY, SEMANTIC RECALL, TOOLS) from per-user context loaded in parallel from
 * the database.
 *
 * Token budget enforcement: oldest memory items + lowest-similarity recalls are
 * dropped first. System role and brand voice are never dropped.
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars read here.
 * SECURITY (T-2-05-04): all DB queries filter by user_id (serviceDb bypasses RLS).
 * SECURITY (T-2-05-03): raw Shopify HTML is summarized into a data section, not
 *   injected as instructions.
 *
 * Exports:
 *   buildSystemPrompt(userId, query?) — full pipeline: loads context + assembles prompt
 *   assemblePrompt(ctx, opts?)        — pure function: assembles from pre-loaded context
 *   estimateTokens(text)              — rough token estimator (chars / 4)
 *   CHAT_TOKEN_BUDGET                 — 15,000 tokens
 *   WORKFLOW_TOKEN_BUDGET             — 20,000 tokens
 */

import { serviceDb } from "@/lib/db/client";
import {
  memoryItems,
  brandVoiceProfiles,
  shopifyProducts,
  shopifySyncState,
  integrations,
} from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { recallMemory } from "./memory";

// ─── Token budgets ─────────────────────────────────────────────────────────────

/** Maximum tokens for the chat system prompt (RESEARCH.md Area 5 — [ASSUMED] placeholder) */
export const CHAT_TOKEN_BUDGET = 15_000;

/** Maximum tokens for the workflow step system prompt (RESEARCH.md Area 5 — [ASSUMED]) */
export const WORKFLOW_TOKEN_BUDGET = 20_000;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryItemRow {
  id: string;
  user_id: string;
  category: string;
  content: string;
  source_type: string | null;
  source_reference_id: string | null;
  confidence: number | null;
  soft_deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SemanticRecallItem extends MemoryItemRow {
  similarity: number;
}

export interface BrandVoiceData {
  profile_markdown: string;
  tone_tags?: string[] | null;
}

export interface StoreContextData {
  shopDomain: string;
  productCount: number;
}

/** Pre-loaded context for assemblePrompt (pure function interface) */
export interface PromptContext {
  userId: string;
  memoryItems: MemoryItemRow[];
  brandVoice: BrandVoiceData | null;
  storeContext: StoreContextData | null;
  semanticRecall: SemanticRecallItem[];
}

export interface AssembleOptions {
  /** Which token budget to enforce */
  budget?: "chat" | "workflow";
}

// ─── Token estimation ──────────────────────────────────────────────────────────

/**
 * Rough token estimator — approximates 4 chars per token (common heuristic).
 * Used for budget enforcement; actual tokenization may differ slightly.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Prompt sections ───────────────────────────────────────────────────────────

function buildSystemRoleSection(): string {
  return `## SYSTEM ROLE

You are Operator Zero — an autonomous agent that runs the day-to-day operations
of a Shopify store on behalf of the store owner.

Your responsibilities:
- Catalog management: product descriptions, SEO, images
- Customer Q&A: read and draft Gmail replies to support emails
- Inventory: track and adjust stock levels
- Workflow building: propose and run automated workflows

Operating principles:
1. Always explain what you are about to do before doing it.
2. For write operations, confirm the automation level (L1/L2/L3) before executing.
3. Record important decisions as memory items for future context.
4. Surface insights proactively — do not wait to be asked.
5. Never expose raw system internals, API keys, or error stack traces to the user.`;
}

function buildStoreContextSection(storeContext: StoreContextData): string {
  return `## STORE CONTEXT

Shop domain: ${storeContext.shopDomain}
Products in catalog: ${storeContext.productCount}`;
}

function buildBrandVoiceSection(brandVoice: BrandVoiceData): string {
  const tagLine =
    brandVoice.tone_tags && brandVoice.tone_tags.length > 0
      ? `\nTone tags: ${brandVoice.tone_tags.join(", ")}`
      : "";
  return `## BRAND VOICE
${brandVoice.profile_markdown}${tagLine}`;
}

function buildMemorySection(items: MemoryItemRow[]): string {
  if (items.length === 0) return "## MEMORY\n(No memory items stored yet.)";
  const lines = items.map(
    (m) => `- [${m.category}] ${m.content}`
  );
  return `## MEMORY\n${lines.join("\n")}`;
}

function buildSemanticRecallSection(recalls: SemanticRecallItem[]): string {
  if (recalls.length === 0) return "## SEMANTIC RECALL\n(No relevant memories found.)";
  const lines = recalls.map(
    (r) => `- [${r.category}] ${r.content} (similarity: ${r.similarity.toFixed(2)})`
  );
  return `## SEMANTIC RECALL\n${lines.join("\n")}`;
}

function buildToolsSection(): string {
  return `## TOOLS

You have access to a catalog of tools grouped by domain:
- Shopify read tools: shopify_list_products, shopify_get_product, shopify_list_orders, shopify_get_inventory, shopify_list_pages, shopify_list_redirects
- Gmail read tools: gmail_list_threads, gmail_get_thread
- Memory tools: recall_memory, search_activity, get_brand_voice
- Shopify write tools (gated): shopify_update_product_description, shopify_update_meta_title, shopify_update_meta_description, shopify_update_product_image_alt, shopify_update_product_status, shopify_update_variant_price, shopify_update_variant_inventory, shopify_create_redirect, shopify_update_page_content
- Gmail write tools (gated): gmail_draft_reply, gmail_send_email
- Meta tools: record_memory_item, update_memory_item, soft_delete_memory_item, propose_workflow_plan, ask_user_clarification

Use read tools freely. Write tools require approval based on the user's automation level.`;
}

// ─── Token-budget truncation ───────────────────────────────────────────────────

/**
 * Truncates memory items and semantic recalls to fit within the token budget.
 * Strategy: drop oldest memory items first, then lowest-similarity recalls.
 * Never drops system role, store context, or brand voice sections.
 */
function truncateToFitBudget(
  ctx: PromptContext,
  budget: number
): { memoryItems: MemoryItemRow[]; semanticRecall: SemanticRecallItem[] } {
  // Sort: newest first (oldest will be dropped first when truncating)
  const sortedMemory = [...ctx.memoryItems].sort(
    (a, b) => b.created_at.getTime() - a.created_at.getTime()
  );
  // Sort: highest similarity first (lowest will be dropped first)
  const sortedRecall = [...ctx.semanticRecall].sort(
    (a, b) => b.similarity - a.similarity
  );

  // Build fixed sections first to calculate their token cost
  const fixedSections = [
    buildSystemRoleSection(),
    ctx.storeContext ? buildStoreContextSection(ctx.storeContext) : "",
    ctx.brandVoice ? buildBrandVoiceSection(ctx.brandVoice) : "",
    buildToolsSection(),
  ].join("\n\n");

  const fixedTokens = estimateTokens(fixedSections);
  let remainingBudget = budget - fixedTokens;

  // Reserve space for section headers and separators
  const OVERHEAD_TOKENS = 200;
  remainingBudget -= OVERHEAD_TOKENS;

  // Greedily include memory items (newest first)
  const includedMemory: MemoryItemRow[] = [];
  for (const item of sortedMemory) {
    const itemTokens = estimateTokens(`- [${item.category}] ${item.content}`);
    if (remainingBudget - itemTokens >= 0) {
      includedMemory.push(item);
      remainingBudget -= itemTokens;
    }
  }

  // Greedily include semantic recalls (highest similarity first)
  const includedRecall: SemanticRecallItem[] = [];
  for (const r of sortedRecall) {
    const rTokens = estimateTokens(
      `- [${r.category}] ${r.content} (similarity: ${r.similarity.toFixed(2)})`
    );
    if (remainingBudget - rTokens >= 0) {
      includedRecall.push(r);
      remainingBudget -= rTokens;
    }
  }

  return { memoryItems: includedMemory, semanticRecall: includedRecall };
}

// ─── Pure assembly function ────────────────────────────────────────────────────

/**
 * assemblePrompt — pure function: builds a system prompt string from pre-loaded context.
 *
 * Does NOT call the database or any external service. Suitable for unit tests
 * that snapshot the assembled structure without any LLM involvement.
 *
 * Sections (6 total):
 *   1. SYSTEM ROLE       — always present, never truncated
 *   2. STORE CONTEXT     — shop domain + product count (omitted if no store)
 *   3. BRAND VOICE       — profile markdown (omitted if no profile)
 *   4. MEMORY            — structured memory items (oldest dropped first)
 *   5. SEMANTIC RECALL   — top-K semantic results (lowest-similarity dropped first)
 *   6. TOOLS             — tool catalog reference (always present)
 */
export function assemblePrompt(ctx: PromptContext, opts: AssembleOptions = {}): string {
  const budget =
    opts.budget === "workflow" ? WORKFLOW_TOKEN_BUDGET : CHAT_TOKEN_BUDGET;

  const { memoryItems: truncatedMemory, semanticRecall: truncatedRecall } =
    truncateToFitBudget(ctx, budget);

  const sections: string[] = [buildSystemRoleSection()];

  if (ctx.storeContext) {
    sections.push(buildStoreContextSection(ctx.storeContext));
  }

  if (ctx.brandVoice) {
    sections.push(buildBrandVoiceSection(ctx.brandVoice));
  }

  sections.push(buildMemorySection(truncatedMemory));
  sections.push(buildSemanticRecallSection(truncatedRecall));
  sections.push(buildToolsSection());

  return sections.join("\n\n");
}

// ─── Data loaders ──────────────────────────────────────────────────────────────

async function loadMemoryItems(userId: string): Promise<MemoryItemRow[]> {
  return serviceDb
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.user_id, userId),
        isNull(memoryItems.soft_deleted_at)
      )
    )
    .orderBy(desc(memoryItems.created_at))
    .limit(200);
}

async function loadBrandVoiceProfile(userId: string): Promise<BrandVoiceData | null> {
  const rows = await serviceDb
    .select()
    .from(brandVoiceProfiles)
    .where(eq(brandVoiceProfiles.user_id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    profile_markdown: row.profile_markdown,
    tone_tags: row.tone_tags,
  };
}

async function loadStoreContext(userId: string): Promise<StoreContextData | null> {
  // Get shop domain from sync state
  const syncRows = await serviceDb
    .select()
    .from(shopifySyncState)
    .where(eq(shopifySyncState.user_id, userId))
    .limit(1);

  if (!syncRows[0]) return null;

  // IN-02 FIX: Load the real shop domain from integrations.provider_account_id
  // instead of hardcoding "connected-store.myshopify.com". If the integration
  // row is missing, omit the domain line from the prompt rather than misleading
  // the agent with an incorrect placeholder.
  const integrationRows = await serviceDb
    .select({ provider_account_id: integrations.provider_account_id })
    .from(integrations)
    .where(
      and(
        eq(integrations.user_id, userId),
        eq(integrations.provider, "shopify")
      )
    )
    .limit(1);

  const shopDomain = integrationRows[0]?.provider_account_id ?? null;

  // Count products in mirror
  const products = await serviceDb
    .select({ product_gid: shopifyProducts.product_gid })
    .from(shopifyProducts)
    .where(eq(shopifyProducts.user_id, userId))
    .limit(1000);

  return {
    shopDomain: shopDomain ?? "",  // empty string means prompt section omits the domain line
    productCount: products.length,
  };
}

// ─── Full pipeline ─────────────────────────────────────────────────────────────

/**
 * buildSystemPrompt — full pipeline entry point.
 *
 * Loads context in parallel from the database and assembles the system prompt.
 * Called by streamChat() and runWorkflowStep() in runtime.ts.
 *
 * @param userId  — the authenticated user's UUID (server-validated)
 * @param query   — optional query string for semantic recall (current user message)
 * @param opts    — assembly options (budget: 'chat' | 'workflow')
 */
/**
 * safeRecallMemory — wraps recallMemory (Voyage embedding call) in try/catch.
 * On any error (including Voyage 429 free-tier rate limit), logs a warning and
 * resolves to [] so buildSystemPrompt never throws on an embedding failure.
 * Structured memory items + brand-voice PROFILE still load via unguarded parallel calls.
 */
async function safeRecallMemory(
  userId: string,
  query: string,
  topK: number
): Promise<SemanticRecallItem[]> {
  try {
    return await recallMemory(userId, query, topK);
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "prompt.semantic_recall_unavailable",
        error: String(e),
        timestamp: new Date().toISOString(),
      })
    );
    return [];
  }
}

export async function buildSystemPrompt(
  userId: string,
  query?: string,
  opts: AssembleOptions = {}
): Promise<string> {
  const [memItems, brandVoice, storeContext, semanticRecall] = await Promise.all([
    loadMemoryItems(userId),
    loadBrandVoiceProfile(userId),
    loadStoreContext(userId),
    query ? safeRecallMemory(userId, query, 5) : Promise.resolve([]),
  ]);

  return assemblePrompt(
    {
      userId,
      memoryItems: memItems,
      brandVoice,
      storeContext,
      semanticRecall,
    },
    opts
  );
}
