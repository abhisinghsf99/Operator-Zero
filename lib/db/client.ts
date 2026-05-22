/**
 * lib/db/client.ts
 * Two Drizzle-ORM clients for different access patterns.
 *
 * ─── db (RLS-enforced, web tier) ─────────────────────────────────────────────
 *   Uses the publishable/authenticated key. RLS is enforced at the Postgres level
 *   via the policies declared in lib/db/schema/. Safe for use in Server Components,
 *   Route Handlers, and Server Actions — the user's JWT context flows through
 *   Supabase and RLS limits results to their rows only.
 *
 * ─── serviceDb (service-role, agent tier) ────────────────────────────────────
 *   Uses SUPABASE_SERVICE_ROLE_KEY. Bypasses RLS entirely.
 *   MANDATORY: every query on serviceDb MUST include an explicit `user_id = $1`
 *   WHERE clause. Without it, the query sees all users' data.
 *   Use ONLY in Inngest background functions and internal agent tooling.
 *   NEVER expose serviceDb to client code or pass it into Route Handlers.
 *
 * THREAT MODEL:
 *   T-1-02-03: SUPABASE_SERVICE_ROLE_KEY is server-only (no NEXT_PUBLIC_).
 *              serviceDb confined here; RLS bypass documented and code-review-checked.
 *
 * RESEARCH NOTE (Pitfall 7): The two-client split prevents RLS from blocking
 * Inngest functions (which run without a user JWT) while preserving RLS for
 * all web-tier queries.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ─── Validate required env vars at import time ────────────────────────────────
// Both vars must be present; fail loudly rather than silently connect to the wrong DB.

const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local and Vercel environment variables."
  );
}

if (!publishableKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set. Add it to .env.local and Vercel environment variables."
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local and Vercel environment variables. " +
      "This must NEVER have a NEXT_PUBLIC_ prefix."
  );
}

// Extract project ref from URL: https://<ref>.supabase.co
const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");

/**
 * Connection string for the RLS-enforced client.
 * Uses the publishable (anon) key — Supabase enforces RLS with the user's JWT
 * when auth.uid() is set via the session middleware.
 *
 * Connection pooler endpoint (port 6543) for serverless environments.
 */
const rlsConnectionString =
  `postgresql://postgres.${projectRef}:${publishableKey}` +
  `@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

/**
 * Connection string for the service-role client.
 * Service role bypasses RLS. Code MUST filter by user_id explicitly.
 *
 * Uses direct connection (port 5432) for agent-tier Inngest functions
 * which need consistent session state and lower latency than the pooler.
 */
const serviceConnectionString =
  `postgresql://postgres.${projectRef}:${serviceRoleKey}` +
  `@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

// ─── Postgres driver instances ────────────────────────────────────────────────

const rlsPostgres = postgres(rlsConnectionString, {
  prepare: false, // Required for Supabase connection pooler (pgBouncer transaction mode)
  max: 1,         // Serverless: one connection per function invocation
});

const servicePostgres = postgres(serviceConnectionString, {
  prepare: false,
  max: 1,
});

// ─── Drizzle client exports ───────────────────────────────────────────────────

/**
 * RLS-enforced Drizzle client — use in the web tier.
 * Server Components, Route Handlers, Server Actions.
 * Safe to use without explicit user_id filters (RLS enforces isolation).
 */
export const db = drizzle(rlsPostgres, { schema });

/**
 * Service-role Drizzle client — use ONLY in the agent tier (Inngest functions).
 * Bypasses RLS. EVERY query must include WHERE user_id = <userId>.
 * Never import this in client components or Route Handlers serving web requests.
 */
export const serviceDb = drizzle(servicePostgres, { schema });
