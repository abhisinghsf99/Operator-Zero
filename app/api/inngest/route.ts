// app/api/inngest/route.ts
// Source: https://www.inngest.com/docs/getting-started/nextjs-quick-start
// Pattern 5 (RESEARCH.md): Inngest serve handler.
//
// Phase 2 (02-03): maxDuration increased from 60 to 300 for long-running sync functions.
// shopifyFullSync may take minutes for stores with large catalogs.
// maxRuntime in lib/inngest/client.ts is set to "4m" (80% of 300s) to match.
export const maxDuration = 300;

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { helloWorld } from "@/lib/inngest/functions/hello-world";
import {
  shopifyFullSync,
  shopifyPoll,
  shopifyWebhookProcess,
} from "@/lib/inngest/functions/shopify-sync";
import {
  gmailInitialSyncFn,
  gmailIncrementalPollFn,
} from "@/lib/inngest/functions/gmail-sync";
import { executeWorkflowRun } from "@/lib/inngest/functions/execute-workflow-run";
import { catalogAudit } from "@/lib/inngest/functions/catalog-audit";
import { exportAccountData } from "@/lib/inngest/functions/export-account-data";
import { purgeAccount } from "@/lib/inngest/functions/purge-account";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    shopifyFullSync,
    shopifyPoll,
    shopifyWebhookProcess,
    gmailInitialSyncFn,
    gmailIncrementalPollFn,
    executeWorkflowRun,
    catalogAudit,
    exportAccountData,
    purgeAccount,
  ],
});
