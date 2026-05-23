/**
 * lib/inngest/functions/purge-account.ts
 * Durable account deletion job — SET-07, D-09.
 *
 * Triggered by: account.deletion_requested
 * Cancelled by: account.deletion_cancelled (CEL: async.data.userId == event.data.userId)
 * Retries: 2 (each step individually checkpointed)
 *
 * Steps:
 *   1. lock-account — set deletion_requested_at=now(); abort active workflow runs
 *   2. step.sleep "grace-period" 7 days — cancellable window
 *   3. hard-delete — deleteUser (cascades app data via FK); clean up user-exports objects
 *
 * CRITICAL CEL ORDER (Pitfall 7 — matches execute-workflow-run.ts comment L10–17):
 *   cancelOn if: "async.data.userId == event.data.userId"
 *   - async  = the waited-for / cancelled event (account.deletion_cancelled)
 *   - event  = the original trigger (account.deletion_requested)
 *   Using event.data.userId on BOTH sides is a SILENT wrong-cancel bug.
 *
 * SECURITY:
 *   T-4-05-03: lock step aborts active workflow runs before sleeping (Pitfall 4)
 *   T-4-05-04: hard-delete scoped to userId only via auth.users cascade
 *   T-4-05-05: cancelOn CEL is "async.data.userId == event.data.userId" (not inverted)
 *   T-4-05-06: hard-delete try-catch ignores "not found" — idempotent on retry
 *
 * OBSERVABILITY:
 *   WF-06: structured log events emitted before external effects
 */

import { inngest } from "@/lib/inngest/client";
import { serviceDb } from "@/lib/db/client";
import { workflowRuns, userProfiles } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

// ── Supabase Admin client (service role — for auth.admin.deleteUser) ──────────

function getSupabaseAdmin() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── purgeAccount ─────────────────────────────────────────────────────────────

export const purgeAccount = inngest.createFunction(
  {
    id: "purge-account",
    retries: 2,
    triggers: [{ event: "account.deletion_requested" }],
    // CRITICAL CEL ORDER (Pitfall 7):
    //   async  = account.deletion_cancelled (the waited-for / cancelled event)
    //   event  = account.deletion_requested (the original trigger)
    // This means: cancel THIS purge job only when the cancellation event's
    // userId matches the original deletion request's userId.
    // DO NOT use event.data.userId on both sides — that is a SILENT wrong-cancel bug.
    cancelOn: [
      {
        event: "account.deletion_cancelled",
        if: "async.data.userId == event.data.userId",
      },
    ],
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };

    // ── Step 1: lock-account ───────────────────────────────────────────────────
    // Set deletion_requested_at IMMEDIATELY — account is locked before the grace period.
    // This ensures the lock is in place even if the sleep step is later cancelled.
    // (D-09: account is visibly locked from the moment deletion is requested)
    await step.run("lock-account", async () => {
      // 1a. Set deletion_requested_at on user profile (visible lock in UI)
      await serviceDb
        .update(userProfiles)
        .set({ deletion_requested_at: new Date(), updated_at: new Date() })
        .where(eq(userProfiles.user_id, userId));

      // 1b. Abort/cancel active workflow runs (Pitfall 4 — D-09)
      // Mark running/paused_for_approval runs as failed so they stop mid-execution.
      const abortedCount = await serviceDb
        .update(workflowRuns)
        .set({
          status: "failed",
          error_summary: "Account deletion requested — run aborted.",
          completed_at: new Date(),
        })
        .where(
          and(
            eq(workflowRuns.user_id, userId),
            inArray(workflowRuns.status, ["running", "paused_for_approval"])
          )
        )
        .returning({ id: workflowRuns.id })
        .then((rows) => rows.length);

      // Observability log (WF-06)
      console.log(
        JSON.stringify({
          level: "info",
          event: "account.deletion.locked",
          userId,
          abortedRuns: abortedCount,
          timestamp: new Date().toISOString(),
        })
      );
    });

    // ── Step 2: grace-period ───────────────────────────────────────────────────
    // 7-day sleep — user can cancel by signing in during this window.
    // The cancelOn above intercepts account.deletion_cancelled during this sleep.
    await step.sleep("grace-period", "7d");

    // ── Step 3: hard-delete ────────────────────────────────────────────────────
    // Delete the Supabase Auth user — cascades all app data via auth.users FK ON DELETE CASCADE.
    // Try-catch ignores "not found" for idempotent retries (T-4-05-06).
    await step.run("hard-delete", async () => {
      const supabaseAdmin = getSupabaseAdmin();

      // Log before external effect (WF-06 observability-first)
      console.log(
        JSON.stringify({
          level: "info",
          event: "account.deletion.hard_delete_started",
          userId,
          timestamp: new Date().toISOString(),
        })
      );

      // Hard-delete the user — cascades workflows, runs, exports, etc.
      try {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) {
          // Treat "not found" as success (idempotent — user may already be deleted on retry)
          if (
            error.message.toLowerCase().includes("not found") ||
            error.message.toLowerCase().includes("does not exist")
          ) {
            console.log(
              JSON.stringify({
                level: "info",
                event: "account.deletion.user_not_found_idempotent",
                userId,
                timestamp: new Date().toISOString(),
              })
            );
          } else {
            throw new Error(`deleteUser failed: ${error.message}`);
          }
        }
      } catch (err) {
        // Idempotent: ignore "not found" / "does not exist" errors on retry (T-4-05-06)
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.toLowerCase().includes("not found") ||
          msg.toLowerCase().includes("does not exist")
        ) {
          // Already deleted — safe to continue
        } else {
          throw err;
        }
      }

      // Clean up user-exports Storage objects (scoped to exports/<userId>/ only — T-4-05-04)
      try {
        const { data: objects } = await supabaseAdmin.storage
          .from("user-exports")
          .list(`exports/${userId}`, { limit: 1000 });

        if (objects && objects.length > 0) {
          const paths = objects.map((obj) => `exports/${userId}/${obj.name}`);
          await supabaseAdmin.storage.from("user-exports").remove(paths);
        }
      } catch (storageErr) {
        // Non-fatal — Storage cleanup failure should not block auth deletion
        console.error(
          JSON.stringify({
            level: "warn",
            event: "account.deletion.storage_cleanup_failed",
            userId,
            error: String(storageErr),
            timestamp: new Date().toISOString(),
          })
        );
      }

      console.log(
        JSON.stringify({
          level: "info",
          event: "account.deletion.completed",
          userId,
          timestamp: new Date().toISOString(),
        })
      );
    });

    return { userId, deleted: true };
  }
);
