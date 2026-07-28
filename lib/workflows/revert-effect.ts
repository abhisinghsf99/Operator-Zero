/**
 * lib/workflows/revert-effect.ts
 * executeRevertEffect — the actual write-path executor for a revert.
 *
 * SERVER-ONLY: this module dynamically imports lib/integrations/shopify/mutations.ts,
 * which pulls in serviceDb (postgres.js) and Node-only builtins. It MUST only be
 * imported from Server Actions — never from a client component. That's the entire
 * reason this is a separate module from lib/workflows/revert.ts: canRevert() and
 * REVERT_REASON_LABELS there are pure and client-safe (activity-detail.tsx imports
 * them directly); if executeRevertEffect lived in the same file, Next.js would try
 * to bundle its transitive server-only imports for the browser and the build would
 * fail on Node builtins (net/tls/perf_hooks) that postgres.js needs.
 *
 * Restores before_state through the SAME write path the originating tool used
 * (lib/integrations/shopify/mutations.ts). On a sandbox connection (sentinel
 * token) those helpers route through the mirror simulation branch, so a revert
 * on the demo account is a real mirror write, not a no-op. Sent emails remain a
 * documented no-op (D-11: never revertable — canRevert() already blocks these
 * upstream; this is defence in depth).
 */

/**
 * executeRevertEffect — execute the external revert for an activity entry.
 *
 * Branches on (target_type, action_type, before_state shape):
 *   - product content (body_html / meta_title / meta_description / status / title
 *     present in before_state) → updateProduct with only those fields.
 *   - inventory (product_variant target, or action_type update_inventory, with a
 *     numeric before_state.inventory_qty) → updateInventory.
 *   - price (action_type update_price with before_state.price present) → updateVariantPrice.
 *   - page (page target with before_state.body_html) → updatePageContent.
 *   - sent emails (send_email_draft / send_email_reply) → documented no-op.
 *     canRevert() already blocks these; this branch is defence in depth.
 *   - anything else, or a null/empty before_state → throws, so the calling
 *     Server Action surfaces a real failure instead of a false "Reverted ✓".
 *
 * @param entry  - The activity entry to revert
 * @param userId - The authenticated user UUID (for adapter auth)
 */
export async function executeRevertEffect(
  entry: {
    action_type: string;
    target_type?: string | null;
    target_id?: string | null;
    before_state: Record<string, unknown> | null;
  },
  userId: string
): Promise<void> {
  // Sent emails are never revertable (D-11) — no-op regardless of before_state.
  // canRevert() already blocks these upstream; kept here as defence in depth.
  if (entry.action_type === "send_email_draft" || entry.action_type === "send_email_reply") {
    return;
  }

  const before = entry.before_state;
  if (!before || Object.keys(before).length === 0) {
    throw new Error(
      `Cannot revert ${entry.action_type} for ${entry.target_type ?? "unknown"}:${
        entry.target_id ?? "unknown"
      } — no before_state recorded`
    );
  }

  // Product content restore.
  if (
    entry.target_type === "product" &&
    ("body_html" in before ||
      "meta_title" in before ||
      "meta_description" in before ||
      "status" in before ||
      "title" in before)
  ) {
    const { updateProduct } = await import("@/lib/integrations/shopify/mutations");
    const patch: {
      product_gid: string;
      title?: string;
      body_html?: string;
      status?: string;
      meta_title?: string;
      meta_description?: string;
    } = { product_gid: entry.target_id ?? "" };
    if (typeof before["title"] === "string") patch.title = before["title"];
    if (typeof before["body_html"] === "string") patch.body_html = before["body_html"];
    if (typeof before["status"] === "string") patch.status = before["status"];
    if (typeof before["meta_title"] === "string") patch.meta_title = before["meta_title"];
    if (typeof before["meta_description"] === "string") {
      patch.meta_description = before["meta_description"];
    }
    await updateProduct(userId, patch);
    return;
  }

  // Inventory restore.
  if (
    (entry.target_type === "product_variant" || entry.action_type === "update_inventory") &&
    typeof before["inventory_qty"] === "number"
  ) {
    const { updateInventory } = await import("@/lib/integrations/shopify/mutations");
    await updateInventory(userId, {
      variant_gid: entry.target_id ?? "",
      inventory_qty: before["inventory_qty"] as number,
    });
    return;
  }

  // Price restore.
  if (entry.action_type === "update_price" && before["price"] !== undefined) {
    const { updateVariantPrice } = await import("@/lib/integrations/shopify/mutations");
    await updateVariantPrice(userId, {
      variant_gid: entry.target_id ?? "",
      price: Number(before["price"]),
    });
    return;
  }

  // Page content restore.
  if (entry.target_type === "page" && typeof before["body_html"] === "string") {
    const { updatePageContent } = await import("@/lib/integrations/shopify/mutations");
    await updatePageContent(userId, {
      page_gid: entry.target_id ?? "",
      body_html: before["body_html"] as string,
      title: typeof before["title"] === "string" ? (before["title"] as string) : undefined,
    });
    return;
  }

  throw new Error(
    `Cannot revert ${entry.action_type} for ${entry.target_type ?? "unknown"}:${
      entry.target_id ?? "unknown"
    } — no matching revert path for this before_state shape`
  );
}
