/**
 * lib/activity/humanize-gids.ts
 * Pure, client-safe helpers for turning raw Shopify GIDs into clean,
 * human-readable product names in the Activity surface.
 *
 * The agent's activity summaries and state snapshots embed raw GIDs like
 * `gid://shopify/Product/10393692569916` /
 * `gid://shopify/ProductVariant/53087957057852`. These read as noise to a
 * shop owner. We resolve them to the parent product's title at render time
 * (variant GIDs resolve to the product they belong to) using a map built
 * server-side in fetchActivityPage. No DB access here — pure string work.
 */

/** Matches a Shopify Product or ProductVariant GID anywhere in a string. */
export const SHOPIFY_GID_RE =
  /gid:\/\/shopify\/(Product|ProductVariant)\/(\d+)/g;

/** A single-GID matcher (non-global) for exact-value checks. */
const SHOPIFY_GID_EXACT = /^gid:\/\/shopify\/(Product|ProductVariant)\/(\d+)$/;

/**
 * Fallback label when a GID has no resolved title (e.g. product not yet
 * mirrored locally). Far cleaner than the full URI: "Product #1039…" etc.
 */
export function shortenGid(gid: string): string {
  const m = gid.match(SHOPIFY_GID_EXACT);
  if (!m) return gid;
  const [, kind, id] = m;
  const label = kind === "ProductVariant" ? "Variant" : "Product";
  return `${label} #${id}`;
}

/** True if the whole string is exactly one Shopify GID. */
export function isShopifyGid(value: unknown): value is string {
  return typeof value === "string" && SHOPIFY_GID_EXACT.test(value);
}

/**
 * Replace every Shopify GID in `text` with its resolved product title
 * (or a shortened fallback when unknown). Safe to call on any summary string.
 */
export function humanizeGids(
  text: string,
  titles: Record<string, string> | undefined | null
): string {
  if (!text) return text;
  return text.replace(SHOPIFY_GID_RE, (gid) => titles?.[gid] ?? shortenGid(gid));
}

/**
 * Resolve a single GID value to a clean label: title if known, else shortened.
 */
export function resolveGidValue(
  gid: string,
  titles: Record<string, string> | undefined | null
): string {
  return titles?.[gid] ?? shortenGid(gid);
}

/**
 * Recursively replace Shopify GIDs in every string within a value (objects,
 * arrays, and plain strings). Used to humanize persisted inline-block payloads
 * (e.g. chat approval cards / workflow plans) without knowing their shape.
 * Non-string leaves are returned unchanged. Returns a structurally-new value.
 */
export function humanizeGidsDeep<T>(
  value: T,
  titles: Record<string, string> | undefined | null
): T {
  if (typeof value === "string") {
    return humanizeGids(value, titles) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => humanizeGidsDeep(v, titles)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = humanizeGidsDeep(v, titles);
    }
    return out as T;
  }
  return value;
}
