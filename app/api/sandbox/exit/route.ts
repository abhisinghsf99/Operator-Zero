/**
 * app/api/sandbox/exit/route.ts
 * POST /api/sandbox/exit — tear down the caller's own demo sandbox.
 *
 * Called by SandboxExitBeacon via navigator.sendBeacon on tab close (pagehide).
 * Always returns 204 — the beacon is fire-and-forget and ignores the response.
 *
 * SECURITY:
 *   - Acts ONLY on the caller's own validated JWT sub (getClaims) — a caller can
 *     never tear down another user's data. No request body is read or trusted.
 *   - Only proceeds when the caller is an anonymous (sandbox) identity. A
 *     non-anonymous caller (e.g. the shared demo account or a real user) gets a
 *     204 no-op — we never delete a real account here.
 */
import { createClient } from "@/lib/auth/server";
import { teardownSandbox } from "@/lib/demo/teardown";

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
      await teardownSandbox(claims.sub);
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "sandbox.exit.failed",
        error: String(e),
      })
    );
  }
  return new Response(null, { status: 204 });
}
