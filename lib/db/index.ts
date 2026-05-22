/**
 * lib/db/index.ts
 * Convenience re-export barrel for the entire db layer.
 *
 * Import from here:
 *   import { withUserRls, serviceDb } from '@/lib/db'
 *   import { userProfiles, integrations } from '@/lib/db'
 *
 * Web tier: use withUserRls(claims, tx => ...) so RLS is enforced.
 * Agent tier: use serviceDb (bypasses RLS — always filter by user_id in code).
 */
export { withUserRls, serviceDb } from "./client";
export * from "./schema";
