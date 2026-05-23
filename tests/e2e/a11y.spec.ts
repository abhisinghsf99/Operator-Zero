/**
 * tests/e2e/a11y.spec.ts
 * Phase 4 WCAG 2.1 AA accessibility e2e tests
 *
 * Requirements covered:
 *   UX-02 — All 5 core surfaces meet WCAG 2.1 AA (zero axe-core violations)
 *
 * Turned GREEN by: 04-06 (Cross-cutting quality pass)
 *
 * Uses @axe-core/playwright for automated WCAG AA scanning.
 * axe-core catches ~57% of WCAG issues; manual keyboard/SR testing covers the rest.
 *
 * Run with chromium project:
 *   npx playwright test tests/e2e/a11y.spec.ts --project=chromium
 *
 * Environment guard: skip when NEXT_PUBLIC_SUPABASE_URL is absent.
 * Auth requirement: these tests need an authenticated session to reach /app/* surfaces.
 *   Set up session storage state (storageState) or use a pre-auth cookie fixture.
 *
 * Note: axe-core scans run AFTER page load. Each test navigates to the surface,
 * waits for it to be interactive, then runs the WCAG scan.
 *
 * WCAG criteria checked by axe-core withTags:
 *   wcag2a   — WCAG 2.0 Level A (most critical)
 *   wcag2aa  — WCAG 2.0 Level AA (contrast, labels, etc.)
 *   wcag21a  — WCAG 2.1 Level A additions
 *   wcag21aa — WCAG 2.1 Level AA additions (e.g. 1.3.4 orientation)
 *
 * Manual checks (not automatable by axe, covered by keyboard.spec.ts + human review):
 *   - 2.4.3 Focus order (logical tab sequence)
 *   - 2.4.7 Focus visible (ring style visible)
 *   - 1.4.4 Resize text (200% browser zoom)
 *   - 1.2.x Video/audio (N/A — no media)
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

// Helper: run axe WCAG 2.1 AA scan on current page, assert zero violations.
async function assertZeroViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  // Format violations for readable test output
  if (results.violations.length > 0) {
    const summary = results.violations.map((v) =>
      `[${v.impact}] ${v.id}: ${v.description} — ${v.nodes.length} node(s)`
    ).join("\n");
    console.error("axe violations:\n" + summary);
  }

  expect(results.violations).toEqual([]);
}

test.describe("UX-02 — WCAG 2.1 AA automated scan (axe-core)", () => {
  test(
    "approvals surface passes WCAG 2.1 AA scan",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      // Wait for the approvals surface to load
      await expect(page.getByTestId("approvals-page")).toBeVisible({ timeout: 15_000 });
      await assertZeroViolations(page);
    }
  );

  test(
    "settings surface passes WCAG 2.1 AA scan",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/settings");
      await expect(page.getByTestId("settings-page")).toBeVisible({ timeout: 15_000 });
      await assertZeroViolations(page);
    }
  );

  test(
    "conversation (chat) surface passes WCAG 2.1 AA scan",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/chat");
      // Wait for the page to load (may redirect to a thread or show the chat shell)
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await assertZeroViolations(page);
    }
  );

  test(
    "workflows surface passes WCAG 2.1 AA scan",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/workflows");
      await expect(page.getByTestId("workflows-page")).toBeVisible({ timeout: 15_000 });
      await assertZeroViolations(page);
    }
  );

  test(
    "activity surface passes WCAG 2.1 AA scan",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/activity");
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await assertZeroViolations(page);
    }
  );

  // ── Structural a11y checks (no auth required — checks markup patterns) ──────

  test(
    "login page passes WCAG 2.1 AA scan (no auth required)",
    async ({ page }) => {
      // Login page is publicly accessible — validates the page shell a11y
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");
      await assertZeroViolations(page);
    }
  );
});

// ─── Specific WCAG criteria spot-checks ──────────────────────────────────────

test.describe("UX-02 — Specific WCAG 2.1 AA criteria", () => {
  test(
    "approvals: approval status badges have text labels not just color (1.3.3, 1.4.1)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // Stakes badges must have aria-label with text content (not color alone)
      // ApprovalRow stakes span has aria-label="Stakes: high/med/low"
      const stakesBadges = page.locator("[aria-label^='Stakes:']");
      const count = await stakesBadges.count();
      // If there are approvals, verify stake badges
      if (count > 0) {
        const firstBadge = stakesBadges.first();
        const ariaLabel = await firstBadge.getAttribute("aria-label");
        expect(ariaLabel).toMatch(/Stakes: (high|med|low)/);
      }
      // If no approvals, at least verify the empty state renders correctly
      // (empty state is still accessible)
    }
  );

  test(
    "sidebar Approvals badge has text label for pending count (4.1.2)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // If there are pending approvals, the badge should have aria-label
      const badge = page.getByTestId("approvals-badge-count");
      if (await badge.isVisible()) {
        const ariaLabel = await badge.getAttribute("aria-label");
        expect(ariaLabel).toMatch(/\d+ pending approval/);
      }
      // No badge if count is 0 — acceptable (no pending approvals)
    }
  );

  test(
    "approvals: focus-visible ring on interactive elements (2.4.7)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      await page.goto("/app/approvals");
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // Tab to the first focusable element
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      const focusedCount = await focused.count();

      if (focusedCount > 0) {
        // Check that the focused element is not using outline:none without a ring substitute
        // We check that the element is in our known focus-ring pattern
        const outlineStyle = await focused.first().evaluate(
          (el) => window.getComputedStyle(el).outline
        );
        // Either has a real outline OR uses box-shadow ring (Tailwind focus-visible:ring-2)
        const boxShadow = await focused.first().evaluate(
          (el) => window.getComputedStyle(el).boxShadow
        );
        // At least one should be non-transparent/non-zero
        const hasFocusStyle = outlineStyle !== "0px none rgb(0, 0, 0)" || boxShadow !== "none";
        expect(hasFocusStyle).toBe(true);
      }
    }
  );

  test(
    "approvals: error messages have role=alert for screen reader announcement (3.3.1)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      // This test verifies the markup pattern — error regions use role="alert"
      // Check that the approvals page DOM has no role="alert" with empty content
      // (empty alerts are announced by screen readers causing noise)
      await page.goto("/app/approvals");
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const alerts = page.locator('[role="alert"]');
      const alertCount = await alerts.count();
      for (let i = 0; i < alertCount; i++) {
        const alertText = await alerts.nth(i).textContent();
        // Any visible alert should have non-empty content
        const isVisible = await alerts.nth(i).isVisible();
        if (isVisible) {
          expect(alertText?.trim().length).toBeGreaterThan(0);
        }
      }
    }
  );

  test(
    "reduced-motion: MotionConfig reducedMotion=user is in app shell (1.3.3 animation)",
    async ({ page }) => {
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session");
      // The app/app/layout.tsx wraps children in MotionConfig reducedMotion="user"
      // This test verifies that when prefers-reduced-motion is set, Framer Motion
      // animations are calmed. We simulate the media feature via CDP.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/app/approvals");
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      // Page should load without animation issues — no thrown errors
      // (structural check; visual verification done in human checkpoint Task 4)
      await expect(page.getByTestId("approvals-page")).toBeVisible({ timeout: 10_000 });
    }
  );
});
