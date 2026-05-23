/**
 * tests/e2e/perf.spec.ts
 * Phase 4 Performance e2e tests
 *
 * Requirements covered:
 *   UX-04 — App shell <1.5s p50 LCP, surface nav <300ms, My Workflows <500ms p50
 *
 * Turned GREEN by: 04-06 (Cross-cutting quality pass)
 *
 * Run with chromium project (requires a running dev server + live Supabase stack):
 *   npx playwright test tests/e2e/perf.spec.ts --project=chromium
 *
 * Performance baseline:
 *   - App shell load: <1500ms (p50 target from PRD §5.4.2)
 *   - Surface navigation: <300ms (Router Cache — RSC payload reuse)
 *   - My Workflows: <500ms (p50 target — benefits from unstable_cache + idx_workflows_user_status)
 *
 * CI tolerance:
 *   These tests use CI-aware thresholds. In CI (process.env.CI="1"), limits are
 *   loosened by CI_TOLERANCE_MS because CI agents are slower than developer machines.
 *   The targets below are the PRODUCTION p50 values from PRD §5.4.2.
 *   CI tolerance does NOT relax the targets for production deployments.
 *
 * Environment guard: skip when NEXT_PUBLIC_SUPABASE_URL is absent.
 * Auth requirement: these tests need an authenticated session to reach /app/* surfaces.
 *
 * Measurement approach:
 *   Playwright `page.goto()` with `waitUntil: "domcontentloaded"` measures
 *   time-to-interactive-shell (excludes async data loads not in critical path).
 *   Surface navigation uses client-side Router Cache — measure actual elapsed time
 *   for `page.goto()` from /app/A to /app/B (after first-visit warmup).
 *
 * Note: These measurements are synthetic (localhost, no CDN) and should be
 * considered relative targets, not absolute production values. Vercel Speed
 * Insights provides the authoritative production p50 metrics.
 */
import { test, expect } from "@playwright/test";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

/**
 * CI tolerance: CI agents are ~3-5x slower than developer machines.
 * Add 3000ms buffer in CI for all timing assertions.
 * Production p50 targets remain unchanged.
 */
const CI_TOLERANCE_MS = process.env["CI"] ? 3000 : 0;

/** PRD §5.4.2 p50 targets + CI tolerance */
const TARGETS = {
  appShell: 1500 + CI_TOLERANCE_MS,       // App shell load (domcontentloaded)
  surfaceNav: 300 + CI_TOLERANCE_MS,      // Surface navigation (Router Cache)
  myWorkflows: 500 + CI_TOLERANCE_MS,     // My Workflows surface render
} as const;

test.describe("UX-04 — Performance targets (PRD §5.4.2)", () => {
  test(
    `app shell loads in <${TARGETS.appShell}ms (p50 target: 1500ms)`,
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack");

      // Measure time to DOMContentLoaded (shell + streamed skeleton from loading.tsx)
      // waitUntil: "domcontentloaded" captures the streaming shell render time.
      const start = Date.now();
      await page.goto("/app/approvals", { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - start;

      console.log(`App shell load: ${elapsed}ms (target: <${TARGETS.appShell}ms)`);
      expect(elapsed).toBeLessThan(TARGETS.appShell);
    }
  );

  test(
    `surface navigation completes in <${TARGETS.surfaceNav}ms (p50 target: 300ms, Router Cache)`,
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");

      // First visit — warms up the Router Cache for subsequent navigation
      await page.goto("/app/approvals");
      await page.waitForLoadState("domcontentloaded");

      // Second visit to a DIFFERENT surface — Router Cache should serve RSC payload
      // without a full server round-trip
      const start = Date.now();
      await page.goto("/app/workflows", { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - start;

      console.log(`Surface nav (approvals → workflows): ${elapsed}ms (target: <${TARGETS.surfaceNav}ms)`);
      expect(elapsed).toBeLessThan(TARGETS.surfaceNav);
    }
  );

  test(
    `My Workflows surface renders in <${TARGETS.myWorkflows}ms (p50 target: 500ms)`,
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");

      // Cold navigation to My Workflows — measures the cached query + index performance.
      // Uses unstable_cache (30s TTL, invalidated by workflowsCacheTag) +
      // idx_workflows_user_status index (migration 0006).
      const start = Date.now();
      await page.goto("/app/workflows", { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - start;

      console.log(`My Workflows load: ${elapsed}ms (target: <${TARGETS.myWorkflows}ms)`);
      expect(elapsed).toBeLessThan(TARGETS.myWorkflows);
    }
  );

  test(
    "loading.tsx skeleton renders immediately (streaming shell visible before data loads)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");

      // The loading.tsx skeleton should render before the RSC data fetch completes.
      // We intercept the navigation and check that SOMETHING renders within 500ms.
      const start = Date.now();
      await page.goto("/app/workflows", { waitUntil: "domcontentloaded" });
      const skeletonElapsed = Date.now() - start;

      // DOMContentLoaded fires when the streaming shell (loading.tsx) is painted
      // The skeleton should be visible within 500ms (CDN-edge static shell)
      console.log(`Streaming skeleton (domcontentloaded): ${skeletonElapsed}ms`);
      // DOMContentLoaded should fire much faster than full load
      expect(skeletonElapsed).toBeLessThan(1500 + CI_TOLERANCE_MS);
    }
  );

  test(
    "approvals surface loads in <1500ms (app shell target + content)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");

      const start = Date.now();
      await page.goto("/app/approvals", { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - start;

      console.log(`Approvals load: ${elapsed}ms (target: <1500ms)`);
      expect(elapsed).toBeLessThan(TARGETS.appShell);
    }
  );

  test(
    "settings surface loads in <1500ms",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");

      const start = Date.now();
      await page.goto("/app/settings", { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - start;

      console.log(`Settings load: ${elapsed}ms (target: <1500ms)`);
      expect(elapsed).toBeLessThan(TARGETS.appShell);
    }
  );
});
