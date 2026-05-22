/**
 * schema.test.ts — Drizzle schema shape tests for user_profiles + integrations
 * Task 2: TDD tests (GREEN pass after schema implementation)
 *
 * No live DB needed — we introspect Drizzle table objects and client exports.
 *
 * Drizzle internal API used:
 *   - Columns are directly on the table object (table.user_id, etc.)
 *   - Symbol(drizzle:EnableRLS) tracks RLS
 *   - Symbol(drizzle:ExtraConfigBuilder) returns policies + constraints
 *   - Symbol(drizzle:Columns) returns the columns map
 */
import { describe, it, expect } from "vitest";

// Drizzle internal symbols (stable across the locked version drizzle-orm@0.45.2)
const ENABLE_RLS_SYM = Symbol.for("drizzle:EnableRLS");
const EXTRA_CONFIG_BUILDER_SYM = Symbol.for("drizzle:ExtraConfigBuilder");
// ExtraConfigColumns must be used (not Columns) when calling ExtraConfigBuilder
// so that IndexBuilder.on() receives ExtraConfigColumn instances with proper defaultConfig
const EXTRA_CONFIG_COLS_SYM = Symbol.for("drizzle:ExtraConfigColumns");

type DrizzleTable = Record<symbol, unknown>;

function getExtraConfig(table: DrizzleTable): unknown[] {
  const builder = table[EXTRA_CONFIG_BUILDER_SYM] as ((cols: unknown) => unknown[]) | undefined;
  if (!builder) return [];
  // Must pass ExtraConfigColumns so index().on() gets proper defaultConfig (not regular PgColumns)
  const cols = table[EXTRA_CONFIG_COLS_SYM];
  return builder(cols);
}

describe("user_profiles schema shape", () => {
  it("exports userProfiles table with correct columns", async () => {
    const { userProfiles } = await import("@/lib/db/schema/users");

    // Primary key: user_id uuid
    expect(userProfiles.user_id).toBeDefined();
    expect(userProfiles.user_id.primary).toBe(true);

    // Optional text columns (nullable)
    expect(userProfiles.display_name).toBeDefined();
    expect(userProfiles.avatar_url).toBeDefined();
    expect(userProfiles.shopify_shop).toBeDefined();

    // Nullable timestamptz columns
    expect(userProfiles.onboarding_completed_at).toBeDefined();
    expect(userProfiles.deletion_requested_at).toBeDefined();

    // Required timestamptz columns with defaults
    expect(userProfiles.created_at).toBeDefined();
    expect(userProfiles.created_at.notNull).toBe(true);
    expect(userProfiles.updated_at).toBeDefined();
    expect(userProfiles.updated_at.notNull).toBe(true);
  });

  it("userProfiles has RLS enabled", async () => {
    const { userProfiles } = await import("@/lib/db/schema/users");
    const table = userProfiles as unknown as DrizzleTable;
    expect(table[ENABLE_RLS_SYM]).toBe(true);
  });

  it("userProfiles declares a pgPolicy referencing user_id", async () => {
    const { userProfiles } = await import("@/lib/db/schema/users");
    const table = userProfiles as unknown as DrizzleTable;
    const extras = getExtraConfig(table);

    // At least one PgPolicy in the extras
    const policies = extras.filter(
      (e) => e !== null && typeof e === "object" && (e as { name?: string }).name?.includes("policy")
    );
    expect(policies.length).toBeGreaterThan(0);

    // The policy has a USING clause (which references user_id via the sql template)
    const policy = policies[0] as { using?: { queryChunks?: unknown[] }; name?: string };
    expect(policy.using).toBeDefined();
    // The first queryChunk contains the literal SQL "(SELECT auth.uid()) = "
    // which confirms the auth.uid() = user_id pattern is present
    const firstChunk = policy.using?.queryChunks?.[0] as { value?: string[] } | undefined;
    const sqlText = firstChunk?.value?.[0] ?? "";
    expect(sqlText).toContain("auth.uid()");
  });
});

