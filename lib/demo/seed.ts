/**
 * lib/demo/seed.ts
 * Server-only — MUST NOT have "use client"; reads process.env server-side only.
 *
 * Faithful Drizzle port of /tmp/oz_seed.mjs onto serviceDb (RLS-bypass, service-role).
 * Wipes and re-seeds a user's app data in one transaction.
 *
 * Three entry points:
 *   - seedDemoFor(userId) — wipe + seed the Wanderbound/Sarah dataset for an
 *     arbitrary user_id. Used for per-visitor sandboxes (anonymous users) AND by
 *     reseedDemo() for the shared demo account.
 *   - reseedDemo() — thin wrapper that seeds the env DEMO_USER_ID (shared account).
 *   - wipeDemoFor(userId) — delete all of a user's seeded app data. Used by the
 *     sandbox exit route + TTL-sweep cron to tear a throwaway visitor down.
 *
 * SECURITY:
 *   - seedDemoFor / wipeDemoFor require a non-empty userId; they return with NO
 *     database access if it's empty. This is the safety invariant: never wipe or
 *     seed an arbitrary/unknown user.
 *   - reseedDemo() reads process.env.DEMO_USER_ID at call time and no-ops if unset.
 *   - Every delete/update/insert is filtered by eq(table.user_id, USER).
 *   - serviceDb bypasses RLS — the user_id filter is the only isolation layer here.
 *   - This file is server-only; it must never be imported in client components.
 */

import { serviceDb } from "@/lib/db/client";
import {
  userProfiles,
  integrations,
  brandVoiceProfiles,
  brandVoiceSamples,
  autonomyThresholds,
  memoryItems,
  memoryEmbeddings,
  userSessions,
  shopifyProducts,
  shopifyProductVariants,
  shopifyOrders,
  shopifyPages,
  shopifyRedirects,
  shopifySyncState,
  workflows,
  workflowVersions,
  workflowRuns,
  approvals,
  activityEntries,
  threads,
  messages,
  gmailThreads,
  gmailMessages,
  gmailSyncState,
  agentTelemetry,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { SANDBOX_SENTINEL_TOKEN } from "./constants";
import { embedTexts } from "@/lib/agent/embeddings";

const SHOP = "wanderbound.myshopify.com";

// dummy ciphertext placeholder for integration tokens (health never decrypts).
// This exact sentinel ALSO signals "sandbox" to the Shopify write path
// (lib/integrations/shopify/mutations.ts): a connection holding this token
// simulates writes against the local mirror instead of calling Shopify.
// Re-exported for backward compat with existing importers.
export { SANDBOX_SENTINEL_TOKEN };
const TOK = SANDBOX_SENTINEL_TOKEN;

// Transaction handle type, derived from serviceDb so the wipe helper stays typed.
type SeedTx = Parameters<Parameters<typeof serviceDb.transaction>[0]>[0];

/**
 * Delete every seeded app-data row for one user (child → parent order).
 * Does NOT touch user_profiles (re-seed upserts it; cleanup removes it
 * separately / via auth-user cascade) and does NOT touch sandbox_sessions
 * (the registry is managed by the caller).
 */
async function wipeUserData(tx: SeedTx, USER: string): Promise<void> {
  await tx.delete(approvals).where(eq(approvals.user_id, USER));
  await tx.delete(activityEntries).where(eq(activityEntries.user_id, USER));
  await tx.delete(agentTelemetry).where(eq(agentTelemetry.user_id, USER));
  await tx.delete(messages).where(eq(messages.user_id, USER));
  await tx.delete(threads).where(eq(threads.user_id, USER));
  await tx.delete(workflowRuns).where(eq(workflowRuns.user_id, USER));
  await tx
    .update(workflows)
    .set({ current_version_id: null })
    .where(eq(workflows.user_id, USER));
  await tx.delete(workflows).where(eq(workflows.user_id, USER)); // cascades workflow_versions
  // memoryEmbeddings BEFORE memoryItems — FK-free but semantically dependent
  // (embeds memory item content), so drop the derived rows first (WS11).
  await tx.delete(memoryEmbeddings).where(eq(memoryEmbeddings.user_id, USER));
  await tx.delete(memoryItems).where(eq(memoryItems.user_id, USER));
  await tx.delete(brandVoiceSamples).where(eq(brandVoiceSamples.user_id, USER));
  await tx.delete(brandVoiceProfiles).where(eq(brandVoiceProfiles.user_id, USER));
  await tx.delete(autonomyThresholds).where(eq(autonomyThresholds.user_id, USER));
  await tx.delete(userSessions).where(eq(userSessions.user_id, USER));
  await tx.delete(integrations).where(eq(integrations.user_id, USER));
  await tx
    .delete(shopifyProductVariants)
    .where(eq(shopifyProductVariants.user_id, USER));
  await tx.delete(shopifyProducts).where(eq(shopifyProducts.user_id, USER));
  // WS11: the seed writes these tables (orders/pages/redirects/sync state)
  // but the original wipe never deleted them — a reseed left stale rows.
  await tx.delete(shopifyOrders).where(eq(shopifyOrders.user_id, USER));
  await tx.delete(shopifyPages).where(eq(shopifyPages.user_id, USER));
  await tx.delete(shopifyRedirects).where(eq(shopifyRedirects.user_id, USER));
  await tx.delete(shopifySyncState).where(eq(shopifySyncState.user_id, USER));
  await tx.delete(gmailMessages).where(eq(gmailMessages.user_id, USER));
  await tx.delete(gmailThreads).where(eq(gmailThreads.user_id, USER));
  await tx.delete(gmailSyncState).where(eq(gmailSyncState.user_id, USER));
}

// ─── Seeded workflow definitions (module scope — WS1 regression guard) ─────────
// [name, level, status, trigger_type, description, source, updatedAgo(hrs), steps[]]
// WS1 fix: every step now names a REAL tool key from getToolDefinitions()
// (lib/agent/tools) and carries params that pass that tool's Zod schema —
// see tests/unit/seed-registry.test.ts, the regression guard for this.
// Exported (not just used internally) so the registry-conformance test can
// validate every step without touching the database.
type StepTuple = [string, string, string, Record<string, unknown>];
type WfDefTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  StepTuple[],
];
export const DEMO_WORKFLOW_DEFS: WfDefTuple[] = [
  [
    "Alt text for new product images",
    "L3",
    "active",
    "schedule",
    "Generates alt text from product name + category for any image missing it. Runs nightly.",
    "chat",
    3,
    [
      [
        "scan",
        "Scan catalog for images missing alt text",
        "shopify_list_products",
        { status: "active", limit: 50 },
      ],
      [
        "write",
        "Write alt text to Shopify",
        "shopify_update_product_image_alt",
        {
          product_gid: "gid://shopify/Product/100000001",
          image_id: "gid://shopify/MediaImage/100000001",
          alt_text: "Full-grain leather weekender duffel in tan, standing upright",
        },
      ],
    ],
  ],
  [
    "Fix empty meta descriptions",
    "L3",
    "active",
    "schedule",
    "Fills missing meta descriptions in brand voice, grounded in product data.",
    "chat",
    9,
    [
      [
        "scan",
        "Find products with empty meta description",
        "shopify_list_products",
        { status: "active", limit: 50 },
      ],
      [
        "optimize",
        "Optimize meta title + description",
        "shopify_optimize_meta",
        { product_gid: "gid://shopify/Product/100000002" },
      ],
    ],
  ],
  [
    "Answer customer product questions",
    "L2",
    "active",
    "event",
    "Drafts replies to product questions from the inbox; you approve before send.",
    "chat",
    2,
    [
      [
        "triage",
        "Check the support inbox for new questions",
        "gmail_list_threads",
        { support_only: true, limit: 10 },
      ],
      [
        "open",
        "Read the full thread",
        "gmail_get_thread",
        { gmail_thread_id: "gmail-thread-aa12" },
      ],
      [
        "draft",
        "Draft a reply grounded in product data",
        "gmail_draft_reply",
        {
          thread_id: "gmail-thread-aa12",
          subject: "Re: Leather care after rain?",
          body: "Hi Maria — good news, a little rain won't hurt it. Let it air-dry away from heat, then rub in a thin coat of leather conditioner once it's fully dry. It'll darken slightly and even out over time.",
        },
      ],
    ],
  ],
  [
    "Low-stock flash-sale proposals",
    "L2",
    "active",
    "event",
    "When a slow-mover dips below threshold, proposes a weekend discount (≤20%).",
    "promoted_from_activity",
    26,
    [
      [
        "scan",
        "Check inventory against the low-stock threshold",
        "shopify_get_inventory",
        { low_stock_threshold: 5 },
      ],
      [
        "propose",
        "Propose a restock quantity for review",
        "shopify_propose_restock",
        { variant_gid: "gid://shopify/ProductVariant/100500014" },
      ],
    ],
  ],
  [
    "Weekly SEO audit — Journals",
    "L2",
    "active",
    "schedule",
    "Scores Journal titles + meta against SEO best practices and proposes fixes.",
    "chat",
    30,
    [
      [
        "pull",
        "Pull the Journals collection",
        "shopify_list_products",
        { search: "Journals", limit: 50 },
      ],
      [
        "optimize",
        "Optimize meta title + description",
        "shopify_optimize_meta",
        { product_gid: "gid://shopify/Product/100000004" },
      ],
    ],
  ],
  [
    "Retire long-out-of-stock products",
    "L2",
    "active",
    "schedule",
    "Flags products out of stock 90+ days and proposes retiring them.",
    "chat",
    50,
    [
      [
        "scan",
        "Find draft products that may be long out of stock",
        "shopify_list_products",
        { status: "draft", limit: 50 },
      ],
      [
        "archive",
        "Archive on approval",
        "shopify_update_product_status",
        { product_gid: "gid://shopify/Product/100000010", status: "archived" },
      ],
    ],
  ],
  [
    "Tag cleanup — dedupe & fix",
    "L1",
    "active",
    "manual",
    "Finds duplicate and misspelled tags; you run it when ready.",
    "chat",
    96,
    [
      // L1 pauses at the first step by design (WR-05) — single-step definition.
      [
        "scan",
        "Read all product tags",
        "shopify_list_products",
        { limit: 50 },
      ],
    ],
  ],
  [
    "New collection copy — Explorer Series",
    "L1",
    "paused",
    "manual",
    "Drafts collection + product copy for new launches.",
    "chat",
    140,
    [
      [
        "draft",
        "Draft collection copy in brand voice",
        "shopify_optimize_product_description",
        {
          product_gid: "gid://shopify/Product/100000001",
          instructions:
            "Collection launch copy for the Explorer Series. Lead with what it is for.",
        },
      ],
    ],
  ],
  [
    "Fix 'Default Title' products",
    "L3",
    "active",
    "schedule",
    "Rewrites products still showing the placeholder 'Default Title' in search.",
    "chat",
    6,
    [
      [
        "scan",
        "Find 'Default Title' products",
        "shopify_list_products",
        { status: "active", limit: 50 },
      ],
      [
        "rewrite",
        "Rewrite the product description",
        "shopify_optimize_product_description",
        { product_gid: "gid://shopify/Product/100000005" },
      ],
    ],
  ],
  [
    "Weekend discount planner",
    "L2",
    "draft",
    "manual",
    "Plans a themed weekend promotion across a collection.",
    "chat",
    200,
    [
      [
        "scan",
        "Check inventory against the low-stock threshold",
        "shopify_get_inventory",
        { low_stock_threshold: 20 },
      ],
      [
        "price",
        "Set the weekend price",
        "shopify_update_variant_price",
        { variant_gid: "gid://shopify/ProductVariant/100500007", price: 54.4 },
      ],
    ],
  ],
];

