/**
 * lib/db/schema/index.ts
 * Re-exports all Drizzle schema definitions.
 *
 * Import from here throughout the codebase:
 *   import { userProfiles, integrations, workflows, ... } from '@/lib/db/schema'
 */
export { userProfiles } from "./users";
export { integrations } from "./integrations";

// Phase 2 — Workflow engine
export { workflows } from "./workflows";
export { workflowVersions } from "./workflow-versions";
export { workflowRuns } from "./workflow-runs";
export { activityEntries } from "./activity-entries";
export { approvals } from "./approvals";

// Phase 2 — Conversation
export { threads } from "./threads";
export { messages } from "./messages";

// Phase 2 — Memory + brand voice
export { memoryItems } from "./memory-items";
export { memoryEmbeddings } from "./memory-embeddings";
export { brandVoiceProfiles, brandVoiceSamples } from "./brand-voice";

// Phase 2 — Configuration
export { autonomyThresholds } from "./autonomy-thresholds";

// Phase 2 — Shopify mirror
export {
  shopifyProducts,
  shopifyProductVariants,
  shopifyOrders,
  shopifyPages,
  shopifyRedirects,
  shopifySyncState,
} from "./shopify-mirror";

// Phase 2 — Gmail mirror
export { gmailThreads, gmailMessages, gmailSyncState } from "./gmail-mirror";

// Phase 2 — Telemetry + cost
export { agentTelemetry, costAggregates } from "./telemetry";
