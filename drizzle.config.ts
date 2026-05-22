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
  // dbCredentials: drizzle-kit generate does not connect to the DB — this field is
  // required by the config schema but unused for generate. Use DATABASE_URL directly
  // so the right region/host is always used. Falls back to an explicit placeholder
  // (localhost) that communicates intent rather than deriving a potentially wrong
  // AWS region from NEXT_PUBLIC_SUPABASE_URL.
  // For live DB operations use Supabase CLI, not drizzle-kit.
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
