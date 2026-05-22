/**
 * tests/e2e/keyboard.spec.ts
 * Wave-0 RED scaffolds — Phase 4 Keyboard accessibility requirements
 *
 * Requirements covered:
 *   UX-03 — Inline approval cards and workflow visualizer keyboard-accessible
 *            with text equivalents (D-13 keyboard model: A/R/E/S/↑↓)
 *
 * Turned GREEN by: 04-05 (A11y + Mobile + Keyboard + Perf pass)
 *
 * These tests are marked fixme (RED) until 04-05 ships the keyboard model.
 */
import { test, expect } from "@playwright/test";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

test.describe("UX-03 — Keyboard accessibility (D-13 model)", () => {
  // Marked fixme: RED until 04-05 ships the keyboard handlers.

  test.fixme(
    "approval detail: pressing 'a' triggers approve without a mouse click",
    async ({ page }) => {
      // TODO(04-05): D-13 — 'a'/'A' key → handleApprove()
      // Guard: key handler must NOT fire when focus is in an input (Pitfall 5)
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.getByTestId("approval-row").first().click();
      // Focus should be in the detail panel
      await page.keyboard.press("a");
      await expect(page.getByTestId("approval-status")).toContainText("Approved");
    }
  );

  test.fixme(
    "approval detail: pressing 'r' opens reject dialog",
    async ({ page }) => {
      // TODO(04-05): D-13 — 'r'/'R' key → handleReject()
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.getByTestId("approval-row").first().click();
      await page.keyboard.press("r");
      await expect(page.getByTestId("reject-dialog")).toBeVisible();
    }
  );

  test.fixme(
    "approval detail: pressing 's' opens snooze picker",
    async ({ page }) => {
      // TODO(04-05): D-13 — 's'/'S' key → handleSnooze()
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.getByTestId("approval-row").first().click();
      await page.keyboard.press("s");
      await expect(page.getByTestId("snooze-picker")).toBeVisible();
    }
  );

  test.fixme(
    "approval detail: 'a' key does NOT fire when focus is in reject reason input (Pitfall 5 guard)",
    async ({ page }) => {
      // TODO(04-05): keyboard handler must skip when target is input/textarea/contenteditable
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.getByTestId("approval-row").first().click();
      await page.keyboard.press("r");
      // Now focus is in reject reason textarea
      await page.getByTestId("reject-reason-input").focus();
      await page.keyboard.type("a"); // typing 'a' should NOT trigger approve
      await expect(page.getByTestId("approval-status")).not.toContainText("Approved");
    }
  );

  test.fixme(
    "all interactive elements have visible focus rings (focus-visible:ring-2)",
    async ({ page }) => {
      // TODO(04-05): Tab through approvals surface; all focusable elements must show ring
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.keyboard.press("Tab");
      // Verify first focused element has visible focus style
      const focused = page.locator(":focus");
      const outlineStyle = await focused.evaluate(
        (el) => getComputedStyle(el).outline
      );
      expect(outlineStyle).not.toBe("0px none rgb(0, 0, 0)");
    }
  );
});
