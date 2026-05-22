/**
 * lib/inngest/functions/gmail-sync.ts
 * Gmail durable sync Inngest functions — INTEG-05.
 *
 * Provides:
 *   - gmailInitialSyncFn: triggered by 'gmail.connected'; runs 30-day initial mirror sync
 *   - gmailIncrementalPollFn: 5-min cron; triggers incremental History API sync per active user
 *
 * Registered in app/api/inngest/route.ts serve() functions array.
 *
 * Runtime requirements:
 *   - Initial sync can take minutes for accounts with large histories
 *   - maxDuration=300 and maxRuntime="4m" already set in 02-03 — do not change
 */
import { inngest } from "../client";
import {
  gmailInitialSync,
  gmailIncrementalSync,
  getActiveGmailUserIds,
} from "@/lib/integrations/gmail/sync";

// ─── gmailInitialSyncFn ───────────────────────────────────────────────────────

/**
 * 30-day initial thread sync triggered when a user connects Gmail.
 * Event: 'gmail.connected' — fired by the OAuth callback route.
 */
export const gmailInitialSyncFn = inngest.createFunction(
  {
    id: "gmail-initial-sync",
    triggers: [{ event: "gmail.connected" }],
    concurrency: {
      limit: 1,
      key: "event.data.userId", // one sync at a time per user
    },
    retries: 3,
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };

    await step.run("initial-sync", async () => {
      await gmailInitialSync(userId);
    });

    return { userId, synced: true };
  }
);

// ─── gmailIncrementalPollFn ───────────────────────────────────────────────────

/**
 * 5-minute cron polling — advances the History API cursor for every active Gmail user.
 */
export const gmailIncrementalPollFn = inngest.createFunction(
  {
    id: "gmail-incremental-poll",
    triggers: [{ cron: "*/5 * * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const userIds = await step.run("get-active-users", async () => {
      return getActiveGmailUserIds();
    });

    const results: Array<{ userId: string; status: string }> = [];

    for (const userId of userIds) {
      const result = await step.run(
        `incremental-sync-${userId}`,
        async () => {
          try {
            await gmailIncrementalSync(userId);
            return { userId, status: "ok" };
          } catch (err) {
            return {
              userId,
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
      );
      results.push(result as { userId: string; status: string });
    }

    return { polled: userIds.length, results };
  }
);
