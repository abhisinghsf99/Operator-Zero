/**
 * drizzle.config.ts
 * Drizzle Kit configuration for schema generation.
 *
 * Usage: npx drizzle-kit generate
 *   → produces SQL in ./drizzle/
 *   → copy generated SQL to supabase/migrations/
 *   → apply with: npx supabase db push
 *
 * NEVER run `drizzle-kit migrate` against Supabase (RESEARCH.md Pitfall 2).
 * Supabase CLI is the single source of truth for what runs against the DB.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  // dbCredentials not required for `generate` (only for push/pull/migrate)
  // For live DB operations use Supabase CLI, not drizzle-kit
  dbCredentials: {
    url: process.env["NEXT_PUBLIC_SUPABASE_URL"]
      ? `postgresql://postgres.${process.env["NEXT_PUBLIC_SUPABASE_URL"].replace("https://", "").replace(".supabase.co", "")}:placeholder@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
      : "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
