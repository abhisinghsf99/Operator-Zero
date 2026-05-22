/**
 * tests/e2e/perf.spec.ts
 * Wave-0 RED scaffolds — Phase 4 Performance requirements
 *
 * Requirements covered:
 *   UX-04 — App shell <1.5s p50 LCP, surface nav <300ms, My Workflows <500ms p50
 *
 * Turned GREEN by: 04-05 (A11y + Mobile + Keyboard + Perf pass)
 *
 * These tests are marked fixme (RED) until 04-05 completes the performance pass
 * (RSC partial prerendering, unstable_cache, DB indexes applied via Task 4 migration).
 *
 * Performance baselines are measured via Playwright's built-in timing APIs.
 * Synthetic Lighthouse checks are out of scope here — covered by Vercel Speed Insights.
 */
import { test, expect } from "@playwright/test";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

test.describe("UX-04 — Performance targets", () => {
  // Marked fixme: RED until 04-05 performance pass is complete.

  test.fixme(
    "app shell loads in <1500ms (LCP target: p50 <1.5s)",
    async ({ page }) => {
      // TODO(04-05): PPR static shell from CDN edge + streamed user data
      // Sidebar must not block on user-specific data
      test.skip(!HAS_LIVE_STACK, "Requires live stack");
      const start = Date.now();
      await page.goto("/app/approvals", { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1500);
    }
  );

  test.fixme(
    "surface navigation between core surfaces completes in <300ms",
    async ({ page }) => {
      // TODO(04-05): Next.js Router Cache stores RSC payloads (30s static, 5min dynamic)
      // After first visit, navigation between the 5 surfaces should be near-instant
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      // Pre-warm the router cache
      const start = Date.now();
      await page.goto("/app/workflows");
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(300);
    }
  );

  test.fixme(
    "My Workflows surface renders within 500ms (p50 target)",
    async ({ page }) => {
      // TODO(04-05): unstable_cache + idx_workflows_user_status (migration 0006)
      // The workflows list must use the new index for sub-500ms DB round-trip
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      const start = Date.now();
      await page.goto("/app/workflows", { waitUntil: "networkidle" });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    }
  );
});
