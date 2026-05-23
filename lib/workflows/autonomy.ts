/**
 * lib/workflows/autonomy.ts
 * Autonomy override helper — D-06 / SET-03.
 *
 * D-06 direction (one-directional tightening):
 *   levelOrder: L1=1, L2=2, L3=3  (lower number = MORE restrictive)
 *   An override is applied ONLY when it is more restrictive than the workflow level
 *   (i.e. levelOrder[override] < levelOrder[workflowLevel]).
 *   An override can NEVER loosen a gate — L2 workflow + L3 override stays L2.
 *
 * Architecture note (D-07b, T-4-04-02):
 *   The gate is enforced in execute-workflow-run.ts (the agent tier), NOT in dispatchTool.
 *   This file exposes the pure helper so the engine and any unit tests can call it
 *   without duplicating the levelOrder logic.
 *
 * D-05 curated override tool set (maps to AGENT-03 write tools):
 *   - shopify_update_variant_price         (price)
 *   - shopify_update_product_status        (product status / retirement)
 *   - shopify_create_redirect              (redirects)
 *   - shopify_update_variant_inventory     (inventory)
 *   - gmail_send_email                     (send-customer-email)
 *   - shopify_update_page_content          (page / content)
 *
 * NO "discount codes" — no v1 write tool for that action (T-4-04-05 Zod guard matches).
 */

// ── Level ordering ────────────────────────────────────────────────────────────

/**
 * levelOrder maps automation level → numeric restrictiveness.
 * LOWER number = MORE restrictive.
 *   L1 = 1 (manual hold — most restrictive)
 *   L2 = 2 (approval-gated)
 *   L3 = 3 (autonomous — least restrictive)
 */
export const LEVEL_ORDER: Record<string, number> = { L1: 1, L2: 2, L3: 3 };

// ── D-05 curated override tool set ───────────────────────────────────────────

/**
 * The exact AGENT-03 write tool names that may appear as override keys.
 * Any key outside this set is rejected by saveAutonomyThresholds (Zod guard T-4-04-05).
 */
export const CURATED_OVERRIDE_TOOLS = [
  "shopify_update_variant_price",       // price
  "shopify_update_product_status",      // product status / retirement
  "shopify_create_redirect",            // redirects
  "shopify_update_variant_inventory",   // inventory
  "gmail_send_email",                   // send-customer-email
  "shopify_update_page_content",        // page / content
] as const;

export type CuratedOverrideTool = (typeof CURATED_OVERRIDE_TOOLS)[number];

// ── Core pure helper ──────────────────────────────────────────────────────────

/**
 * getEffectiveAutomationLevel — compute the effective automation level for a
 * given workflow action, given the workflow's own level and an optional
 * per-action override from autonomy_thresholds.
 *
 * D-06 invariant: the effective level is NEVER less restrictive than
 * the workflow's own level.  An override can only ADD friction.
 *
 * @param workflowLevel  - the workflow's automation_level ('L1' | 'L2' | 'L3')
 * @param overrideLevel  - the per-action override, if any (undefined = no override)
 * @returns              the effective automation level to use for this step
 *
 * Examples:
 *   getEffectiveAutomationLevel("L3", "L2") → "L2"  (override adds friction)
 *   getEffectiveAutomationLevel("L2", "L3") → "L2"  (override cannot loosen)
 *   getEffectiveAutomationLevel("L3", undefined) → "L3"  (no override)
 *   getEffectiveAutomationLevel("L1", "L3") → "L1"  (override cannot loosen)
 */
export function getEffectiveAutomationLevel(
  workflowLevel: string,
  overrideLevel: string | undefined
): string {
  // No override — return workflow level unchanged
  if (!overrideLevel) return workflowLevel;

  const workflowNum = LEVEL_ORDER[workflowLevel] ?? 2;
  const overrideNum = LEVEL_ORDER[overrideLevel] ?? 2;

  // D-06: only use the override when it is strictly more restrictive
  // (lower number in levelOrder).  Equal or higher (looser) → ignore override.
  return overrideNum < workflowNum
    ? overrideLevel   // override is more restrictive — apply it
    : workflowLevel;  // workflow level is already as tight or tighter
}
