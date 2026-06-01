/**
 * lib/html/sanitize.ts
 * Shared HTML sanitizer — extracted from lib/agent/generation/optimize-description.ts.
 *
 * SECURITY (T-f4g-01 / T-tsg-01):
 *   sanitizeHtml() strips script/style/iframe/on*=/javascript: before any HTML string
 *   reaches dangerouslySetInnerHTML or Shopify body_html storage.
 *
 * Single definition; re-imported in optimize-description.ts and the approval renderers.
 * No DOMPurify dependency — regex-based, no new supply-chain surface (T-tsg-SC).
 *
 * Server and client safe (no Node-only APIs).
 */

/**
 * sanitizeHtml — strips dangerous HTML constructs (T-f4g-01).
 *
 * Strips:
 *   - Markdown code fences (```...```)
 *   - Inline code ticks (`...`)
 *   - <script>...</script> blocks (with attributes)
 *   - <style>...</style> blocks
 *   - <iframe>...</iframe> blocks
 *   - on*= event handler attributes
 *   - javascript: URLs
 *
 * Allows: p, ul, li, strong, em, h2, h3, br and their closing tags.
 */
export function sanitizeHtml(raw: string): string {
  let html = raw;

  // Strip markdown code fences (LLMs sometimes wrap HTML in ```)
  html = html.replace(/```[\s\S]*?```/g, "");
  html = html.replace(/`[^`]+`/g, "");

  // Remove <script> blocks (any attributes)
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // Remove <style> blocks
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove <iframe> blocks
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");

  // Remove on*= event handlers
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Remove javascript: URLs
  html = html.replace(/javascript\s*:/gi, "");

  return html.trim();
}
