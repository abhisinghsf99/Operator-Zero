/**
 * lib/db/index.ts
 * Convenience re-export barrel for the entire db layer.
 *
 * Import from here:
 *   import { db, serviceDb } from '@/lib/db'
 *   import { userProfiles, integrations } from '@/lib/db'
 */
export { db, serviceDb } from "./client";
export * from "./schema";
