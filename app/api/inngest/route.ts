// app/api/inngest/route.ts
// Source: https://www.inngest.com/docs/getting-started/nextjs-quick-start
// Pattern 5 (RESEARCH.md): Inngest serve handler.
//
// IMPORTANT: maxDuration=60 is required. Without it, Vercel's default 10-second
// serverless timeout will kill multi-step functions mid-execution. See RESEARCH.md Pitfall 4.
export const maxDuration = 60;

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { helloWorld } from "@/lib/inngest/functions/hello-world";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld],
});
