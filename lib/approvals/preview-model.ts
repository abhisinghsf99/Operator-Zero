/**
 * lib/approvals/preview-model.ts
 * Pure data-only preview model builder for L2 approval previews.
 *
 * buildPreviewModel(preview, actionType?) → PreviewModel (discriminated union)
 *
 * Shape detection priority order (keyed on object KEYS; explicit `kind` honored):
 *   1. null / undefined / empty-object → { kind:'empty' }
 *   2. non-object scalar (string/number/boolean) → { kind:'text' }
 *   3. kind='email' OR { draft } OR { to, subject, body } → { kind:'email' }
 *   4. kind='content-diff' OR { before, after } (both strings) → { kind:'diff' }
 *   5. kind='list' OR { items: Array } → { kind:'list' }
 *   6. { body_html } → { kind:'html', title:'Product description', html:raw }
 *   7. { meta_title } OR { meta_description } → { kind:'fields' } with char counts
 *   8. { variant_gid, inventory_qty: number } → { kind:'fields' } restock rows
 *   9. Any other non-null object → generic { kind:'fields' } with humanized labels
 *
 * DATA-ONLY: no JSX, no sanitization at model-build time.
 * HTML strings are carried RAW in the model and sanitized at render time only (T-tsg-01).
 *
 * No new dependencies; pure function — trivially unit-testable and serializable.
 */

// ─── PreviewModel discriminated union ────────────────────────────────────────

export type PreviewModel =
  | { kind: "email"; customer?: string; question?: string; draft?: string; to?: string; subject?: string; body?: string }
  | { kind: "diff"; before: string; after: string }
  | { kind: "list"; items: Array<Record<string, unknown>>; showing?: string; window?: string }
  | { kind: "html"; title: string; html: string }
  | { kind: "fields"; fields: Array<{ label: string; value: string; count?: string; html?: boolean }> }
  | { kind: "text"; text: string }
  | { kind: "empty" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the value is a non-null plain object (not array). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Returns the value as a string if it is one, else null. */
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Returns true if the string looks like it contains an HTML tag. */
function looksLikeHtml(v: string): boolean {
  return /<[a-z][\s\S]*>/i.test(v);
}

/**
 * humanize — converts snake_case or camelCase to Title Case.
 *
 * Examples:
 *   "foo_bar" → "Foo bar"
 *   "metaTitle" → "Meta title"
 *   "banner_html" → "Banner html"
 */
export function humanize(key: string): string {
  // camelCase → snake_case first
  const snaked = key.replace(/([A-Z])/g, "_$1").toLowerCase();
  // split on underscores, capitalize first word only
  const words = snaked.split("_").filter(Boolean);
  if (words.length === 0) return key;
  return [words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1), ...words.slice(1)].join(" ");
}

/**
 * compactSummary — produces a compact one-line string for a nested value.
 * Used for object/array values in the generic fallback to avoid multi-line JSON dumps.
 */