describe("integrations schema shape", () => {
  it("exports integrations table with all required columns", async () => {
    const { integrations } = await import("@/lib/db/schema/integrations");

    // id uuid PK
    expect(integrations.id).toBeDefined();
    expect(integrations.id.primary).toBe(true);

    // user_id uuid NOT NULL
    expect(integrations.user_id).toBeDefined();
    expect(integrations.user_id.notNull).toBe(true);

    // provider text NOT NULL
    expect(integrations.provider).toBeDefined();
    expect(integrations.provider.notNull).toBe(true);

    // status text NOT NULL
    expect(integrations.status).toBeDefined();
    expect(integrations.status.notNull).toBe(true);

    // access_token_encrypted text NOT NULL (plaintext never persisted)
    expect(integrations.access_token_encrypted).toBeDefined();
    expect(integrations.access_token_encrypted.notNull).toBe(true);

    // refresh_token_encrypted text (nullable)
    expect(integrations.refresh_token_encrypted).toBeDefined();

    // scopes text[] NOT NULL
    expect(integrations.scopes).toBeDefined();
    expect(integrations.scopes.notNull).toBe(true);

    // Optional columns
    expect(integrations.provider_account_id).toBeDefined();
    expect(integrations.last_synced_at).toBeDefined();
    expect(integrations.last_error).toBeDefined();
    expect(integrations.expires_at).toBeDefined();

    // connected_at timestamptz NOT NULL DEFAULT now()
    expect(integrations.connected_at).toBeDefined();
    expect(integrations.connected_at.notNull).toBe(true);
  });

  it("integrations has RLS enabled", async () => {
    const { integrations } = await import("@/lib/db/schema/integrations");
    const table = integrations as unknown as DrizzleTable;
    expect(table[ENABLE_RLS_SYM]).toBe(true);
  });

  it("integrations declares a pgPolicy referencing user_id", async () => {
    const { integrations } = await import("@/lib/db/schema/integrations");
    const table = integrations as unknown as DrizzleTable;
    const extras = getExtraConfig(table);

    const policies = extras.filter(
      (e) => e !== null && typeof e === "object" && (e as { name?: string }).name?.includes("policy")
    );
    expect(policies.length).toBeGreaterThan(0);

    // Policy must have a USING clause with auth.uid() = user_id pattern
    const policy = policies[0] as { using?: { queryChunks?: unknown[] }; name?: string };
    expect(policy.using).toBeDefined();
    const firstChunk = policy.using?.queryChunks?.[0] as { value?: string[] } | undefined;
    const sqlText = firstChunk?.value?.[0] ?? "";
    expect(sqlText).toContain("auth.uid()");
  });

  it("integrations has unique(user_id, provider) constraint", async () => {
    const { integrations } = await import("@/lib/db/schema/integrations");
    const table = integrations as unknown as DrizzleTable;
    const extras = getExtraConfig(table);

    // Find UniqueConstraintBuilder entries: have .columns array but NOT .using (which policies have)
    type UniqueConstraintBuilder = {
      columns: Array<{ name: string }>;
      name?: string;
    };
    const uniqueConstraints = extras.filter(
      (e): e is UniqueConstraintBuilder =>
        e !== null &&
        typeof e === "object" &&
        Array.isArray((e as UniqueConstraintBuilder).columns) &&
        !("using" in (e as object))
    );
    expect(uniqueConstraints.length).toBeGreaterThan(0);

    // The unique constraint must reference both user_id and provider
    const colNames = uniqueConstraints[0]!.columns.map((c) => c.name);
    expect(colNames).toContain("user_id");
    expect(colNames).toContain("provider");
  });
});

describe("lib/db/schema/index re-exports", () => {
  it("exports both userProfiles and integrations", async () => {
    const schemaIndex = await import("@/lib/db/schema/index");
    expect(schemaIndex).toHaveProperty("userProfiles");
    expect(schemaIndex).toHaveProperty("integrations");
  });
});

describe("lib/db/client — two distinct clients", () => {
  it("exports db and serviceDb", async () => {
    const { db, serviceDb } = await import("@/lib/db/client");
    expect(db).toBeDefined();
    expect(serviceDb).toBeDefined();
  });

  it("db and serviceDb are not the same instance", async () => {
    const { db, serviceDb } = await import("@/lib/db/client");
    expect(db).not.toBe(serviceDb);
  });
});
