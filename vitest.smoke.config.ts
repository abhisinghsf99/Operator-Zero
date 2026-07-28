/**
 * vitest.smoke.config.ts
 * Smoke-test config that runs against the REAL Supabase project.
 *
 * Unlike vitest.config.ts, it does NOT inject stub env vars — it uses the
 * process environment as-is, so you must load real credentials first:
 *
 *   set -a && . ./.env.local && set +a
 *   SMOKE_PROD=1 npx vitest run --config vitest.smoke.config.ts
 *
 * Only files matching tests/smoke/**\/*.smoke.ts are picked up, so these never
 * run in the normal `npm test` suite. The smoke tests themselves also self-skip
 * unless SMOKE_PROD=1 is set, as a second guard against accidental prod writes.
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/smoke/**/*.smoke.ts"],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      voyageai: path.resolve(
        __dirname,
        "node_modules/voyageai/dist/cjs/extended/index.js"
      ),
    },
  },
});