function compactSummary(v: unknown): string {
  if (Array.isArray(v)) {
    // Compact array: join elements as comma-separated
    return v.map((item) => (isPlainObject(item) ? JSON.stringify(item) : String(item))).join(", ");
  }
  if (isPlainObject(v)) {
    // Compact object: key:value pairs on a single line
    return Object.entries(v)
      .map(([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
      .join(", ");
  }
  return String(v);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * buildPreviewModel — maps any approval preview payload to a typed PreviewModel.
 *
 * @param preview - the `preview` jsonb from the approval row (Record<string,unknown>)
 *                  or any scalar / null / undefined
 * @param actionType - optional action_type from the approval row (currently unused
 *                     but accepted for forward-compat with future action-type routing)
 * @returns PreviewModel discriminated union — pure data, no JSX
 */
export function buildPreviewModel(preview: unknown, _actionType?: string): PreviewModel {
  // ── 1. Null / undefined / empty-object ────────────────────────────────────
  if (preview === null || preview === undefined) {
    return { kind: "empty" };
  }

  // ── 2. Non-object scalar ──────────────────────────────────────────────────
  if (!isPlainObject(preview)) {
    if (typeof preview === "string" || typeof preview === "number" || typeof preview === "boolean") {
      return { kind: "text", text: String(preview) };
    }
    return { kind: "empty" };
  }

  // Empty object check
  if (Object.keys(preview).length === 0) {
    return { kind: "empty" };
  }

  const kind = asString(preview.kind);

  // ── 3. Email — explicit kind='email', OR { draft }, OR { to, subject, body } ──
  if (
    kind === "email" ||
    asString(preview.draft) !== null ||
    (asString(preview.to) !== null && asString(preview.subject) !== null && asString(preview.body) !== null)
  ) {
    return {
      kind: "email",
      ...(asString(preview.customer) !== null ? { customer: asString(preview.customer)! } : {}),
      ...(asString(preview.question) !== null ? { question: asString(preview.question)! } : {}),
      ...(asString(preview.draft) !== null ? { draft: asString(preview.draft)! } : {}),
      ...(asString(preview.to) !== null ? { to: asString(preview.to)! } : {}),
      ...(asString(preview.subject) !== null ? { subject: asString(preview.subject)! } : {}),
      ...(asString(preview.body) !== null ? { body: asString(preview.body)! } : {}),
    };
  }

  // ── 4. Diff — explicit kind='content-diff', OR { before, after } both strings ──
  if (
    kind === "content-diff" ||
    (asString(preview.before) !== null && asString(preview.after) !== null)
  ) {
    return {
      kind: "diff",
      before: asString(preview.before) ?? "",
      after: asString(preview.after) ?? "",
    };
  }

  // ── 5. List — explicit kind='list', OR { items: Array } ───────────────────
  if (kind === "list" || Array.isArray(preview.items)) {
    const rawItems = Array.isArray(preview.items) ? preview.items : [];
    const items = rawItems.map((item) =>
      isPlainObject(item) ? item : { value: String(item) }
    );
    return {
      kind: "list",
      items,
      ...(asString(preview.showing) !== null ? { showing: asString(preview.showing)! } : {}),
      ...(asString(preview.window) !== null ? { window: asString(preview.window)! } : {}),
    };
  }

  // ── 6. HTML description — { body_html: string } ───────────────────────────
  if (asString(preview.body_html) !== null) {
    return {
      kind: "html",
      title: "Product description",
      html: asString(preview.body_html)!,
    };
  }

  // ── 7. Meta fields — { meta_title? } and/or { meta_description? } ─────────
  if (
    asString(preview.meta_title) !== null ||
    asString(preview.meta_description) !== null
  ) {
    const fields: Array<{ label: string; value: string; count?: string }> = [];
    const metaTitle = asString(preview.meta_title);
    const metaDesc = asString(preview.meta_description);
    if (metaTitle !== null) {
      fields.push({ label: "Meta title", value: metaTitle, count: `${metaTitle.length}/60` });
    }
    if (metaDesc !== null) {
      fields.push({ label: "Meta description", value: metaDesc, count: `${metaDesc.length}/160` });
    }
    return { kind: "fields", fields };
  }

  // ── 8. Restock — { variant_gid, inventory_qty: number } (includes 0) ──────
  if (
    asString(preview.variant_gid) !== null &&
    typeof preview.inventory_qty === "number"
  ) {
    return {
      kind: "fields",
      fields: [
        { label: "Restock to", value: `${preview.inventory_qty} units` },
        { label: "Variant", value: asString(preview.variant_gid)! },
      ],
    };
  }

  // ── 9. Generic fallback — humanized label/value rows ─────────────────────
  const fields: Array<{ label: string; value: string; html?: boolean }> = [];

  for (const [key, val] of Object.entries(preview)) {
    // Skip the 'kind' field since it's not a data field
    if (key === "kind") continue;

    const label = humanize(key);

    if (typeof val === "string") {
      if (looksLikeHtml(val)) {
        // HTML-looking string → flag html:true, carry raw value
        fields.push({ label, value: val, html: true });
      } else {
        fields.push({ label, value: val });
      }
    } else if (typeof val === "number" || typeof val === "boolean") {
      fields.push({ label, value: String(val) });
    } else if (val === null || val === undefined) {
      fields.push({ label, value: "" });
    } else {
      // Nested object or array → compact one-line summary (never JSON.stringify with indentation)
      fields.push({ label, value: compactSummary(val) });
    }
  }

  return { kind: "fields", fields };
}
