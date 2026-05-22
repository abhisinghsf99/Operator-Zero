/**
 * lib/db/schema/index.ts
 * Re-exports all Drizzle schema definitions.
 *
 * Import from here throughout the codebase:
 *   import { userProfiles, integrations } from '@/lib/db/schema'
 */
export { userProfiles } from "./users";
export { integrations } from "./integrations";
