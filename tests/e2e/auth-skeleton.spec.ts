/**
 * tests/e2e/auth-skeleton.spec.ts
 * Walking-skeleton happy-path Playwright e2e.
 *
 * What this file proves (once Task 2 is implemented):
 *   (a) UNAUTH GUARD: An unauthenticated visit to /app/home is redirected to /login.
 *       No protected content (data-testid=home-greeting) is rendered.
 *   (b) SIGNUP HAPPY PATH: A new user can sign up with email + password on /signup,
 *       land on /app/home, and see the home-greeting element.
 *   (c) OPEN-REDIRECT REJECTION: The /auth/callback route rejects absolute-URL `next`
 *       params and does not navigate off-origin.
 *
 * Guard tests (a + c) ALWAYS run — they do not require a live Supabase.
 * Signup test (b) is SKIPPED when NEXT_PUBLIC_SUPABASE_URL is absent (CI without live auth).
 *
 * This file is written BEFORE implementation (Task 1 TDD RED).
 * ALL tests fail until Task 2 creates the routes, middleware, and pages.
 */

import { test, expect } from "@playwright/test";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a unique throwaway email for each test run.
 * Using a timestamp avoids collisions across repeated runs against the same Supabase project.
 */
function uniqueTestEmail(): string {
  const ts = Date.now();
  return `walking-skeleton+${ts}@example.com`;
}

const HAS_LIVE_SUPABASE = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

// ─── Test: Unauthenticated /app/home → /login redirect ───────────────────────

test("unauth: /app/home redirects to /login without rendering protected content", async ({
  page,
}) => {
  // Navigate to the guarded route without any session cookie.
  const response = await page.goto("/app/home");

  // The middleware should redirect us to /login (307 or 302).
  // Playwright follows redirects, so we assert on the final URL.
  await expect(page).toHaveURL(/\/login/);

  // Protected content must NOT appear.
  const greeting = page.getByTestId("home-greeting");
  await expect(greeting).not.toBeVisible();

  // The HTTP response chain should have included a redirect.
  // Accept any redirect status (301, 302, 307, 308).
  expect(response?.status()).not.toBe(200);
});

// ─── Test: Signup happy path ──────────────────────────────────────────────────

test("signup: email+password → /app/home with home-greeting visible", async ({
  page,
}) => {
  test.skip(
    !HAS_LIVE_SUPABASE,
    "Skipped: NEXT_PUBLIC_SUPABASE_URL not set — live Supabase required for signup"
  );

  const email = uniqueTestEmail();
  const password = "TestPassword123!";

  // Visit the signup page.
  await page.goto("/signup");

  // Fill in the signup form.
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);

  // Submit the form (click the signup/submit button).
  await page.getByRole("button", { name: /sign up/i }).click();

  // Should land on /app/home after successful signup.
  await expect(page).toHaveURL(/\/app\/home/, { timeout: 15_000 });

  // The guarded home page must render the authenticated greeting.
  const greeting = page.getByTestId("home-greeting");
  await expect(greeting).toBeVisible();
});

// ─── Test: Open-redirect rejection ───────────────────────────────────────────

test("security: /auth/callback rejects absolute-URL next param (open-redirect)", async ({
  page,
}) => {
  // Probe: attempt to use the callback route with an external next param.
  // Without a real code, Supabase will error — but the critical assertion is
  // that the final navigation stays on localhost (same origin), not evil.example.
  //
  // This test does NOT require live Supabase credentials.
  // It validates that the callback route's redirect logic never goes off-origin.
  await page.goto("/auth/callback?next=https://evil.example.com/steal");

  // Playwright follows the redirect chain.
  // The final URL must be on localhost:3000, not evil.example.
  const finalUrl = page.url();
  expect(finalUrl).not.toContain("evil.example");
  expect(finalUrl).toMatch(/^http:\/\/localhost:3000/);
});
