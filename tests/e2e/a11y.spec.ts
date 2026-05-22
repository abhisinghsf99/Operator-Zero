/**
 * tests/e2e/a11y.spec.ts
 * Wave-0 RED scaffolds — Phase 4 WCAG 2.1 AA accessibility requirements
 *
 * Requirements covered:
 *   UX-02 — All 5 core surfaces meet WCAG 2.1 AA
 *
 * Turned GREEN by: 04-05 (A11y + Mobile + Keyboard + Perf pass)
 *
 * Uses @axe-core/playwright for automated WCAG AA scanning.
 * These tests are marked fixme (RED) until 04-05 completes the A11y pass.
 *
 * Environment guard: skip when NEXT_PUBLIC_SUPABASE_URL is absent
 * (same pattern as settings-connections.spec.ts).
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

test.describe("UX-02 — WCAG 2.1 AA automated scan", () => {
  // Marked fixme: RED until 04-05 completes the A11y pass across all surfaces.
  // When 04-05 ships: remove fixme, authenticate, run axe on each surface.

  test.fixme(
    "approvals surface passes WCAG 2.1 AA scan (axe-core)",
    async ({ page }) => {
      // TODO(04-05): authenticate session, navigate to /app/approvals, run axe scan
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
  );

  test.fixme(
    "settings surface passes WCAG 2.1 AA scan (axe-core)",
    async ({ page }) => {
      // TODO(04-05): authenticate session, navigate to /app/settings, run axe scan
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/settings");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
  );

  test.fixme(
    "conversation surface passes WCAG 2.1 AA scan (axe-core)",
    async ({ page }) => {
      // TODO(04-05): authenticate session, navigate to /app/chat, run axe scan
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/chat");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
  );

  test.fixme(
    "workflows surface passes WCAG 2.1 AA scan (axe-core)",
    async ({ page }) => {
      // TODO(04-05): authenticate session, navigate to /app/workflows, run axe scan
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/workflows");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
  );

  test.fixme(
    "activity surface passes WCAG 2.1 AA scan (axe-core)",
    async ({ page }) => {
      // TODO(04-05): authenticate session, navigate to /app/activity, run axe scan
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/activity");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
  );
});
