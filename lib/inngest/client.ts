// lib/inngest/client.ts
// Source: https://www.inngest.com/docs/getting-started/nextjs-quick-start
// Pattern 5 (RESEARCH.md): Inngest client with maxRuntime to prevent Vercel timeout mid-step.
//
// Phase 2 (02-03): bumped maxRuntime from "1m" to "4m" (80% of 300s Vercel max).
// Required for shopifyFullSync which may take minutes for large stores.
// The serve route's maxDuration is set to 300 to match.
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "operator-zero",
  // maxRuntime must align with the serve route's maxDuration=300.
  // Without this, Vercel may terminate the function before a step completes.
  // Phase 2: increased from "1m" to "4m" for long-running Shopify sync functions.
  maxRuntime: "4m",
});
