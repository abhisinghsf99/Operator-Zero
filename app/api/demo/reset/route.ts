/**
 * app/api/demo/reset/route.ts
 * POST /api/demo/reset — reseeds the demo user's data.
 *
 * Called by DemoResetBeacon via navigator.sendBeacon on tab close.
 * Always returns 204 regardless of outcome (beacon is fire-and-forget).
 *
 * SECURITY (T-ii6-02):
 *   - Reseed only runs when isDemoUser(claims.sub) is true.
 *   - Non-demo callers receive a 204 no-op — no error information leaked.
 *   - No request body is read or trusted.
 */

import { createClient } from "@/lib/auth/server";
import { isDemoUser } from "@/lib/auth/demo";
import { reseedDemo } from "@/lib/demo/seed";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (isDemoUser(data?.claims?.sub as string | undefined)) {
    try {
      await reseedDemo();
    } catch (e) {
      console.error(
        JSON.stringify({ level: "warn", event: "demo.reseed_failed", error: String(e) })
      );
    }
  }
  return new Response(null, { status: 204 });
}
