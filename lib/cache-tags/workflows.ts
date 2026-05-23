/**
 * lib/cache-tags/workflows.ts
 * Pure (synchronous) cache-tag helpers for workflow data.
 *
 * Kept OUT of any "use server" module: files with the "use server" directive
 * may only export async functions, so synchronous helpers like this one must
 * live in a plain module. Imported by both the workflows page (unstable_cache
 * `tags`) and the Server Actions that invalidate it.
 *
 * Tag pattern: workflows-{userId} — per-user workflow list cache tag (UX-04, PRD §5.4.2).
 */
export function workflowsCacheTag(userId: string): string {
  return `workflows-${userId}`;
}
