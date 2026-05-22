import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    // Provide test-only env vars so DB clients can be imported in unit tests
    // without requiring a real Supabase connection.
    // These are NOT real credentials — they are plausible-format stubs.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://testprojectref.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key-for-unit-tests",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-for-unit-tests",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
