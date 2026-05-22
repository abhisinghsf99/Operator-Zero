/**
 * lib/db/client.ts
 * Postgres connection + two Drizzle access patterns.
 *
 * ─── serviceDb (service-role / agent tier) ───────────────────────────────────
 *   Runs as the privileged `postgres` role, which BYPASSES RLS. Use ONLY in
 *   Inngest background functions and internal agent tooling, and ALWAYS include
 *   an explicit `where user_id = $1` filter — RLS will not protect you here.
 *   Never expose serviceDb to web-request code.
 *
 * ─── withUserRls() (RLS-enforced / web tier) ─────────────────────────────────
 *   Use in Server Components, Route Handlers, and Server Actions. Runs the
 *   callback inside a transaction that (a) loads the caller's validated JWT
 *   claims into `request.jwt.claims` and (b) switches to the `authenticated`
 *   Postgres role — so `auth.uid()` resolves and the per-table RLS policies
 *   (`(SELECT auth.uid()) = user_id`, declared in lib/db/schema/) are enforced
 *   at the database layer. This is the real multi-tenant safety net; do not
 *   rely on code-level user_id filters alone.
 *
 * WHY A POOLER URL + prepare:false:
 *   We connect through Supabase's transaction-mode connection pooler (port 6543).
 *   Transaction-mode pooling does not support prepared statements, so postgres.js
 *   must be created with { prepare: false }. SET LOCAL role / set_config(..., true)
 *   are transaction-scoped, which is exactly what transaction-mode pooling pins.
 *
 * THREAT MODEL:
 *   T-1-02-03: the DB password and service-role access live only in DATABASE_URL
 *              (server-only, never NEXT_PUBLIC_). RLS bypass is confined to serviceDb.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Resolve the Postgres connection string.
 *
 * MUST be the Supabase **Transaction pooler** URI (port 6543) with the project's
 * database password — NOT a Supabase API key. Get it from:
 *   Supabase Dashboard → Project Settings → Database → Connection string → Transaction pooler
 * It looks like:
 *   postgresql://postgres.<ref>:<DB_PASSWORD>@aws-<n>-<region>.pooler.supabase.com:6543/postgres
 *
 * Called at module load time — DATABASE_URL must be present whenever this
 * module is imported. The postgres.js driver itself is lazy: it does NOT
 * open a TCP connection until the first query executes.
 *
 * For unit tests: provide a stub DATABASE_URL in vitest.config.mts env.
 */
function getConnectionString(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Use the Supabase Transaction pooler connection " +
        "string (port 6543) with your database password (NOT an API key). " +
        "Add it to .env.local and Vercel environment variables."
    );
  }
  return url;
}

// Single pooled connection. prepare:false is REQUIRED for the transaction-mode pooler.
const client = postgres(getConnectionString(), {
  prepare: false,
  max: 1, // serverless: one connection per function invocation
});

/**
 * serviceDb — service-role Drizzle client (agent tier).
 * Bypasses RLS (runs as the postgres role). EVERY query MUST filter by user_id.
 * Use ONLY in Inngest functions / internal tooling. Never in web-request code.
 */
export const serviceDb = drizzle(client, { schema });

/**
 * Internal base client for the web tier. Not exported — web-tier code must go
 * through withUserRls() so RLS is actually enforced.
 */
const baseDb = drizzle(client, { schema });

/** A Drizzle transaction handle, as passed to the withUserRls() callback. */
type RlsTx = Parameters<Parameters<typeof baseDb.transaction>[0]>[0];

/**
 * withUserRls — run web-tier queries as the signed-in user with RLS enforced.
 *
 * Wraps `fn` in a transaction that sets the caller's JWT claims and switches to
 * the `authenticated` role, so Supabase's `auth.uid()` resolves to the user and
 * the table RLS policies limit/permit rows accordingly. The role + claims are
 * set with SET LOCAL / is_local=true, so they reset automatically at COMMIT.
 *
 * @param claims The validated JWT claims from supabase.auth.getClaims() (must include `sub`).
 * @param fn     Callback that receives the RLS-scoped transaction.
 */
export async function withUserRls<T>(
  claims: Record<string, unknown>,
  fn: (tx: RlsTx) => Promise<T>
): Promise<T> {
  if (!claims || typeof claims["sub"] !== "string") {
    throw new Error("withUserRls requires validated JWT claims with a string `sub`.");
  }
  const claimsJson = JSON.stringify(claims);
  return baseDb.transaction(async (tx) => {
    // Order matters: load claims, then drop privileges to `authenticated`.
    await tx.execute(sql`select set_config('request.jwt.claims', ${claimsJson}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
