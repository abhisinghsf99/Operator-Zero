/**
 * lib/demo/teardown.ts
 * Server-only helper to fully tear down a per-visitor demo sandbox.
 *
 * Used by BOTH the tab-close exit route (app/api/sandbox/exit) and the TTL-sweep
 * cron (lib/inngest/functions/sandbox-sweep). Best-effort and idempotent — safe
 * to call more than once, even concurrently, for the same user.
 *
 * SECURITY: callers must only pass a user_id they've authorized to delete
 *   (the exit route uses the caller's OWN validated JWT sub; the sweep only
 *   passes ids it read from sandbox_sessions). This function does not itself
 *   authorize — it trusts the caller.
 */
import { serviceDb } from "@/lib/db/client";
import { sandboxSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { wipeDemoFor } from "./seed";
import { createClient } from "@supabase/supabase-js";

// Supabase Admin client (service role — for auth.admin.deleteUser). Same pattern
// as lib/inngest/functions/purge-account.ts.
function getSupabaseAdmin() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Tear down a sandbox visitor:
 *   1. Delete their seeded app data + profile (wipeDemoFor).
 *   2. Remove the sandbox_sessions registry row.
 *   3. Delete the anonymous auth identity (cascades any FK leftovers).
 *
 * Each step is guarded so a failure in one does not abort the others — the goal
 * is to leave nothing behind. No-ops on an empty userId.
 */
export async function teardownSandbox(userId: string): Promise<void> {
  if (!userId) return;

  try {
    await wipeDemoFor(userId);
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "sandbox.teardown.wipe_failed",
        userId,
        error: String(e),
      })
    );
  }

  try {
    await serviceDb
      .delete(sandboxSessions)
      .where(eq(sandboxSessions.user_id, userId));
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "sandbox.teardown.registry_failed",
        userId,
        error: String(e),
      })
    );
  }

  try {
    const admin = getSupabaseAdmin();
    await admin.auth.admin.deleteUser(userId);
  } catch (e) {
    // A "user not found" here is fine (already deleted / never persisted).
    console.error(
      JSON.stringify({
        level: "warn",
        event: "sandbox.teardown.delete_user_failed",
        userId,
        error: String(e),
      })
    );
  }
}