// ─── Seeded chat workflow_plan block (module scope — WS1 regression guard) ────
// Thread A's inline workflow_plan message payload — matches workflow 5 above
// (Weekly SEO audit — Journals): pull, optimize, then apply the approved title.
// The old "apply" step dispatched a fake approval-gate tool name — approval is
// an engine behavior, not a tool — replaced here with a real write so
// Save-as-workflow still produces a runnable 3-step workflow and the
// visualizer shows a 3-step plan.
export const DEMO_CHAT_PLAN_STEPS = [
  {
    id: "pull",
    name: "Pull the Journals collection",
    tool: "shopify_list_products",
    description: "31 products",
    params: { search: "Journals", limit: 50 },
  },
  {
    id: "optimize",
    name: "Optimize meta title + description",
    tool: "shopify_optimize_meta",
    params: { product_gid: "gid://shopify/Product/100000004" },
  },
  {
    id: "apply",
    name: "Apply the new meta title",
    tool: "shopify_update_meta_title",
    params: {
      product_gid: "gid://shopify/Product/100000004",
      meta_title: "Refillable A5 Leather Notebook | Wanderbound",
    },
  },
];

/**
 * Seed the Wanderbound/Sarah demo dataset for an arbitrary user_id.
 * Wipes any existing app data for that user first, then inserts the full
 * dataset in one transaction. Safe to call on a brand-new (anonymous) user —
 * the wipe is a no-op when there's nothing there yet.
 *
 * @param opts.skipEmbeddings - when true, skips the post-commit memory
 *   embeddings pass (WS11) so a caller (e.g. the per-visitor sandbox path)
 *   can opt out of the Voyage AI network cost. Default false — embeddings
 *   are seeded by default.
 */
