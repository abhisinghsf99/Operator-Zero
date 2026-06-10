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
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
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
 * Resolved LAZILY, on first DB access — NOT at module import. This matters for
 * `next build`: its "Collecting page data" step imports every route module to
 * analyze it, but never runs a query. If the connection string were resolved at
 * import, a build environment without DATABASE_URL (e.g. Vercel Preview) would
 * crash the build just collecting page data. Deferring the lookup lets the build
 * succeed; the error only surfaces if code actually tries to query without a URL.
 *
 * For unit tests: provide a stub DATABASE_URL in vitest.config.* env.
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

type DB = PostgresJsDatabase<typeof schema>;

// Lazily-created connection pool + Drizzle instances. Nothing here runs (and
// getConnectionString() is not called) until the first property access on
// serviceDb / baseDb — see the proxies below.
let _client: ReturnType<typeof postgres> | undefined;
let _serviceDb: DB | undefined;
let _baseDb: DB | undefined;

function init(): { serviceDb: DB; baseDb: DB } {
  if (!_client) {
    // Connection pool through Supabase's transaction-mode pooler.
    // prepare:false is REQUIRED for transaction-mode pooling.
    //
    // max > 1 is REQUIRED FOR CORRECTNESS, not just throughput. A few web-tier
    // paths call serviceDb (e.g. resolveGidTitles) from *inside* a withUserRls()
    // transaction. With max:1 that nested query waits for the single connection
    // the outer transaction already holds → a self-deadlock that sits "idle in
    // transaction" and hangs until the serverless function times out (~5 min),
    // then dies with "Connection closed". A small pool gives the nested query its
    // own connection, and lets Promise.all'd reads run concurrently.
    //
    // Safe with Supavisor: idle pooled connections hold a client slot, not a
    // backend connection (backends are only pinned during an open transaction).
    _client = postgres(getConnectionString(), {
      prepare: false,
      max: 5,
      connect_timeout: 10, // fail fast if the pooler is unreachable
      idle_timeout: 20, // return idle pooled connections to the pooler after 20s
    });
    _serviceDb = drizzle(_client, { schema });
    _baseDb = drizzle(_client, { schema });
  }
  return { serviceDb: _serviceDb!, baseDb: _baseDb! };
}

/**
 * Build a lazy proxy that initializes the real Drizzle instance on first access
 * and forwards every property/method to it. This preserves the `serviceDb.xxx()`
 * call shape across the whole codebase while deferring connection setup.
 */
function lazyDb(pick: "serviceDb" | "baseDb"): DB {
  return new Proxy({} as DB, {
    get(_target, prop, receiver) {
      const db = init()[pick] as unknown as Record<PropertyKey, unknown>;
      const value = Reflect.get(db, prop, receiver);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(db)
        : value;
    },
  });
}

/**
 * serviceDb — service-role Drizzle client (agent tier).
 * Bypasses RLS (runs as the postgres role). EVERY query MUST filter by user_id.
 * Use ONLY in Inngest functions / internal tooling. Never in web-request code.
 */
export const serviceDb: DB = lazyDb("serviceDb");

/**
 * Internal base client for the web tier. Not exported — web-tier code must go
 * through withUserRls() so RLS is actually enforced.
 */
const baseDb: DB = lazyDb("baseDb");

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
    // Safety net: if this transaction is ever abandoned mid-flight (e.g. the
    // serverless instance is frozen or killed before COMMIT), Postgres aborts it
    // after 15s and releases the connection — instead of it sitting "idle in
    // transaction" and wedging a pooled connection until the function timeout.
    await tx.execute(sql`set local idle_in_transaction_session_timeout = '15s'`);
    // Order matters: load claims, then drop privileges to `authenticated`.
    await tx.execute(sql`select set_config('request.jwt.claims', ${claimsJson}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
