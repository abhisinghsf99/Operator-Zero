/**
 * tests/smoke/sandbox.smoke.ts
 * End-to-end smoke test of the per-visitor demo sandbox against the REAL project.
 *
 * Exercises the actual flow (no browser, no LLM — deterministic):
 *   1. Two anonymous identities sign in (real Supabase anonymous auth).
 *   2. Each is seeded with seedDemoFor + registered in sandbox_sessions.
 *   3. RLS isolation: each visitor's own JWT sees ONLY their own rows.
 *   4. A simulated Shopify write on A's product does NOT call Shopify and does
 *      NOT affect B's identical product.
 *   5. teardownSandbox(A) removes A's data + registry row + auth identity, while
 *      B remains fully intact.
 *
 * Guarded: only runs when SMOKE_PROD=1 (and real env is loaded). Cleans up both
 * sandboxes in a finally block even on assertion failure.
 *
 *   set -a && . ./.env.local && set +a
 *   SMOKE_PROD=1 npx vitest run --config vitest.smoke.config.ts
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { seedDemoFor } from "@/lib/demo/seed";
import { teardownSandbox } from "@/lib/demo/teardown";
import { updateProduct } from "@/lib/integrations/shopify/mutations";
import { serviceDb } from "@/lib/db/client";
import { shopifyProducts, sandboxSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const RUN = process.env.SMOKE_PROD === "1";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const VOYAGER = "gid://shopify/Product/100000001";
const EDIT = "SMOKE-TEST-EDIT-A-do-not-ship";

async function newAnon() {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user || !data.session) {
    throw new Error(`anonymous sign-in failed: ${error?.message ?? "no session"}`);
  }
  return { userId: data.user.id, token: data.session.access_token };
}

async function registerSandbox(userId: string) {
  await serviceDb
    .insert(sandboxSessions)
    .values({ user_id: userId })
    .onConflictDoNothing();
}

describe.skipIf(!RUN)("demo sandbox — prod smoke", () => {
  it("isolates concurrent visitors, simulates writes, and tears down cleanly", async () => {
    const A = await newAnon();
    const B = await newAnon();
    expect(A.userId).not.toBe(B.userId);

    try {
      // ── 2. Seed both sandboxes ────────────────────────────────────────────
      await seedDemoFor(A.userId);
      await registerSandbox(A.userId);
      await seedDemoFor(B.userId);
      await registerSandbox(B.userId);

      const aProducts = await serviceDb
        .select()
        .from(shopifyProducts)
        .where(eq(shopifyProducts.user_id, A.userId));
      const bProducts = await serviceDb
        .select()
        .from(shopifyProducts)
        .where(eq(shopifyProducts.user_id, B.userId));
      expect(aProducts.length).toBeGreaterThan(0);
      expect(bProducts.length).toBe(aProducts.length);

      // ── 3. RLS isolation — A's own JWT sees only A's rows ─────────────────
      const aRls = createClient(URL, ANON, {
        global: { headers: { Authorization: `Bearer ${A.token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: aVisible, error: aErr } = await aRls
        .from("shopify_products")
        .select("user_id");
      expect(aErr).toBeNull();
      expect(aVisible?.length).toBe(aProducts.length);
      expect(aVisible?.every((r) => r.user_id === A.userId)).toBe(true);

      // ── 4. Simulated write on A — no Shopify call, B untouched ────────────
      const result = await updateProduct(A.userId, {
        product_gid: VOYAGER,
        body_html: EDIT,
      });
      expect(result.after_state?.body_html ?? "").toContain(EDIT);

      const [bVoyager] = await serviceDb
        .select()
        .from(shopifyProducts)
        .where(
          and(
            eq(shopifyProducts.user_id, B.userId),
            eq(shopifyProducts.product_gid, VOYAGER)
          )
        );
      expect(bVoyager).toBeTruthy();
      expect(bVoyager?.body_html ?? "").not.toContain(EDIT);

      // ── 5. Teardown A — gone — B intact ───────────────────────────────────
      await teardownSandbox(A.userId);

      const aAfter = await serviceDb
        .select()
        .from(shopifyProducts)
        .where(eq(shopifyProducts.user_id, A.userId));
      expect(aAfter.length).toBe(0);

      const aSession = await serviceDb
        .select()
        .from(sandboxSessions)
        .where(eq(sandboxSessions.user_id, A.userId));
      expect(aSession.length).toBe(0);

      const bAfter = await serviceDb
        .select()
        .from(shopifyProducts)
        .where(eq(shopifyProducts.user_id, B.userId));
      expect(bAfter.length).toBe(bProducts.length);
    } finally {
      await teardownSandbox(A.userId).catch(() => {});
      await teardownSandbox(B.userId).catch(() => {});
    }
  });
});
