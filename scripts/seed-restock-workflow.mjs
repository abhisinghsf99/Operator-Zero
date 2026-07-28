#!/usr/bin/env node
/**
 * scripts/seed-restock-workflow.mjs
 * Idempotent setup script: creates the "Low-stock restock proposals" L2 / manual
 * workflow + a workflow_versions row for the connected Shopify dev store user.
 *
 * SECURITY (T-jxq-05):
 *   user_id is resolved via `SELECT user_id FROM user_profiles WHERE shopify_shop =
 *   'operator-zero.myshopify.com'` — never hardcoded, never accepted from input.
 *   Fails loudly (non-zero exit) if no matching row is found.
 *
 * IDEMPOTENCY:
 *   Safe to re-run. If a workflow named 'Low-stock restock proposals' already exists
 *   for the resolved user_id, the script exits 0 without touching the DB.
 *
 * MULTI-TENANT:
 *   user_id is derived from the store — one clear owner, no guessing, no NULL.
 *
 * TARGET VARIANTS:
 *   Low-stock / out-of-stock variants (inventory_qty <= 5, including qty = 0).
 *   Each step uses params: { variant_gid } only — PROPOSE phase, no inventory_qty in params.
 *   The engine dispatches params as tool input; shopify_propose_restock runs PROPOSE path.
 *
 * USAGE:
 *   DATABASE_URL=<6543 session pooler> node scripts/seed-restock-workflow.mjs
 *
 * NOTE: SESSION POOLER port 6543 is required (not transaction pooler 5432) because
 * the script uses multi-statement transactions.
 */

import postgres from "postgres";
import { randomUUID } from "crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

const SHOPIFY_SHOP = "operator-zero.myshopify.com";
const WORKFLOW_NAME = "Low-stock restock proposals";
const WORKFLOW_DESCRIPTION =
  "Scan low-stock and out-of-stock variants, reason a restock-to-target quantity + rationale for each, " +
  "and propose it for your review before writing inventory to Shopify.";

// ─── DB connection ────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  console.error("Usage: DATABASE_URL=<6543 pooler> node scripts/seed-restock-workflow.mjs");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 20, connect_timeout: 30 });

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed] Connecting to database...`);

  // 1. Resolve user_id from user_profiles.shopify_shop (T-jxq-05)
  const profileRows = await sql`
    SELECT user_id
    FROM user_profiles
    WHERE shopify_shop = ${SHOPIFY_SHOP}
    LIMIT 1
  `;

  if (profileRows.length === 0) {
    console.error(
      `ERROR: No user_profiles row found for shopify_shop='${SHOPIFY_SHOP}'`
    );
    console.error(
      `Connect the store first via the app's Settings > Integrations > Shopify.`
    );
    process.exit(1);
  }

  const userId = profileRows[0].user_id;
  console.log(`[seed] Resolved user_id: ${userId}`);

  // 2. Idempotency check: does this workflow already exist for this user?
  const existingWorkflows = await sql`
    SELECT id, current_version_id
    FROM workflows
    WHERE user_id = ${userId}
      AND name = ${WORKFLOW_NAME}
    LIMIT 1
  `;

  if (existingWorkflows.length > 0) {
    const wf = existingWorkflows[0];
    console.log(`[seed] Workflow already exists — skipping (workflow_id: ${wf.id}).`);
    console.log(`[seed] Re-run is a no-op. Done.`);
    await sql.end();
    process.exit(0);
  }

  // 3. Collect target variants: low-stock / OOS (inventory_qty <= 5), scoped to userId
  // Threshold: inventory_qty <= 5 (includes OOS qty=0 variants)
  // CRITICAL: params carries ONLY { variant_gid } — no inventory_qty — so the tool
  // runs its PROPOSE phase (engine dispatches params as tool input).
  const targetVariants = await sql`
    SELECT variant_gid
    FROM shopify_product_variants
    WHERE user_id = ${userId}
      AND inventory_qty IS NOT NULL
      AND inventory_qty <= 5
    ORDER BY variant_gid
    LIMIT 25
  `;

  console.log(`[seed] Found ${targetVariants.length} low-stock/OOS variant(s) (inventory_qty <= 5).`);

  if (targetVariants.length === 0) {
    console.warn(`[seed] WARNING: No low-stock variants found for this user.`);
    console.warn(`[seed] The workflow will be created with 0 steps. Run the Shopify sync first, or all variants have sufficient stock.`);
  }

  // 4. Build workflow version definition
  // Each step: { id, name, tool, type, params: { variant_gid }, next_step }
  // CRITICAL: params carries ONLY { variant_gid } (no inventory_qty)
  // so the tool runs the PROPOSE phase. The engine dispatches params as tool input.
  const steps = targetVariants.map((row, idx) => {
    const stepId = `restock-${idx + 1}`;
    const nextStep = idx < targetVariants.length - 1 ? `restock-${idx + 2}` : null;
    return {
      id: stepId,
      name: `Propose restock for ${row.variant_gid}`,
      tool: "shopify_propose_restock",
      type: "action",
      params: { variant_gid: row.variant_gid },
      next_step: nextStep,
    };
  });

  const entryStep = steps.length > 0 ? steps[0].id : null;

  const definition = {
    entry_step: entryStep,
    steps,
  };

  // 5. Generate IDs
  const workflowId = randomUUID();
  const versionId = randomUUID();

  // 6. Insert workflow + workflow_versions inside a single transaction
  await sql.begin(async (tx) => {
    // Insert workflow first (current_version_id nullable), then version,
    // then update workflow.current_version_id.
    await tx`
      INSERT INTO workflows (
        id,
        user_id,
        name,
        description,
        automation_level,
        status,
        trigger_type,
        trigger_config,
        current_version_id,
        source,
        created_at,
        updated_at
      ) VALUES (
        ${workflowId},
        ${userId},
        ${WORKFLOW_NAME},
        ${WORKFLOW_DESCRIPTION},
        'L2',
        'active',
        'manual',
        '{}',
        NULL,
        'chat',
        NOW(),
        NOW()
      )
    `;

    await tx`
      INSERT INTO workflow_versions (
        id,
        workflow_id,
        version_number,
        definition,
        schema_version,
        created_at
      ) VALUES (
        ${versionId},
        ${workflowId},
        1,
        ${tx.json(definition)},
        1,
        NOW()
      )
    `;

    await tx`
      UPDATE workflows
      SET current_version_id = ${versionId},
          updated_at = NOW()
      WHERE id = ${workflowId}
    `;
  });

  // 7. Summary
  console.log(`[seed] Created workflow:`);
  console.log(`  user_id:     ${userId}`);
  console.log(`  workflow_id: ${workflowId}`);
  console.log(`  version_id:  ${versionId}`);
  console.log(`  steps:       ${steps.length} (one per variant with inventory_qty <= 5, ≤25)`);
  console.log(`[seed] Done. Re-running this script is a no-op (idempotent).`);

  await sql.end();
}

main().catch((err) => {
  console.error(`[seed] Fatal error:`, err);
  process.exit(1);
});
