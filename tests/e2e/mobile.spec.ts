/**
 * tests/e2e/mobile.spec.ts
 * Wave-0 RED scaffolds — Phase 4 Mobile parity requirements
 *
 * Requirements covered:
 *   UX-01 — 5 core surfaces fully functional on mobile (375px-class viewport)
 *            No read-only stripping. Two-pane → drill-down (D-11).
 *
 * Turned GREEN by: 04-05 (A11y + Mobile + Keyboard + Perf pass)
 *
 * Run with the mobile-chrome Playwright project (Pixel 7, 412px logical width)
 * for real mobile viewport behavior.
 *
 * These tests are marked fixme (RED) until 04-05 ships the mobile drill-down.
 */
import { test, expect } from "@playwright/test";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

test.describe("UX-01 — Mobile parity (two-pane drill-down)", () => {
  // Marked fixme: RED until 04-05 ships mobile drill-down for Approvals + Settings.

  test.fixme(
    "approvals: list visible on mobile, tapping row navigates to detail (drill-down)",
    async ({ page }) => {
      // TODO(04-05): D-11 — mobile shows list OR detail (not both columns)
      // Tap an approval row → navigate to /app/approvals/[id] (detail fills full width)
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      // On mobile, list should be visible
      await expect(page.getByTestId("approvals-list")).toBeVisible();
      // Tap first row
      await page.getByTestId("approval-row").first().tap();
      // Detail panel should fill full width; list should be hidden
      await expect(page.getByTestId("approval-detail")).toBeVisible();
      await expect(page.getByTestId("approvals-list")).not.toBeVisible();
    }
  );

  test.fixme(
    "approvals: back button on detail returns to list (focus managed)",
    async ({ page }) => {
      // TODO(04-05): Back affordance — aria-label='Back to approvals list'
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.getByTestId("approval-row").first().tap();
      await page.getByLabel("Back to approvals list").tap();
      await expect(page.getByTestId("approvals-list")).toBeVisible();
    }
  );

  test.fixme(
    "settings: nav sections visible on mobile; tapping section navigates to detail",
    async ({ page }) => {
      // TODO(04-05): D-11 — settings mobile drill-down: /app/settings → list of sections
      // Tap "Brand Voice" → detail fills full width
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/settings");
      await expect(page.getByTestId("settings-nav")).toBeVisible();
      await page.getByText("Brand Voice").tap();
      await expect(page.getByTestId("brand-voice-section")).toBeVisible();
    }
  );

  test.fixme(
    "bulk action bar is touch-friendly on mobile (no hover dependency)",
    async ({ page }) => {
      // TODO(04-05): D-12 — bulk select-mode toggle + action bar; touch targets ≥44px
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.getByTestId("select-mode-toggle").tap();
      await expect(page.getByTestId("bulk-action-bar")).toBeVisible();
    }
  );
});
