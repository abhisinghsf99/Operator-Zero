/**
 * lib/inngest/functions/sandbox-exit.ts
 * Grace-period teardown for a sandbox visitor who appears to have left.
 *
 * WHY A GRACE PERIOD: the exit beacon fires on `pagehide` (non-bfcache), which
 * browsers ALSO fire on a refresh (F5) and on any full-page navigation within
 * the app. Tearing down immediately destroyed a live sandbox the moment a
 * visitor refreshed. Instead the exit route emits `sandbox/exit.requested`;
 * this function sleeps out the grace window and only tears down if no
 * heartbeat has arrived since the exit was requested — a reloaded page fires a
 * heartbeat on mount (SandboxExitBeacon), which cancels the pending teardown.
 *
 * The TTL sweep (sandbox-sweep.ts) remains the backstop if this event is lost.
 */
import { inngest } from "@/lib/inngest/client";
import { serviceDb } from "@/lib/db/client";
import { sandboxSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { teardownSandbox } from "@/lib/demo/teardown";

/** How long a departed visitor has to come back (refresh) before teardown. */
export const EXIT_GRACE = "2m";

/**
 * shouldTeardown — pure decision: tear down only when the visitor has NOT been
 * seen since the exit was requested. A null lastSeenAt means the registry row
 * is already gone (sweep or a concurrent exit won) — nothing left to keep.
 */
export function shouldTeardown(
  lastSeenAt: Date | null,
  requestedAt: Date
): boolean {
  if (lastSeenAt === null) return true;
  return lastSeenAt.getTime() <= requestedAt.getTime();
}

export const sandboxExit = inngest.createFunction(
  {
    id: "sandbox-exit",
    triggers: [{ event: "sandbox/exit.requested" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const userId = event.data["userId"] as string;
    const requestedAt = new Date(event.data["requestedAt"] as string);
    if (!userId) return { done: false, reason: "no userId" };

    await step.sleep("exit-grace", EXIT_GRACE);

    const cameBack = await step.run("check-heartbeat", async () => {
      const rows = await serviceDb
        .select({ last_seen_at: sandboxSessions.last_seen_at })
        .from(sandboxSessions)
        .where(eq(sandboxSessions.user_id, userId))
        .limit(1);
      const lastSeen = rows[0]?.last_seen_at ?? null;
      return !shouldTeardown(lastSeen, requestedAt);
    });

    if (cameBack) {
      return { done: false, reason: "heartbeat after exit — visitor came back" };
    }

    await step.run("teardown", async () => {
      await teardownSandbox(userId);
    });
    return { done: true };
  }
);
