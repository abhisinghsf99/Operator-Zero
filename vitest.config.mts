import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    // Exclude Playwright e2e tests — they use @playwright/test, not vitest
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Provide test-only env vars so DB clients can be imported in unit tests
    // without requiring a real Supabase connection.
    // These are NOT real credentials — they are plausible-format stubs.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://testprojectref.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key-for-unit-tests",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-for-unit-tests",
      // postgres.js does not connect until first query, so a stub URL lets the
      // db client be imported in unit tests without a real DB.
      DATABASE_URL:
        "postgresql://postgres.testprojectref:test-db-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Force CJS resolution for voyageai — its ESM build has a broken directory
      // import in voyageai/dist/esm/api that Node ESM cannot resolve.
      // The CJS build (dist/cjs/extended/index.js) works correctly.
      // [Rule 3 - Blocking] auto-fix for test environment.
      voyageai: path.resolve(
        __dirname,
        "node_modules/voyageai/dist/cjs/extended/index.js"
      ),
    },
  },
});
