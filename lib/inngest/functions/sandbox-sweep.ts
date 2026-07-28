/**
 * lib/inngest/functions/sandbox-sweep.ts
 * Cron: reclaim abandoned demo sandboxes.
 *
 * Per-visitor sandboxes are torn down on tab close by the exit beacon
 * (app/api/sandbox/exit). This sweep is the backstop for when that beacon never
 * fires (crash, lost network, hard kill): any sandbox whose last heartbeat is
 * older than IDLE_TTL is fully torn down — data, registry row, and anonymous
 * auth identity. Active sandboxes heartbeat every ~4 min, so they stay well
 * inside the TTL and are never reclaimed while in use.
 */
import { inngest } from "@/lib/inngest/client";
import { serviceDb } from "@/lib/db/client";
import { sandboxSessions } from "@/lib/db/schema";
import { lt } from "drizzle-orm";
import { teardownSandbox } from "@/lib/demo/teardown";

// How long a sandbox may go without a heartbeat before it's considered abandoned.
const IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const sandboxSweep = inngest.createFunction(
  {
    id: "sandbox-sweep",
    triggers: [{ cron: "*/10 * * * *" }], // every 10 minutes
    retries: 1,
  },
  async ({ step }) => {
    // 1. Find sandboxes idle past the TTL.
    const userIds = await step.run("find-stale-sandboxes", async () => {
      const cutoff = new Date(Date.now() - IDLE_TTL_MS);
      const rows = await serviceDb
        .select({ user_id: sandboxSessions.user_id })
        .from(sandboxSessions)
        .where(lt(sandboxSessions.last_seen_at, cutoff));
      return rows.map((r) => r.user_id);
    });

    // 2. Tear each one down. One step per sandbox so a single failure doesn't
    //    block the rest and retries are isolated.
    const results: Array<{ userId: string; status: string }> = [];
    for (const userId of userIds) {
      const result = await step.run(`teardown-${userId}`, async () => {
        try {
          await teardownSandbox(userId);
          return { userId, status: "ok" };
        } catch (err) {
          return {
            userId,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });
      results.push(result as { userId: string; status: string });
    }

    return { reclaimed: userIds.length, results };
  }
);
