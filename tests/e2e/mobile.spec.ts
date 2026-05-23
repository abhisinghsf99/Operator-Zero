/**
 * tests/e2e/mobile.spec.ts
 * Phase 4 Mobile parity e2e tests
 *
 * Requirements covered:
 *   UX-01 — 5 core surfaces fully functional on mobile (375px-class viewport)
 *            No read-only stripping. Two-pane → drill-down (D-11).
 *
 * Turned GREEN by: 04-06 (Cross-cutting quality pass)
 *
 * Run with the mobile-chrome Playwright project (Pixel 7, 412px logical width)
 * for real mobile viewport behavior:
 *   npx playwright test tests/e2e/mobile.spec.ts --project=mobile-chrome
 *
 * Environment guard: skip when NEXT_PUBLIC_SUPABASE_URL is absent.
 *
 * Note: Tests that require auth session (navigating /app/* surfaces) need a
 * live Supabase stack + an authenticated browser context. Run these tests
 * locally with NEXT_PUBLIC_SUPABASE_URL set and a running dev server.
 * Tests that only check static markup or the login redirect work without auth.
 *
 * CI tolerance: All navigation tests have a 30s timeout (cold dev server start).
 */
import { test, expect } from "@playwright/test";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

// ─── Bottom-tab parity (structural — no auth needed) ─────────────────────────

test.describe("UX-01 — Bottom-tab structure (mobile nav)", () => {
  test(
    "bottom tab bar renders with all 5 core surface links",
    async ({ page }) => {
      // The login page loads without auth — bottom tabs are in the /app/* layout,
      // so we navigate to /app/* which will redirect to /login. We check the DOM
      // structure by navigating to login which always renders.
      // The bottom-tabs bar is part of the /app/* shell — check via nav redirect.
      await page.goto("/");

      // The bottom tab bar is part of the /app layout — navigate to an /app/* route.
      // Without auth, we land at /login. We verify the bottom-tabs are present when
      // the /app/* shell is rendered (which requires auth). Skip when no live stack.
      test.skip(!HAS_LIVE_STACK, "Requires live stack — bottom tabs are in /app/* shell");

      await page.goto("/app/approvals");
      // After auth redirect the /app/* shell renders with bottom tabs on mobile
      const nav = page.locator("[aria-label='Mobile navigation']");
      await expect(nav).toBeVisible();

      // All 5 surfaces reachable from bottom tabs
      const expectedHrefs = ["/app/chat", "/app/workflows", "/app/approvals", "/app/activity", "/app/settings"];
      for (const href of expectedHrefs) {
        const link = nav.locator(`a[href="${href}"]`);
        await expect(link).toBeAttached();
      }
    }
  );
});

// ─── Approvals drill-down (requires auth + live stack) ───────────────────────

test.describe("UX-01 — Approvals two-pane drill-down on mobile", () => {
  test(
    "approvals: list visible on mobile at /app/approvals",
    async ({ page }) => {
      // Note: CI tolerance — 30s timeout for cold dev server
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      // On mobile, the approvals list should be the primary view (no detail open yet)
      const list = page.getByTestId("approvals-list");
      // List is visible when no detail is active (mobile drill-down initial state)
      await expect(list).toBeVisible({ timeout: 15_000 });
    }
  );

  test(
    "approvals: tapping a row navigates to detail (drill-down hides list)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      const row = page.getByTestId("approval-row").first();
      await expect(row).toBeVisible({ timeout: 15_000 });

      // Tap the first approval row
      await row.tap();

      // Detail panel should now be visible
      await expect(page.getByTestId("approval-detail")).toBeVisible();
      // List panel should now be hidden on mobile (CSS: hidden when activeId is set)
      await expect(page.getByTestId("approvals-list")).not.toBeVisible();
    }
  );

  test(
    "approvals: Back button on detail returns to list (focus managed)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      const row = page.getByTestId("approval-row").first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.tap();

      // Back button should be visible on mobile (hidden on md+)
      const backBtn = page.getByLabel("Back to approvals list");
      await expect(backBtn).toBeVisible();
      await backBtn.tap();

      // List should be visible again after back
      await expect(page.getByTestId("approvals-list")).toBeVisible();
      // Detail should be hidden
      await expect(page.getByTestId("approval-detail")).not.toBeVisible();
    }
  );

  test(
    "approvals: bulk action bar is touch-friendly (select mode toggle works on mobile)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      const toggle = page.getByTestId("select-mode-toggle");
      await expect(toggle).toBeVisible({ timeout: 15_000 });

      // Tap the select-mode toggle
      await toggle.tap();
      // Select a row
      const row = page.getByTestId("approval-row").first();
      await row.tap();

      // Bulk action bar should appear
      await expect(page.getByTestId("bulk-action-bar")).toBeVisible();
    }
  );
});

// ─── Settings drill-down (requires auth + live stack) ────────────────────────

test.describe("UX-01 — Settings section drill-down on mobile", () => {
  test(
    "settings: section nav list visible on mobile at /app/settings",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/settings");
      // On mobile, the section nav should be visible
      const nav = page.getByTestId("settings-nav");
      await expect(nav).toBeVisible({ timeout: 15_000 });
    }
  );

  test(
    "settings: tapping Brand Voice section shows full-screen content",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/settings");
      const navItem = page.getByTestId("settings-nav-brand-voice");
      await expect(navItem).toBeVisible({ timeout: 15_000 });

      // Tap the Brand Voice nav item
      await navItem.tap();

      // Brand voice section content should be visible
      await expect(page.getByTestId("brand-voice-section")).toBeVisible();
      // Nav list should be hidden (replaced by section content)
      await expect(page.getByTestId("settings-nav")).not.toBeVisible();
    }
  );

  test(
    "settings: Back button returns to section nav list",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/settings");
      const navItem = page.getByTestId("settings-nav-brand-voice");
      await expect(navItem).toBeVisible({ timeout: 15_000 });
      await navItem.tap();

      // Back button
      const backBtn = page.getByLabel("Back to settings");
      await expect(backBtn).toBeVisible();
      await backBtn.tap();

      // Nav list should be visible again
      await expect(page.getByTestId("settings-nav")).toBeVisible();
    }
  );
});

// ─── Touch target sizes (structural) ─────────────────────────────────────────

test.describe("UX-01 — Touch target sizes (≥44px) on mobile", () => {
  test(
    "bottom tab items have touch-friendly min height (≥44px)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      const nav = page.locator("[aria-label='Mobile navigation']");
      await expect(nav).toBeVisible({ timeout: 15_000 });

      // Check first tab link has at least 44px height
      const firstTab = nav.locator("a").first();
      const box = await firstTab.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  );
});
