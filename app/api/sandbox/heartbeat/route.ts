/**
 * app/api/sandbox/heartbeat/route.ts
 * POST /api/sandbox/heartbeat — mark the caller's sandbox as still active.
 *
 * Called periodically by SandboxExitBeacon while the demo tab is open. Updates
 * sandbox_sessions.last_seen_at so the TTL-sweep cron only reclaims sandboxes
 * that have genuinely gone idle (tab closed, beacon missed), never ones in use.
 *
 * SECURITY: acts only on the caller's own validated JWT sub; anonymous-only;
 *   no request body is read. Always returns 204 (fire-and-forget).
 */
import { createClient } from "@/lib/auth/server";
import { serviceDb } from "@/lib/db/client";
import { sandboxSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims as
      | { sub?: string; is_anonymous?: boolean }
      | null
      | undefined;

    if (claims?.is_anonymous === true && claims.sub) {
      await serviceDb
        .update(sandboxSessions)
        .set({ last_seen_at: new Date() })
        .where(eq(sandboxSessions.user_id, claims.sub));
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "sandbox.heartbeat.failed",
        error: String(e),
      })
    );
  }
  return new Response(null, { status: 204 });
}
