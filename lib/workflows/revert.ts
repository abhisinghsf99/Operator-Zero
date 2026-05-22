/**
 * lib/workflows/revert.ts
 * Revert eligibility check and revert execution helpers.
 *
 * canRevert — pure function: determines whether an activity entry can be
 *   reverted. Called from both the Activity UI (show/disable button) and
 *   the revertActivity Server Action (enforce before writing).
 *   See DATA-FLOW.md §10.6 and D-11 / ACT-08.
 *
 * REVERT_REASON_LABELS — human-readable labels for each failure reason.
 *   Used in D-09 disabled-button tooltips and bulk-revert confirmation modal.
 *
 * executeRevertEffect — stub for external Shopify/Gmail revert execution.
 *   The actual adapters are wired in Phase 4; this stub is safe to call
 *   (no-op) so the Server Action flow compiles and is testable end-to-end.
 *
 * DRIFT WINDOWS (D-11 / DATA-FLOW.md §10.6):
 *   content    = 7 days  (product descriptions, meta fields, page content)
 *   structural = 24 hours (price, inventory, status, redirects)
 *   sent       = never   (sent emails cannot be unsent)
 *
 * SERVER-ONLY NOTE: This module may be imported by both client components
 *   (canRevert is pure — safe in browser) and Server Actions.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type RevertWindow = "content" | "structural" | "sent" | "never";

export interface CanRevertResult {
  allowed: boolean;
  reason?:
    | "out_of_window"
    | "sent"
    | "manually_edited_since"
    | "already_reverted"
    | "is_revert_entry";
}

// ─── Action type → revert window map ─────────────────────────────────────────

/**
 * Maps action_type values to their revert window category.
 *
 * content    = 7d window (product descriptions, SEO meta, page content)
 * structural = 24h window (business logic changes: price, inventory, status)
 * sent       = never revertable (emails already sent)
 *
 * Unknown action_types default to 'content' (7d window) — conservative:
 * if an action type is not recognized we assume it is content-like and
 * allow a reasonable revert window rather than blocking indefinitely.
 * See RESEARCH.md Assumption A4.
 */
const ACTION_TYPE_WINDOW: Record<string, RevertWindow> = {
  // Content actions — 7d window
  update_product: "content",
  update_meta_title: "content",
  update_meta_desc: "content",
  update_image_alt: "content",
  update_page_content: "content",

  // Structural actions — 24h window
  update_price: "structural",
  update_inventory: "structural",
  update_status: "structural",
  create_redirect: "structural",

  // Sent — never revertable
  send_email_draft: "sent",
  send_email_reply: "sent",
};

// ─── Time window constants (in seconds) ──────────────────────────────────────

const WINDOW_SECONDS: Record<RevertWindow, number> = {
  content: 7 * 24 * 3600,
  structural: 24 * 3600,
  sent: 0, // never
  never: 0,
};

// ─── canRevert ────────────────────────────────────────────────────────────────

/**
 * canRevert — pure function; determines revert eligibility.
 *
 * Checks in order (fail-fast):
 *   1. already_reverted — reverted_at is set
 *   2. is_revert_entry — is_revertable is false (revert entries, read-only steps)
 *   3. sent — action_type is a sent email (never revertable)
 *   4. out_of_window — action age exceeds the window for this action type
 *   5. manually_edited_since — shopifyUpdatedAt > occurred_at
 *   6. allowed — passes all checks
 *
 * @param entry          - Activity entry fields needed for drift check
 * @param shopifyUpdatedAt - Latest shopify_updated_at for the target entity.
 *                          Pass undefined/null to skip the manually-edited-since check
 *                          (safe for non-Shopify targets or when pre-fetch is unavailable).
 */
export function canRevert(
  entry: Pick<{
    action_type: string;
    occurred_at: Date | string;
    is_revertable: boolean;
    reverted_at: Date | string | null;
    before_state: Record<string, unknown> | null;
  }, "action_type" | "occurred_at" | "is_revertable" | "reverted_at" | "before_state">,
  shopifyUpdatedAt?: Date | null
): CanRevertResult {
  // 1. Already reverted
  if (entry.reverted_at) {
    return { allowed: false, reason: "already_reverted" };
  }

  // 2. Schema-flagged as non-revertable (e.g., revert_* entries themselves)
  if (!entry.is_revertable) {
    return { allowed: false, reason: "is_revert_entry" };
  }

  // Determine the revert window for this action type
  const window = ACTION_TYPE_WINDOW[entry.action_type] ?? "content";

  // 3. Sent emails: never revertable
  if (window === "sent" || window === "never") {
    return { allowed: false, reason: "sent" };
  }

  // 4. Time window check
  const occurredMs = new Date(entry.occurred_at).getTime();
  const ageSeconds = (Date.now() - occurredMs) / 1000;

  if (ageSeconds > WINDOW_SECONDS[window]) {
    return { allowed: false, reason: "out_of_window" };
  }

  // 5. Manually edited since check (product/page targets with Shopify sync)
  if (shopifyUpdatedAt && shopifyUpdatedAt > new Date(entry.occurred_at)) {
    return { allowed: false, reason: "manually_edited_since" };
  }

  return { allowed: true };
}

// ─── REVERT_REASON_LABELS ─────────────────────────────────────────────────────

/**
 * Human-readable labels for each CanRevertResult reason.
 * Used in D-09 accessible tooltips and the D-08 bulk-revert confirmation modal.
 */
export const REVERT_REASON_LABELS: Record<
  NonNullable<CanRevertResult["reason"]>,
  string
> = {
  out_of_window:
    "Outside the revert window (7 days for content, 24 hours for structural changes)",
  sent: "Sent emails can't be unsent — the agent can draft a follow-up instead",
  manually_edited_since:
    "This product was edited after the agent action — reverting might overwrite your changes",
  already_reverted: "This action has already been reverted",
  is_revert_entry: "Revert actions themselves cannot be reverted",
};

// ─── executeRevertEffect ──────────────────────────────────────────────────────

/**
 * executeRevertEffect — execute the external revert for an activity entry.
 *
 * Phase 3 stub: the actual Shopify/Gmail adapter calls are wired in Phase 4.
 * This function is safe to call (no-op) and allows the Server Action flow to
 * be fully tested without live external API credentials.
 *
 * When Phase 4 wires the adapters, this function will:
 *   - For product/page targets: call the Shopify adapter to restore before_state
 *   - For email targets: no-op (sent emails cannot be unsent per D-11)
 *
 * @param entry  - The activity entry to revert
 * @param userId - The authenticated user UUID (for adapter auth)
 */
export async function executeRevertEffect(
  entry: { action_type: string; target_type?: string | null; target_id?: string | null; before_state: Record<string, unknown> | null },
  userId: string
): Promise<void> {
  // Phase 3 stub — Phase 4 wires real adapters
  // Log for observability during testing
  if (process.env["NODE_ENV"] === "development") {
    console.log(
      `[executeRevertEffect] STUB: would revert ${entry.action_type} for ${entry.target_type}:${entry.target_id} (userId=${userId})`
    );
  }
  // No-op in Phase 3 — the DB writes (reverted_at, revert_* entry) still happen
}
