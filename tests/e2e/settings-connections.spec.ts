/**
 * tests/e2e/settings-connections.spec.ts
 * Wave-0 scaffold — SET-01: Connections page status + disconnect
 *
 * Playwright e2e test for the Settings/Connections page.
 * Tests that connection status badges display correctly and the disconnect
 * flow works end-to-end.
 *
 * Requirement: SET-01 — Connections section: Shopify/Gmail status + last sync + reconnect/disconnect
 *
 * Skipped when no live Supabase is configured (CI without live auth).
 */

import { test, expect } from "@playwright/test";

const HAS_LIVE_SUPABASE = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

test.describe("SET-01 — Settings connections page", () => {
  test("unauthenticated visit to /app/settings redirects to /login", async ({ page }) => {
    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("settings page shows Shopify connection status badge", async ({ page }) => {
    test.skip(!HAS_LIVE_SUPABASE, "Requires live Supabase + authenticated session");
    // TODO: set up authenticated session fixture
    // TODO: seed integrations row with status='active'
    await page.goto("/app/settings");
    await expect(page.getByTestId("shopify-status-badge")).toBeVisible();
  });

  test("settings page shows Gmail connection status badge", async ({ page }) => {
    test.skip(!HAS_LIVE_SUPABASE, "Requires live Supabase + authenticated session");
    await page.goto("/app/settings");
    await expect(page.getByTestId("gmail-status-badge")).toBeVisible();
  });

  test("reconnect button visible when integration is expired/revoked", async ({ page }) => {
    test.skip(!HAS_LIVE_SUPABASE, "Requires live Supabase + authenticated session");
    // TODO: seed integration with status='expired'
    await page.goto("/app/settings");
    await expect(page.getByTestId("reconnect-shopify")).toBeVisible();
  });

  test("disconnect Shopify shows confirmation dialog before deleting", async ({ page }) => {
    test.skip(!HAS_LIVE_SUPABASE, "Requires live Supabase + authenticated session");
    await page.goto("/app/settings");
    await page.getByTestId("disconnect-shopify").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
