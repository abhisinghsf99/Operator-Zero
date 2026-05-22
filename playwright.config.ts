import { defineConfig, devices } from "@playwright/test";

/**
 * playwright.config.ts
 * Playwright configuration for the Operator Zero walking-skeleton e2e suite.
 *
 * - testDir: tests/e2e
 * - baseURL: http://localhost:3000
 * - webServer: runs `npm run dev` and reuses an existing server if already running
 * - Single Chromium project for the happy-path slice
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // Sequential for auth state clarity
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Navigation timeout for slow cold starts
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // UX-01: Mobile parity — 375px-class viewport for two-pane drill-down tests.
      // Pixel 7 is a representative Android device at 412px logical width.
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // Re-use an already-running dev server (e.g. the developer's own terminal)
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
