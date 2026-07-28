/**
 * tests/e2e/sandbox.spec.ts
 * UI-level e2e for the per-visitor demo sandbox (the public demo path).
 *
 * Proves, through the real browser against a live Supabase project:
 *   1. The "Try the live demo" CTA signs the visitor into an isolated sandbox
 *      and lands them in /app/workflows with the SANDBOX banner ("changes are private…").
 *   2. Two concurrent visitors get DISTINCT anonymous identities (different auth
 *      cookies → different RLS tenants). DB-level row isolation is covered by the
 *      prod smoke test (tests/smoke/sandbox.smoke.ts); this proves it at the door.
 *   3. A sandbox visitor cannot initiate a real Shopify OAuth connect — the route
 *      bounces them back to Settings instead of off to Shopify.
 *   4. The exit beacon endpoint (/api/sandbox/exit) tears the sandbox down (204).
 *
 * REQUIREMENTS: a live Supabase project with **anonymous sign-ins enabled** and
 * migration 0011 applied. Skipped when NEXT_PUBLIC_SUPABASE_URL is absent.
 *
 * SELF-CLEANING: every test posts to /api/sandbox/exit in `finally`, so the
 * throwaway anonymous users + seeded data it creates are deleted immediately
 * (the TTL-sweep cron is only a backstop).
 *
 * NOTE ON TIMING: enterSandbox seeds ~150 rows per visitor. Run from a laptop
 * against a remote DB that's slow (each query pays network RTT), so the post-CTA
 * navigation uses a generous timeout. In a co-located Vercel function it's fast.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const HAS_LIVE_SUPABASE = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

// Seeding fires many sequential inserts; allow plenty of headroom for the redirect.
const SEED_TIMEOUT = 90_000;

/** Click the public demo CTA and wait until the seeded sandbox lands in /app/workflows. */
async function enterSandbox(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: /try the live demo/i }).click();
  await expect(page).toHaveURL(/\/app\/workflows/, { timeout: SEED_TIMEOUT });
  return page;
}

/** Deterministically tear the sandbox down (same endpoint the tab-close beacon hits). */
async function leaveSandbox(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      await fetch("/api/sandbox/exit", { method: "POST", keepalive: true });
    });
  } catch {
    // best-effort — the TTL-sweep cron reclaims anything left behind
  }
}

/** Extract the Supabase auth-token cookie value (identifies the signed-in user). */
function authCookieValue(
  cookies: Array<{ name: string; value: string }>
): string {
  // @supabase/ssr names it sb-<ref>-auth-token (possibly chunked .0/.1).
  const chunks = cookies
    .filter((c) => /auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value);
  return chunks.join("");
}

test.describe("demo sandbox (UI)", () => {
  test.skip(
    !HAS_LIVE_SUPABASE,
    "Requires live Supabase with anonymous sign-ins enabled + migration 0011"
  );

  test("CTA enters an isolated sandbox and shows the sandbox banner", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    let page: Page | undefined;
    try {
      page = await enterSandbox(ctx);
      await expect(
        page.getByText(/your changes are private to this session/i)
      ).toBeVisible();
    } finally {
      if (page) await leaveSandbox(page);
      await ctx.close();
    }
  });

  test("two concurrent visitors get distinct anonymous identities", async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    let pageA: Page | undefined;
    let pageB: Page | undefined;
    try {
      pageA = await enterSandbox(ctxA);
      pageB = await enterSandbox(ctxB);

      const a = authCookieValue(await ctxA.cookies());
      const b = authCookieValue(await ctxB.cookies());

      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
      expect(a).not.toBe(b); // different sessions → different RLS tenants
    } finally {
      if (pageA) await leaveSandbox(pageA);
      if (pageB) await leaveSandbox(pageB);
      await ctxA.close();
      await ctxB.close();
    }
  });

  test("sandbox visitor cannot initiate a real Shopify OAuth connect", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    let page: Page | undefined;
    try {
      page = await enterSandbox(ctx);
      // Anonymous users must never reach Shopify's authorize URL — the connect
      // route redirects them back to Settings.
      await page.goto(
        "/api/integrations/shopify/connect?shop=some-store.myshopify.com"
      );
      await expect(page).toHaveURL(/\/app\/settings/);
      expect(page.url()).not.toContain("myshopify.com/admin/oauth");
    } finally {
      if (page) await leaveSandbox(page);
      await ctx.close();
    }
  });

  test("exit beacon endpoint tears the sandbox down (204)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    let page: Page | undefined;
    try {
      page = await enterSandbox(ctx);
      // The exit route awaits teardown before responding, so a 204 means the
      // visitor's data + identity have been deleted. (Row-level deletion is
      // asserted directly in tests/smoke/sandbox.smoke.ts.)
      const status = await page.evaluate(async () => {
        const res = await fetch("/api/sandbox/exit", { method: "POST" });
        return res.status;
      });
      expect(status).toBe(204);
    } finally {
      if (page) await leaveSandbox(page);
      await ctx.close();
    }
  });
});
