/**
 * tests/e2e/approvals-sync.spec.ts
 * Wave-0 RED scaffold — Phase 4 Cross-surface Realtime sync (APRV-05)
 *
 * Requirements covered:
 *   APRV-05 — One row, two views: resolving an approval in one browser context
 *             decrements the sidebar Approvals badge in a SECOND browser context
 *             within 5 seconds (cross-surface Realtime sync via Supabase Realtime
 *             Postgres Changes on the `approvals` table).
 *
 * This is ROADMAP success criterion 1 — the explicit cross-surface timing test.
 * Turned GREEN by: 04-02 Task 3 (Realtime badge sync)
 *
 * Implementation pattern:
 *   - Context A: authenticated browser; resolves an approval via Server Action
 *   - Context B: second browser context (same user); asserts sidebar badge decrements
 *   - Assertion: badge count in Context B decrements within 5000ms of the Context A action
 *
 * Marked fixme (RED) until 04-02 ships the useApprovalsSync hook + Realtime subscription.
 *
 * NOTE: Two-context test requires a live Supabase + authenticated sessions.
 * Playwright supports multiple browser contexts in a single test for this pattern.
 */
import { test, expect, chromium } from "@playwright/test";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

test.describe("APRV-05 — Cross-surface Realtime sync (ROADMAP success criterion 1)", () => {
  test.fixme(
    "resolving approval in context A decrements sidebar badge in context B within 5s",
    async () => {
      // TODO(04-02): ship useApprovalsSync hook with Supabase Realtime Postgres Changes
      // Pattern:
      //   1. Both contexts authenticate as the same test user (via session fixture)
      //   2. Context A navigates to /app/approvals, resolves the first pending approval
      //   3. Context B navigates to /app (sidebar visible), waits for badge to decrement
      //   4. Assert: badge count in B decrements within 5000ms

      test.skip(!HAS_LIVE_STACK, "Requires live Supabase + authenticated session + pending approval");

      const browser = await chromium.launch();

      // Context A: the user who resolves the approval
      const contextA = await browser.newContext();
      const pageA = await contextA.newPage();

      // Context B: observes the sidebar badge (same user, second context)
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();

      try {
        // TODO(04-02): inject session cookies for both contexts (via Supabase Admin API
        // session fixture — same pattern as full-workflow-journey.spec.ts)

        // Navigate Context B to the app (sidebar visible)
        await pageB.goto("/app/approvals");
        const badgeBefore = await pageB
          .getByTestId("approvals-badge-count")
          .textContent();
        const countBefore = parseInt(badgeBefore ?? "0", 10);

        // Navigate Context A to approvals; resolve the first pending approval
        await pageA.goto("/app/approvals");
        await pageA.getByTestId("approval-row").first().click();
        await pageA.getByRole("button", { name: /approve/i }).click();

        // Assert Context B badge decrements within 5000ms (Realtime <5s target)
        await expect(
          pageB.getByTestId("approvals-badge-count")
        ).not.toHaveText(
          String(countBefore),
          { timeout: 5000 }
        );

        const badgeAfter = await pageB
          .getByTestId("approvals-badge-count")
          .textContent();
        const countAfter = parseInt(badgeAfter ?? "0", 10);
        expect(countAfter).toBe(countBefore - 1);
      } finally {
        await contextA.close();
        await contextB.close();
        await browser.close();
      }
    }
  );
});