export async function seedDemoFor(
  USER: string,
  opts?: { skipEmbeddings?: boolean }
): Promise<void> {
  // USER GUARD — must be first, before any DB access
  if (!USER) return;

  // ── time helpers (computed at call time so rows stay "recent" on every reset) ──
  const now = new Date();
  const H = (h: number) => new Date(now.getTime() - h * 3600 * 1000);
  const D = (d: number) => new Date(now.getTime() - d * 24 * 3600 * 1000);
  const MIN = (m: number) => new Date(now.getTime() - m * 60 * 1000);
  const future = (d: number) => new Date(now.getTime() + d * 24 * 3600 * 1000);

  // WS11: memory embeddings are seeded AFTER the transaction commits — Voyage
  // AI is a network call, and serviceDb is a max:1 pooled client, so an
  // embedding call made INSIDE this transaction would stall the whole seed
  // (and any other serviceDb caller) for its entire duration. The transaction
  // returns the inserted memory item rows; the embedding pass runs after.
  const seededMemoryItems = await serviceDb.transaction(async (tx) => {
    // ─── 1. WIPE existing app data for this user (child → parent) ────────────────
    await wipeUserData(tx, USER);

    // ─── 2. PROFILE (mark onboarding complete so surfaces don't redirect) ────────
    await tx
      .insert(userProfiles)
      .values({
        user_id: USER,
        display_name: "User",
        shopify_shop: SHOP,
        onboarding_step: 5,
        onboarding_completed_at: D(16),
        created_at: D(16),
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: userProfiles.user_id,
        set: {
          display_name: "User",
          shopify_shop: SHOP,
          onboarding_step: 5,
          onboarding_completed_at: D(16),
          updated_at: now,
        },
      });

    // ─── 3. INTEGRATIONS (Shopify + Gmail connected & healthy) ───────────────────
    await tx.insert(integrations).values({
      user_id: USER,
      provider: "shopify",
      status: "active",
      access_token_encrypted: TOK,
      scopes: [
        "read_products",
        "write_products",
        "read_orders",
        "read_content",
        "write_content",
        "read_inventory",
      ],
      provider_account_id: SHOP,
      last_synced_at: MIN(12),
      connected_at: D(16),
    });
    await tx.insert(integrations).values({
      user_id: USER,
      provider: "gmail",
      status: "active",
      access_token_encrypted: TOK,
      scopes: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      provider_account_id: "sarah@wanderbound.co",
      last_synced_at: MIN(4),
      connected_at: D(16),
    });

    // ─── 3.5 GMAIL MIRROR ────────────────────────────────────────────────────────
    // [gmail_thread_id, subject, fromEmail, isSupport, body_text, agoMin]
    type GmailTuple = [string, string, string, boolean, string, number];
    const gmailRows: GmailTuple[] = [
      // PRODUCT QUESTIONS — isSupport = true (9)
      ["gmail-thread-aa12", "Leather care after rain?", "maria.g@example.com", true, "Hi! I got caught in the rain with my Voyager and it's a bit damp. How do I care for the leather so it doesn't get ruined?", 95],
      ["gmail-thread-bb34", 'Does the Voyager fit a 16" laptop?', "devin.r@example.com", true, "Will my 16-inch MacBook Pro fit in the Voyager Weekender? Looking for something for weekend work trips.", 140],
      ["gmail-thread-cc56", "Gift wrapping available?", "priya.s@example.com", true, "Do you offer gift wrapping? I want to send the Field Notebook to my sister for her birthday next week.", 210],
      ["gmail-thread-dd78", "Replacement strap for the Summit?", "tom.b@example.com", true, "The shoulder strap on my Summit Backpack is fraying after two years. Can I buy a replacement strap?", 330],
      ["gmail-thread-ee90", "Tan vs Cognac in person?", "aisha.k@example.com", true, "How different are the Tan and Cognac in person? Hard to tell from the photos which one I'd like.", 480],
      ["gmail-thread-ff12", "Can you monogram the Dopp Kit?", "marcus.l@example.com", true, "Do you do monogramming or initials on the Explorer Dopp Kit? Want to gift it to my brother.", 620],
      ["gmail-thread-gg34", "Voyager vs Summit for a 5-day trip?", "elena.v@example.com", true, "Trying to decide between the Voyager Weekender and the Summit Backpack for a 5-day trip. Which would you recommend?", 760],
      ["gmail-thread-hh56", "Does the Dopp Kit hold full-size bottles?", "jordan.p@example.com", true, "Will the Explorer Dopp Kit fit full-size toiletry bottles, or is it more for travel sizes?", 910],
      ["gmail-thread-ii78", "Caring for waxed canvas?", "nina.r@example.com", true, "I have one of your waxed canvas pouches — does it need different care than the leather pieces?", 1080],
      // ORDER-STATUS — isSupport = false (6)
      ["gmail-thread-oo01", "Where's my order #WB-48217?", "greg.m@example.com", false, "Hi, I placed order #WB-48217 five days ago and haven't seen a shipping update. Can you check the status?", 175],
      ["gmail-thread-oo02", "Order still processing?", "sara.t@example.com", false, "My order from last week still says processing. Is everything okay with it?", 260],
      ["gmail-thread-oo03", "Tracking number?", "liam.c@example.com", false, "Could you send me the tracking number for my recent order? I want to make sure I'm home for delivery.", 400],
      ["gmail-thread-oo04", "Delivery estimate?", "bea.n@example.com", false, "When should I expect my Field Notebook to arrive? Ordered it Tuesday.", 540],
      ["gmail-thread-oo05", "Change shipping address", "owen.d@example.com", false, "I just moved — can you update the shipping address on my order before it goes out?", 700],
      ["gmail-thread-oo06", "Order #WB-47990 status", "chloe.f@example.com", false, "Checking in on order #WB-47990 — the tracking hasn't updated in three days.", 860],
      // NEWSLETTER — isSupport = false (5)
      ["gmail-thread-nn01", "Re: Weekend at Wanderbound", "hannah.w@example.com", false, "Just wanted to say I love these emails — the photography is gorgeous. Keep them coming!", 300],
      ["gmail-thread-nn02", "Unsubscribe", "paul.g@example.com", false, "Please remove me from your mailing list. Thanks.", 450],
      ["gmail-thread-nn03", "Re: New arrivals", "yuki.m@example.com", false, "When's the next drop? I've been waiting for the olive colorway to come back.", 600],
      ["gmail-thread-nn04", "Re: Spring lookbook", "dana.r@example.com", false, "Loved the lookbook. Any chance you'll do a version for smaller everyday bags?", 980],
      ["gmail-thread-nn05", "Emailing a bit too often", "frank.h@example.com", false, "You're emailing a bit too often for me — can you dial it back or take me off the list?", 1200],
      // SPAM — isSupport = false (3)
      ["gmail-thread-ss01", "Boost your store traffic 10x", "outreach@rankboost-pro.com", false, "Hi, I noticed your website could rank higher on Google. We guarantee first-page results in 30 days. Reply to learn more.", 520],
      ["gmail-thread-ss02", "You've been selected for a $500 gift card", "noreply@gift-rewards-claim.com", false, "Congratulations! You have been selected to receive a $500 gift card. Click here to claim before it expires.", 1320],
      ["gmail-thread-ss03", "Quick question about Wanderbound", "hello@growth-agency-outreach.biz", false, "Hey, I help DTC brands scale to 7 figures. Do you have 15 minutes this week for a quick call?", 1500],
    ];

    for (const [tid, subject, fromEmail, isSupport, body, agoMin] of gmailRows) {
      await tx.insert(gmailThreads).values({
        user_id: USER,
        gmail_thread_id: tid,
        subject,
        participants: [fromEmail, "sarah@wanderbound.co"],
        is_customer_support: isSupport,
        last_message_at: MIN(agoMin),
        message_count: 1,
        last_synced_at: MIN(4),
      });
      await tx.insert(gmailMessages).values({
        user_id: USER,
        gmail_message_id: `msg-${tid}`,
        gmail_thread_id: tid,
        from_address: fromEmail,
        to_addresses: ["sarah@wanderbound.co"],
        subject,
        body_text: body,
        body_html: null,
        direction: "inbound",
        gmail_received_at: MIN(agoMin),
        last_synced_at: MIN(4),
      });
    }

    // ─── 4. BRAND VOICE ──────────────────────────────────────────────────────────
    const brandMd = `# Wanderbound — Brand Voice

**Who we are:** Small-batch leather goods for people who actually travel. Notebooks, passport wallets, weekenders. Made by hand in Austin.

**How we sound:** Warm, plainspoken, a little dry. We talk about the craft and the materials, not the lifestyle fantasy. Short sentences. Concrete details over adjectives.

**Do**
- Name the material and where it ages well ("full-grain leather that softens with use").
- Lead with what the thing is for.
- Write like a maker talking to a friend.

**Don't**
- No hype words ("luxurious", "premium", "game-changer", "elevate your").
- Never invent specs we haven't confirmed (paper weight, fountain-pen-friendliness, capacity) — ground every claim in the product data.
- No exclamation points in product copy.`;

    await tx.insert(brandVoiceProfiles).values({
      user_id: USER,
      profile_markdown: brandMd,
      tone_tags: ["warm", "plainspoken", "crafted", "unfussy", "dry"],
      forbidden_phrases: [
        "luxurious",
        "premium",
        "game-changer",
        "elevate your",
        "synergy",
        "best-in-class",
      ],
      example_url: "https://wanderbound.co/pages/about",
      updated_at: D(9),
    });

    // ─── 5. AUTONOMY THRESHOLDS ───────────────────────────────────────────────────
    await tx.insert(autonomyThresholds).values({
      user_id: USER,
      default_level: "L2",
      per_action_overrides: {
        update_image_alt: "L3",
        update_meta_desc: "L3",
        update_meta_title: "L2",
        update_status: "L3",
        update_product: "L2",
        update_price: "L1",
        create_discount: "L1",
        send_email_reply: "L2",
      },
      updated_at: D(4),
    });

    // ─── 6. MEMORY ITEMS ──────────────────────────────────────────────────────────
    const mem: [string, string, string, number, Date][] = [
      [
        "preference",
        "Approves discounts in the 10–20% range; consistently rejects anything above 25%. Default discount proposals to ≤20%.",
        "agent_inferred",
        0.92,
        D(6),
      ],
      [
        "brand",
        "Voice is warm and plainspoken. Rejected three rewrites for sounding 'salesy' — avoid 'luxurious', 'premium', 'elevate'.",
        "agent_inferred",
        0.88,
        D(8),
      ],
      [
        "catalog",
        "143 SKUs across three lines: Journals, Explorer Series (travel goods), and Everyday Carry. The Voyager Weekender is the flagship.",
        "onboarding",
        0.99,
        D(16),
      ],
      [
        "policy",
        "Never invent product specs (paper weight, fountain-pen-friendly, laptop fit) unless confirmed in Shopify product data. Ask if unknown.",
        "user_explicit",
        0.97,
        D(14),
      ],
      [
        "decision_history",
        "On 2026-05-14 Sarah approved retiring 5 products that were out of stock 90+ days. She prefers 'retire' over 'hide'.",
        "agent_inferred",
        0.9,
        D(12),
      ],
      [
        "preference",
        "Prefers overnight async runs with a morning summary over live supervision — she has ~10 min between packing orders.",
        "agent_inferred",
        0.85,
        D(7),
      ],
    ];
    // Capture inserted ids + content (WS11) — the post-commit embeddings pass
    // needs both, and cannot re-query inside this transaction (see the
    // module-level comment on the embeddings pass, below).
    const insertedMemoryItems: Array<{ id: string; content: string }> = [];
    for (const [category, content, source_type, confidence, created] of mem) {
      const [row] = await tx
        .insert(memoryItems)
        .values({
          user_id: USER,
          category,
          content,
          source_type,
          confidence,
          created_at: created,
          updated_at: created,
        })
        .returning({ id: memoryItems.id, content: memoryItems.content });
      if (row) insertedMemoryItems.push(row);
    }

    // ─── 7. SESSIONS ──────────────────────────────────────────────────────────────
    const sess: [string, string, Date, Date][] = [
      ["Chrome on macOS", "Austin, US (approximate)", MIN(2), D(3)],
      ["Safari on iPhone", "Austin, US (approximate)", H(22), D(11)],
      ["Chrome on Windows", "Dallas, US (approximate)", D(5), D(15)],
    ];
    for (const [device, geo, seen, created] of sess) {
      await tx.insert(userSessions).values({
        user_id: USER,
        supabase_session_id: randomUUID(),
        device_label: device,
        ip_geo_label: geo,
        last_seen_at: seen,
        created_at: created,
      });
    }

    // ─── 8. SHOPIFY PRODUCTS (representative slice of the 143-SKU catalog) ────────
    const products: [
      string,
      string,
      string,
      string[],
      string | null,
      string | null,
      number,
      number,
    ][] = [
      [
        "The Voyager Weekender",
        "Explorer Series",
        "active",
        ["leather", "travel", "bag", "flagship"],
        "The Voyager Weekender — full-grain leather duffel",
        "A full-grain leather weekender built for two nights away. Softens with use.",
        18900,
        12,
      ],
      [
        "Voyager 16\" Laptop Sleeve",
        "Explorer Series",
        "active",
        ["leather", "travel", "tech"],
        null,
        null,
        7400,
        31,
      ],
      [
        "Passport Wallet — Bridle",
        "Explorer Series",
        "active",
        ["leather", "travel", "wallet"],
        "Bridle leather passport wallet",
        null,
        5200,
        48,
      ],
      [
        "The Field Notebook A5",
        "Journals",
        "active",
        ["notebook", "journal", "a5"],
        "Field Notebook A5 — refillable leather cover",
        "Refillable A5 cover in full-grain leather. Holds two standard inserts.",
        4200,
        70,
      ],
      [
        "The Field Notebook A6",
        "Journals",
        "active",
        ["notebook", "journal", "a6"],
        null,
        null,
        3400,
        64,
      ],
      [
        "Daily Carry Journal",
        "Journals",
        "active",
        ["notebook", "journal"],
        null,
        "",
        3800,
        22,
      ],
      [
        "Explorer Dopp Kit",
        "Explorer Series",
        "active",
        ["leather", "travel", "kit"],
        "Explorer Dopp Kit — waxed canvas + leather",
        null,
        6800,
        18,
      ],
      [
        "Card Sleeve — Minimal",
        "Everyday Carry",
        "active",
        ["leather", "wallet", "edc"],
        null,
        null,
        2800,
        90,
      ],
      [
        "Key Fob — Riveted",
        "Everyday Carry",
        "active",
        ["leather", "edc"],
        "Riveted leather key fob",
        null,
        1800,
        120,
      ],
      [
        "The Cartographer Roll",
        "Explorer Series",
        "draft",
        ["leather", "travel", "new"],
        null,
        null,
        9200,
        0,
      ],
      [
        "Notebook Refill — Dot Grid",
        "Journals",
        "active",
        ["refill", "journal"],
        null,
        "Dot grid refill, 64 pages.",
        900,
        240,
      ],
      [
        "Notebook Refill — Lined",
        "Journals",
        "active",
        ["refill", "journal"],
        null,
        null,
        900,
        210,
      ],
      [
        "Travel Tag Set",
        "Explorer Series",
        "active",
        ["leather", "travel", "tag"],
        null,
        null,
        2400,
        7,
      ],
      [
        "The Summit Backpack",
        "Explorer Series",
        "active",
        ["leather", "travel", "bag"],
        "Summit Backpack — full-grain, 18L",
        "An 18L everyday-and-travel pack in full-grain leather.",
        24800,
        4,
      ],
    ];

    let pidx = 100000001;
    for (const [
      title,
      ptype,
      status,
      tags,
      meta_title,
      meta_desc,
      price,
      qty,
    ] of products) {
      const pgid = `gid://shopify/Product/${pidx}`;
      const vgid = `gid://shopify/ProductVariant/${pidx + 500000}`;
      await tx.insert(shopifyProducts).values({
        user_id: USER,
        product_gid: pgid,
        title,
        body_html: meta_desc ? `<p>${meta_desc}</p>` : null,
        vendor: "Wanderbound",
        product_type: ptype,
        status,
        tags,
        meta_title,
        meta_description: meta_desc || null,
        shopify_created_at: D(120),
        shopify_updated_at: D(Math.floor(Math.random() * 20) + 1),
        last_synced_at: MIN(12),
      });
      await tx.insert(shopifyProductVariants).values({
        user_id: USER,
        variant_gid: vgid,
        product_gid: pgid,
        sku: "WB-" + pidx,
        price: (price / 100).toFixed(2),
        inventory_qty: qty,
        last_synced_at: MIN(12),
      });
      pidx++;
    }

    // ─── 8.5 ORDERS (WS11) — backs the inventory + Q&A order-status stories ──────
    // Order #WB-48217 and #WB-47990 are the two orders the seeded inbox asks
    // about (§3.5 gmailRows above): gmail-thread-oo01 ("Where's my order
    // #WB-48217?" from greg.m@example.com) and gmail-thread-oo06 ("Order
    // #WB-47990 status" from chloe.f@example.com). Kept explicit here so a
    // future editor doesn't decouple the order data from the inbox story.
    type OrderTuple = [string, string, string, number, number];
    const orderDefs: OrderTuple[] = [
      // [order_gid suffix, financial_status, fulfillment_status, daysAgo, total($)]
      ["48217", "paid", "unfulfilled", 5, 189.0], // greg.m@example.com — Voyager Weekender
      ["47990", "paid", "fulfilled", 12, 74.0], // chloe.f@example.com — Laptop Sleeve
      // 16 more spread across the last 30 days — ~70% paid+fulfilled, ~20%
      // paid+unfulfilled, ~10% refunded — totals drawn from real seeded price points.
      ["48201", "paid", "fulfilled", 1, 52.0],
      ["48195", "paid", "fulfilled", 2, 42.0],
      ["48188", "paid", "fulfilled", 3, 68.0],
      ["48176", "paid", "fulfilled", 4, 24.0],
      ["48160", "paid", "fulfilled", 6, 18.0],
      ["48142", "paid", "fulfilled", 8, 38.0],
      ["48120", "paid", "fulfilled", 10, 189.0],
      ["48099", "paid", "fulfilled", 13, 34.0],
      ["48075", "paid", "fulfilled", 16, 9.0],
      ["48050", "paid", "fulfilled", 19, 28.0],
      ["48030", "paid", "fulfilled", 23, 248.0],
      ["48110", "paid", "unfulfilled", 9, 74.0],
      ["48060", "paid", "unfulfilled", 18, 52.0],
      ["48015", "paid", "unfulfilled", 27, 189.0],
      ["48090", "refunded", "unfulfilled", 14, 42.0],
      ["48005", "refunded", "unfulfilled", 29, 68.0],
    ];

    for (const [
      suffix,
      financial_status,
      fulfillment_status,
      daysAgo,
      total,
    ] of orderDefs) {
      await tx.insert(shopifyOrders).values({
        user_id: USER,
        order_gid: `gid://shopify/Order/${suffix}`,
        total: total.toFixed(2),
        financial_status,
        fulfillment_status,
        shopify_created_at: D(daysAgo),
        last_synced_at: MIN(12),
      });
    }

    // ─── 8.6 PAGES + REDIRECTS (WS11) — SEO tools return data, not [] ────────────
    const pageDefs: [string, string, string, string][] = [
      // [page_gid suffix, title, handle, body_html]
      [
        "1001",
        "About",
        "about",
        "<p>Small-batch leather goods made by hand in Austin. We build for people who actually travel.</p>",
      ],
      [
        "1002",
        "Shipping & Returns",
        "shipping-returns",
        "<p>Orders ship within 2 business days. Returns are accepted within 30 days in unused condition.</p>",
      ],
      [
        // Grounds the leather-care Q&A playbook answers (gmail-thread-aa12).
        "1003",
        "Leather Care",
        "leather-care",
        "<p>Full-grain leather softens and darkens with use. Wipe with a damp cloth, let it air-dry away from direct heat, and condition every few months with a leather balm. A little rain won't hurt it — just let it dry naturally before conditioning.</p>",
      ],
    ];
    for (const [suffix, title, handle, body_html] of pageDefs) {
      await tx.insert(shopifyPages).values({
        user_id: USER,
        page_gid: `gid://shopify/Page/${suffix}`,
        title,
        body_html,
        handle,
        last_synced_at: MIN(12),
      });
    }

    const redirectDefs: [string, string, string][] = [
      ["2001", "/products/trail-card-holder", "/products/card-sleeve-minimal"],
      ["2002", "/products/mini-passport-sleeve-v1", "/products/passport-wallet-bridle"],
    ];
    for (const [suffix, path, target] of redirectDefs) {
      await tx.insert(shopifyRedirects).values({
        user_id: USER,
        redirect_id: suffix,
        path,
        target,
        last_synced_at: MIN(12),
      });
    }

    // ─── 8.7 SYNC STATE (WS11) — Settings health checks read correctly ──────────
    await tx.insert(shopifySyncState).values({
      user_id: USER,
      last_full_sync_at: MIN(12),
      last_poll_at: MIN(12),
      sync_status: "healthy",
      webhook_subscriptions: [],
    });
    await tx.insert(gmailSyncState).values({
      user_id: USER,
      last_history_id: "184230771",
      last_poll_at: MIN(4),
      sync_status: "healthy",
    });

    // ─── 9. WORKFLOWS (+ versions) ────────────────────────────────────────────────
    // Definitions live at module scope (DEMO_WORKFLOW_DEFS, below wipeUserData) so
    // tests/unit/seed-registry.test.ts can import + validate them without a DB.
    const wfDefs = DEMO_WORKFLOW_DEFS;

    const wf: Record<
      string,
      { id: string; verId: string; def: Record<string, unknown> }
    > = {};

    for (const [
      name,
      level,
      status,
      trig,
      desc,
      source,
      updAgo,
      steps,
    ] of wfDefs) {
      const id = randomUUID();
      const verId = randomUUID();
      const def: Record<string, unknown> = {
        entry_step: steps[0]![0],
        steps: steps.map((s, i) => ({
          id: s[0],
          name: s[1],
          tool: s[2],
          type: "action",
          params: s[3],
          next_step: steps[i + 1]?.[0] ?? null,
        })),
      };

      const triggerConfig =
        trig === "schedule"
          ? { cron: "0 3 * * *", tz: "America/Chicago" }
          : trig === "event"
            ? { event: name }
            : {};

      await tx.insert(workflows).values({
        id,
        user_id: USER,
        name,
        description: desc,
        automation_level: level,
        status,
        trigger_type: trig,
        trigger_config: triggerConfig,
        current_version_id: verId,
        source,
        created_at: D(16),
        updated_at: H(updAgo),
      });

      await tx.insert(workflowVersions).values({
        id: verId,
        workflow_id: id,
        version_number: 1,
        definition: def,
        schema_version: 1,
        created_at: D(16),
      });

      wf[name] = { id, verId, def };
    }

    // give a couple workflows extra version history
    for (const nm of [
      "Weekly SEO audit — Journals",
      "Answer customer product questions",
    ]) {
      const w = wf[nm]!;
      const v2 = randomUUID();
      await tx.insert(workflowVersions).values({
        id: v2,
        workflow_id: w.id,
        version_number: 2,
        definition: w.def,
        schema_version: 1,
        created_at: D(2),
      });
      await tx
        .update(workflows)
        .set({ current_version_id: v2 })
        .where(eq(workflows.id, w.id));
      w.verId = v2;
    }

    // ─── 10. WORKFLOW RUNS ────────────────────────────────────────────────────────
    // [wfName, trigger_source, status, startedAgoH, completedAgoH|null, error|null]
    type RunDefTuple = [string, string, string, number, number | null, string | null];
    const runDefs: RunDefTuple[] = [
      ["Alt text for new product images", "schedule", "succeeded", 3, 3, null],
      ["Alt text for new product images", "schedule", "succeeded", 27, 27, null],
      ["Fix empty meta descriptions", "schedule", "succeeded", 9, 9, null],
      ["Fix 'Default Title' products", "schedule", "succeeded", 6, 6, null],
      ["Weekly SEO audit — Journals", "schedule", "succeeded", 30, 30, null],
      [
        "Answer customer product questions",
        "event",
        "paused_for_approval",
        2,
        null,
        null,
      ],
      [
        "Low-stock flash-sale proposals",
        "event",
        "paused_for_approval",
        5,
        null,
        null,
      ],
      ["Retire long-out-of-stock products", "schedule", "succeeded", 50, 49, null],
      [
        "Fix empty meta descriptions",
        "schedule",
        "failed",
        33,
        33,
        "Shopify API rate limit — retried, 3 of 47 deferred to next run",
      ],
      ["Tag cleanup — dedupe & fix", "manual", "succeeded", 96, 95, null],
    ];

    const runs: Record<string, string[]> = {};
    for (const [nm, trig, status, sAgo, cAgo, err] of runDefs) {
      const w = wf[nm]!;
      const rid = randomUUID();
      await tx.insert(workflowRuns).values({
        id: rid,
        user_id: USER,
        workflow_id: w.id,
        workflow_version_id: w.verId,
        workflow_version_snapshot: w.def,
        trigger_source: trig,
        status,
        current_step_id:
          status === "paused_for_approval" ? "approve" : null,
        error_summary: err,
        started_at: H(sAgo),
        completed_at: cAgo == null ? null : H(cAgo),
      });
      (runs[nm] ??= []).push(rid);
    }

    // ─── 11. APPROVALS (pending) ──────────────────────────────────────────────────
    // [action_type, summary, stakes, preview, reasoning, downstream, estSec, proposed, createdAgoH, runWf?]
    type ApprDefTuple = [
      string,
      string,
      string,
      Record<string, unknown>,
      string | null,
      string | null,
      number,
      Record<string, unknown>,
      number,
      string | null,
    ];
    const apprDefs: ApprDefTuple[] = [
      [
        "shopify_create_discount",
        "Set 20% weekend discount on Explorer Series (6 SKUs)",
        "high",
        {
          window: "Fri 6pm – Mon 9am CT",
          items: [
            {
              sku: "WB-100000001",
              title: "The Voyager Weekender",
              from: "$189.00",
              to: "$151.20",
            },
            {
              sku: "WB-100000007",
              title: "Explorer Dopp Kit",
              from: "$68.00",
              to: "$54.40",
            },
            {
              sku: "WB-100000014",
              title: "The Summit Backpack",
              from: "$248.00",
              to: "$198.40",
            },
          ],
          showing: "3 of 6",
        },
        "Explorer Series sell-through dipped 14% over the last two weeks; a short weekend promo clears slow movers without touching the flagship margin too hard. Held it at 20% — your ceiling is 25% and you usually land at ≤20%.",
        "Reduces gross margin on these 6 SKUs by ~12% for the sale window. At last weekend's traffic that's roughly $310 in margin against an estimated $1,900 in incremental revenue.",
        90,
        {
          action: "create_discount",
          percentage: 20,
          collection: "Explorer Series",
          skus: ["WB-100000001", "WB-100000007", "WB-100000014"],
          starts_at: "2026-05-29T18:00:00-05:00",
          ends_at: "2026-06-01T09:00:00-05:00",
        },
        5,
        "Low-stock flash-sale proposals",
      ],
      [
        "shopify_update_product_description",
        "Rewrite flagship description: The Voyager Weekender",
        "high",
        {
          before:
            "A full-grain leather weekender built for two nights away. Softens with use.",
          after: "Two nights, one bag. The Voyager is full-grain leather that breaks in like a good pair of boots — stiff at first, then yours. Fits a long weekend without checking it.",
        },
        "Current copy is thin for the flagship. Rewrote in your voice — concrete, no hype — and grounded the capacity claim in the product spec (carry-on size).",
        "This is the flagship product page; copy changes here affect the highest-traffic listing.",
        75,
        {
          action: "update_product",
          product_gid: "gid://shopify/Product/100000001",
          field: "body_html",
          value: "Two nights, one bag. The Voyager is full-grain leather that breaks in like a good pair of boots — stiff at first, then yours. Fits a long weekend without checking it.",
        },
        8,
        null,
      ],
      [
        "send_email_reply",
        "Reply to Maria G. — leather care instructions",
        "med",
        {
          customer: "Maria G.",
          question: "How do I care for the leather? Mine got caught in the rain.",
          draft: "Hi Maria — good news, a little rain won't hurt it. Let it air-dry away from heat, then rub in a thin coat of leather conditioner once it's fully dry. It'll darken slightly and even out over time. Happy to send our care card if useful.",
        },
        "Standard care question. Drafted a reply grounded in the care guidance on the product page; matched your warm, plainspoken tone.",
        null,
        45,
        {
          action: "send_email_reply",
          thread: "gmail-thread-aa12",
          to: "maria.g@example.com",
          body: "Hi Maria — good news, a little rain won't hurt it...",
        },
        1,
        "Answer customer product questions",
      ],
      [
        "shopify_update_meta_title",
        "Update meta titles for 8 Journal products",
        "med",
        {
          showing: "3 of 8",
          items: [
            {
              title: "The Field Notebook A5",
              from: "The Field Notebook A5",
              to: "Refillable A5 Leather Notebook | Wanderbound",
            },
            {
              title: "The Field Notebook A6",
              from: "Default Title",
              to: "Refillable A6 Leather Notebook | Wanderbound",
            },
            {
              title: "Daily Carry Journal",
              from: "Daily Carry Journal",
              to: "Daily Carry Leather Journal | Wanderbound",
            },
          ],
        },
        "These 8 Journal titles either repeat the product name or still read 'Default Title'. Added the material + format keywords buyers search, kept under 60 chars, appended the brand.",
        null,
        60,
        {
          action: "update_meta_title",
          products: 8,
          collection: "Journals",
        },
        14,
        "Weekly SEO audit — Journals",
      ],
      [
        "shopify_update_inventory_status",
        "Retire 3 products out of stock 90+ days",
        "low",
        {
          // WS11: titles match the real seeded GIDs below (dangling-GID fix) —
          // the approval card and the catalog now agree.
          items: [
            { title: "The Cartographer Roll", oos_days: 112 },
            { title: "Travel Tag Set", oos_days: 98 },
            { title: "Key Fob — Riveted", oos_days: 94 },
          ],
        },
        "These three have been out of stock 90+ days with no restock planned. Proposing to retire (archive) them — your past preference was 'retire' over 'hide'.",
        null,
        30,
        {
          action: "update_status",
          status: "archived",
          product_gids: [
            "gid://shopify/Product/100000010",
            "gid://shopify/Product/100000013",
            "gid://shopify/Product/100000009",
          ],
        },
        20,
        "Retire long-out-of-stock products",
      ],
      [
        "send_email_reply",
        "Reply to Devin R. — does the Voyager fit a 16\" laptop?",
        "med",
        {
          customer: "Devin R.",
          question: "Will my 16-inch MacBook Pro fit in the Voyager Weekender?",
          draft: "Hi Devin — the Voyager doesn't have a padded laptop compartment, so for a 16-inch I'd pair it with our Voyager 16\" Laptop Sleeve, which is sized for exactly that. The sleeve slides right into the main compartment.",
        },
        "Compatibility question. I did NOT claim a laptop fit the Voyager doesn't have — instead pointed to the sleeve that's actually sized for 16\". (Per your rule: don't invent specs.)",
        null,
        50,
        {
          action: "send_email_reply",
          thread: "gmail-thread-bb34",
          to: "devin.r@example.com",
          body: "Hi Devin — the Voyager doesn't have a padded laptop compartment...",
        },
        3,
        "Answer customer product questions",
      ],
    ];

    const appr: Record<string, string> = {};
    for (const [
      atype,
      summary,
      stakes,
      preview,
      reasoning,
      downstream,
      est,
      proposed,
      cAgo,
      runWf,
    ] of apprDefs) {
      const id = randomUUID();
      const runId = runWf ? (runs[runWf]?.[0] ?? null) : null;
      await tx.insert(approvals).values({
        id,
        user_id: USER,
        workflow_run_id: runId,
        status: "pending",
        action_type: atype,
        action_summary: summary,
        stakes,
        preview,
        reasoning_summary: reasoning ?? "",
        reasoning_chain: null,
        downstream_impact: downstream,
        estimated_review_seconds: est,
        proposed_action: proposed,
        inngest_event_key: "demo-" + id,
        expires_at: future(13),
        created_at: H(cAgo),
      });
      appr[summary] = id;
    }

    // ─── 12. ACTIVITY ENTRIES ──────────────────────────────────────────────────────
    // [summary, action_type, result, level, agent_context, occurredAgoH, target_type, target_id, wfName?, revertable, before, after]
    type ActTuple = [
      string,
      string,
      string,
      string | null,
      string,
      number,
      string | null,
      string | null,
      string | null,
      boolean,
      Record<string, unknown> | null,
      Record<string, unknown> | null,
    ];
    const acts: ActTuple[] = [
      [
        "Added alt text to 22 product images",
        "update_image_alt",
        "success",
        "L3",
        "catalog",
        3,
        "product",
        "gid://shopify/Product/100000004",
        "Alt text for new product images",
        true,
        null,
        null,
      ],
      [
        "Fixed 4 products showing 'Default Title'",
        "update_product",
        "success",
        "L3",
        "catalog",
        6,
        "product",
        "gid://shopify/Product/100000005",
        "Fix 'Default Title' products",
        true,
        { title: "Default Title" },
        { title: "Refillable A6 Leather Notebook" },
      ],
      [
        "Rewrote 9 empty meta descriptions",
        "update_meta_desc",
        "success",
        "L3",
        "seo",
        9,
        "product",
        "gid://shopify/Product/100000006",
        "Fix empty meta descriptions",
        true,
        null,
        null,
      ],
      [
        "Tagged 3 out-of-stock items for review",
        "update_status",
        "success",
        "L3",
        "inventory",
        11,
        "product",
        "gid://shopify/Product/100000010",
        "Retire long-out-of-stock products",
        true,
        null,
        null,
      ],
      [
        "Drafted reply to Maria G. (leather care)",
        "send_email_draft",
        "success",
        "L2",
        "qa",
        2,
        "email",
        "gmail-thread-aa12",
        "Answer customer product questions",
        true,
        null,
        null,
      ],
      [
        "Rewrote SEO titles for 8 Journals",
        "update_meta_title",
        "success",
        "L2",
        "seo",
        30,
        "product",
        "gid://shopify/Product/100000004",
        "Weekly SEO audit — Journals",
        true,
        null,
        null,
      ],
      [
        "Proposed 20% Explorer Series weekend discount",
        "update_price",
        "success",
        "L2",
        "inventory",
        5,
        "collection",
        "Explorer Series",
        "Low-stock flash-sale proposals",
        false,
        null,
        null,
      ],
      [
        "Deduped 41 of 340 product tags",
        "update_product",
        "partial",
        "L1",
        "catalog",
        95,
        "product",
        null,
        "Tag cleanup — dedupe & fix",
        true,
        null,
        null,
      ],
      [
        "Added alt text to 18 product images",
        "update_image_alt",
        "success",
        "L3",
        "catalog",
        27,
        "product",
        "gid://shopify/Product/100000007",
        "Alt text for new product images",
        true,
        null,
        null,
      ],
      [
        "Meta description run hit a rate limit",
        "update_meta_desc",
        "partial",
        "L3",
        "seo",
        33,
        "product",
        null,
        "Fix empty meta descriptions",
        false,
        null,
        null,
      ],
      [
        "Drafted reply to Devin R. (laptop fit)",
        "send_email_draft",
        "success",
        "L2",
        "qa",
        3,
        "email",
        "gmail-thread-bb34",
        "Answer customer product questions",
        true,
        null,
        null,
      ],
      [
        "Retired 5 products out of stock 90+ days",
        "update_status",
        "success",
        "L2",
        "inventory",
        49,
        "product",
        null,
        "Retire long-out-of-stock products",
        true,
        null,
        null,
      ],
      [
        "Synced 143 products from Shopify",
        "sync",
        "success",
        null,
        "catalog",
        12,
        null,
        null,
        null,
        false,
        null,
        null,
      ],
      [
        "Updated meta title: The Field Notebook A5",
        "update_meta_title",
        "success",
        "L2",
        "seo",
        30,
        "product",
        "gid://shopify/Product/100000004",
        "Weekly SEO audit — Journals",
        true,
        { meta_title: "The Field Notebook A5" },
        { meta_title: "Refillable A5 Leather Notebook | Wanderbound" },
      ],
      [
        "Added alt text: 'full-grain leather weekender, tan'",
        "update_image_alt",
        "success",
        "L3",
        "catalog",
        3,
        "product",
        "gid://shopify/Product/100000001",
        "Alt text for new product images",
        true,
        { alt: "" },
        { alt: "full-grain leather weekender, tan, standing upright" },
      ],
      [
        "Classified 23 inbox emails (9 product questions)",
        "classify",
        "success",
        "L3",
        "qa",
        14,
        "email",
        null,
        "Answer customer product questions",
        false,
        null,
        null,
      ],
      [
        "Wrote meta description: Explorer Dopp Kit",
        "update_meta_desc",
        "success",
        "L3",
        "seo",
        9,
        "product",
        "gid://shopify/Product/100000007",
        "Fix empty meta descriptions",
        true,
        { meta_description: "" },
        {
          meta_description:
            "Waxed canvas and full-grain leather dopp kit. Wipes clean, packs flat.",
        },
      ],
      [
        "Drafted weekend sale email (held for approval)",
        "send_email_draft",
        "success",
        "L2",
        "qa",
        5,
        "email",
        null,
        "Low-stock flash-sale proposals",
        true,
        null,
        null,
      ],
      [
        "Skipped 12 variant images (master product)",
        "update_image_alt",
        "success",
        "L3",
        "catalog",
        27,
        "product",
        null,
        "Alt text for new product images",
        false,
        null,
        null,
      ],
      [
        "Flagged Explorer Series not rendering on mobile",
        "diagnose",
        "success",
        "L1",
        "catalog",
        70,
        "collection",
        "Explorer Series",
        null,
        false,
        null,
        null,
      ],
      [
        "Updated inventory thresholds for 6 slow-movers",
        "update_inventory",
        "success",
        "L1",
        "inventory",
        120,
        "product",
        null,
        null,
        true,
        null,
        null,
      ],
      [
        "Generated 11 alt texts overnight",
        "update_image_alt",
        "success",
        "L3",
        "catalog",
        27,
        "product",
        null,
        "Alt text for new product images",
        true,
        null,
        null,
      ],
      [
        "Rewrote description: Daily Carry Journal",
        "update_product",
        "success",
        "L2",
        "catalog",
        50,
        "product",
        "gid://shopify/Product/100000006",
        null,
        true,
        null,
        null,
      ],
      [
        "Sent reply to Priya S. (gift wrapping)",
        "send_email_reply",
        "success",
        "L2",
        "qa",
        44,
        "email",
        "gmail-thread-cc56",
        "Answer customer product questions",
        true,
        null,
        null,
      ],
      [
        "Created redirect for retired Trail Card Holder",
        "create_redirect",
        "success",
        "L2",
        "seo",
        49,
        "page",
        null,
        "Retire long-out-of-stock products",
        true,
        null,
        null,
      ],
      [
        "Audit: 47 products with weak/empty meta",
        "audit",
        "success",
        "L1",
        "seo",
        30,
        null,
        null,
        "Weekly SEO audit — Journals",
        false,
        null,
        null,
      ],
    ];

    for (const [
      summary,
      atype,
      result,
      level,
      ctx,
      oAgo,
      ttype,
      tid,
      wfName,
      rev,
      before,
      after,
    ] of acts) {
      const wfId = wfName ? (wf[wfName]?.id ?? null) : null;
      await tx.insert(activityEntries).values({
        user_id: USER,
        workflow_id: wfId,
        agent_context: ctx,
        action_type: atype,
        action_summary: summary,
        result,
        automation_level: level,
        before_state: before ?? null,
        after_state: after ?? null,
        target_type: ttype,
        target_id: tid,
        is_revertable: rev,
        occurred_at: H(oAgo),
      });
    }

    // ─── 13. THREADS + MESSAGES ───────────────────────────────────────────────────
    const mkThread = async (
      title: string,
      lastAgoH: number,
      archivedAgo: number | null
    ): Promise<string> => {
      const id = randomUUID();
      await tx.insert(threads).values({
        id,
        user_id: USER,
        title,
        agent_context: "orchestrator",
        last_message_at: H(lastAgoH),
        created_at: H(lastAgoH + 1),
        archived_at: archivedAgo ? D(archivedAgo) : null,
      });
      return id;
    };

    let mseq = 0;
    const msg = async (
      threadId: string,
      role: string,
      content: string,
      createdAgoMin: number,
      blockType: string | null = null,
      blockPayload: Record<string, unknown> | null = null
    ): Promise<string> => {
      const id = randomUUID();
      await tx.insert(messages).values({
        id,
        thread_id: threadId,
        user_id: USER,
        role,
        content,
        inline_block_type: blockType,
        inline_block_payload: blockPayload ?? null,
        status: "complete",
        // WS11: seeded transcripts must match the provider the demo actually
        // runs on (Plan 1 WS6 — Google AI Studio / Gemini). Source of truth
        // for the active profile is MODEL_PROFILE=google (lib/agent/llm/models.ts);
        // if that flips to a different provider, update this literal too.
        model_id: role === "assistant" ? "gemini-3.6-flash" : null,
        token_input: role === "assistant" ? 1800 + mseq * 30 : null,
        token_output: role === "assistant" ? 240 + mseq * 12 : null,
        latency_ms: role === "assistant" ? 1400 + mseq * 50 : null,
        created_at: MIN(createdAgoMin),
      });
      mseq++;
      return id;
    };

    // Thread A — SEO sweep on Journals (with a workflow_plan block)
    const tA = await mkThread("Fix SEO weaknesses in Journals", 30, null);
    await msg(
      tA,
      "user",
      "The Journals collection feels invisible in search. Can you fix the SEO across all of them?",
      1820
    );
    await msg(
      tA,
      "assistant",
      'I pulled all 31 Journal products. 8 have weak or missing meta titles (two still say "Default Title"), 11 have empty meta descriptions, and 6 are missing alt text on their main image. Here\'s how I\'d tackle it — want me to set this up as a recurring workflow?',
      1818,
      "workflow_plan",
      {
        name: "Weekly SEO audit — Journals",
        description:
          "Score Journal titles + meta against SEO best practices and propose fixes.",
        automation_level: "L2",
        trigger_type: "schedule",
        steps: DEMO_CHAT_PLAN_STEPS,
      }
    );
    await msg(
      tA,
      "user",
      "Yes, set it up. But I want to approve title changes — don't just push them.",
      1810
    );
    await msg(
      tA,
      "assistant",
      "Done — saved it at L2, so every title rewrite comes to you for approval first. I went ahead and queued the first 8 title fixes. Here's a sample of one so you can see the direction:",
      1808,
      "preview",
      {
        title: "The Field Notebook A5 — proposed meta title",
        content:
          "**Before:** The Field Notebook A5\n\n**After:** Refillable A5 Leather Notebook | Wanderbound\n\nKept it under 60 characters, led with the material + format people actually search, and appended the brand. No hype words.",
      }
    );
    await msg(tA, "user", "Perfect. Approve those whenever they come through.", 1802);
    await msg(
      tA,
      "assistant",
      "They're in your Approval Inbox now (8 title updates, grouped). The empty meta descriptions and missing alt text are both on autopilot — those are L3 for you — so I'll just handle them and log each one to Activity.",
      1800
    );

    // Thread B — weekend flash sale (interactive, ends with an inline approval card)
    const tB = await mkThread(
      "Weekend flash sale on Explorer Series",
      5,
      null
    );
    await msg(
      tB,
      "user",
      "Explorer Series has been slow. Help me think through a weekend discount.",
      320
    );
    await msg(
      tB,
      "assistant",
      "Looking at the last two weeks: Explorer Series sell-through is down ~14%, with the Voyager Weekender, Dopp Kit, and Summit Backpack moving slowest. A short Fri–Mon promo would clear some without denting the flagship margin too much. You usually land at or below 20%, and your ceiling is 25% — I'd suggest 20%. Want me to draft it?",
      318
    );
    await msg(tB, "user", "20% sounds right. Set it up for this weekend.", 312);
    await msg(
      tB,
      "assistant",
      "Here's the proposed discount. Since price changes are L1 for you, I need your sign-off before anything goes live:",
      310,
      "approval_card",
      {
        approval_id: appr["Set 20% weekend discount on Explorer Series (6 SKUs)"],
        action_type: "shopify_create_discount",
        summary: "Set 20% weekend discount on Explorer Series (6 SKUs)",
        risk: "high",
      }
    );

    // Thread C — inbox triage
    const tC = await mkThread("Catch up on the inbox (23 unread)", 2, null);
    await msg(
      tC,
      "user",
      "I have 23 unread customer emails. Can you go through them?",
      130
    );
    await msg(
      tC,
      "assistant",
      "Went through all 23. 9 are product questions, 6 are order-status checks, 5 are newsletter replies, and 3 are spam. I drafted replies for the 9 product questions in your voice and left them for your approval (two are in your inbox now). The order-status ones I can answer automatically if you connect them to the fulfillment data — want me to set that up?",
      128
    );
    await msg(
      tC,
      "user",
      "Just do the product questions for now. I'll review the drafts.",
      122
    );
    await msg(
      tC,
      "assistant",
      "Two are waiting in your Approval Inbox — the leather-care reply for Maria and the laptop-fit question from Devin. For Devin's I was careful not to claim the Voyager fits a 16\" laptop (it doesn't have a padded sleeve) and pointed him to the sleeve instead — per your rule about not inventing specs.",
      120
    );

    // Thread D — archived (shows the sidebar isn't empty / history exists).
    // WS11: previously had 0 messages — now carries 3, with createdAgoMin
    // consistent with the thread's 380-hour-old last_message_at (380h = 22,800 min).
    const tD = await mkThread("Onboarding — connect store + set voice", 380, 14);
    await msg(
      tD,
      "user",
      "I just finished connecting my Shopify store — can you confirm it synced okay?",
      22850
    );
    await msg(
      tD,
      "assistant",
      "Confirmed — Shopify is connected and I synced 143 products from Wanderbound. Everything looks healthy. Next, let's set your brand voice so I write in your tone from day one.",
      22820
    );
    await msg(
      tD,
      "user",
      "Sounds good — go ahead and set the brand voice from the samples I gave you.",
      22800
    );

    return insertedMemoryItems;
  });

  // ─── Memory embeddings (WS11) — OUTSIDE the transaction, best-effort ────────
  // See the comment above the transaction call for why this must not run
  // inside it. Wrapped in try/catch: seeding must never fail because
  // embeddings are unavailable (missing VOYAGE_API_KEY, 429 rate limit,
  // network error) — the demo is still fully usable without semantic recall.
  if (!opts?.skipEmbeddings && seededMemoryItems.length > 0) {
    try {
      // Single batched call for all six memory items — removes the Voyage
      // free-tier 3 req/min pacing problem entirely (embedTexts, added in
      // lib/agent/embeddings.ts, accepts a string[] `input` per the Voyage API).
      const vectors = await embedTexts(seededMemoryItems.map((m) => m.content));
      await Promise.all(
        seededMemoryItems.map((item, i) =>
          serviceDb.insert(memoryEmbeddings).values({
            user_id: USER,
            source_type: "memory_item",
            source_id: item.id,
            content: item.content,
            embedding: vectors[i],
          })
        )
      );
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "demo.seed.embeddings_failed",
          userId: USER,
          error: String(err),
        })
      );
    }
  }
}

/**
 * Re-seed the SHARED demo account (env DEMO_USER_ID). No-ops if unset, so it's
 * safe in environments where the shared demo isn't configured.
 */
export async function reseedDemo(): Promise<void> {
  const USER = process.env.DEMO_USER_ID;
  if (!USER) return;
  await seedDemoFor(USER);
}

/**
 * Tear down a sandbox visitor's app data. Deletes every seeded row for the user
 * plus their profile, in one transaction. The caller is responsible for removing
 * the auth identity (auth.admin.deleteUser) and the sandbox_sessions row.
 */
export async function wipeDemoFor(USER: string): Promise<void> {
  if (!USER) return;
  await serviceDb.transaction(async (tx) => {
    await wipeUserData(tx, USER);
    await tx.delete(userProfiles).where(eq(userProfiles.user_id, USER));
  });
}
