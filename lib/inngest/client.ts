// lib/inngest/client.ts
// Source: https://www.inngest.com/docs/getting-started/nextjs-quick-start
// Pattern 5 (RESEARCH.md): Inngest client with maxRuntime to prevent Vercel timeout mid-step.
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "operator-zero",
  // maxRuntime must align with the serve route's maxDuration=60.
  // Without this, Vercel may terminate the function before a step completes.
  maxRuntime: "1m",
});
