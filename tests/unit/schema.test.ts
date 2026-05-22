/**
 * schema.test.ts — TDD RED: failing tests for Drizzle schema shape
 * Task 2: user_profiles + integrations tables with RLS, two DB clients
 *
 * No live DB needed — we introspect Drizzle table objects and client exports.
 */
import { describe, it, expect } from "vitest";

describe("user_profiles schema shape", () => {
  it("exports userProfiles table with correct columns", async () => {
    const { userProfiles } = await import("@/lib/db/schema/users");
    const cols = userProfiles._.columns;

    // Primary key: user_id uuid
    expect(cols).toHaveProperty("user_id");
    expect(cols["user_id"]?.primary).toBe(true);

    // Optional text columns
    expect(cols).toHaveProperty("display_name");
    expect(cols).toHaveProperty("avatar_url");
    expect(cols).toHaveProperty("shopify_shop");

    // Nullable timestamptz columns
    expect(cols).toHaveProperty("onboarding_completed_at");
    expect(cols).toHaveProperty("deletion_requested_at");

    // Required timestamptz columns with defaults
    expect(cols).toHaveProperty("created_at");
    expect(cols).toHaveProperty("updated_at");
  });

  it("userProfiles has RLS enabled", async () => {
    const { userProfiles } = await import("@/lib/db/schema/users");
    // enableRLS() sets _: { isRLSEnabled: true }
    expect((userProfiles as { _: { isRLSEnabled?: boolean } })._.isRLSEnabled).toBe(true);
  });

  it("userProfiles declares a policy referencing user_id", async () => {
    const { userProfiles } = await import("@/lib/db/schema/users");
    // Drizzle stores policies in the table's extra config
    const tableConfig = userProfiles._.config;
    // pgPolicy entries are accessible via the table config extra array
    const extraConfig = (tableConfig as unknown as { extra?: unknown[] })?.extra ?? [];
    const hasPolicyWithUserId = JSON.stringify(extraConfig).includes("user_id");
    expect(hasPolicyWithUserId).toBe(true);
  });
});

describe("integrations schema shape", () => {
  it("exports integrations table with all required columns", async () => {
    const { integrations } = await import("@/lib/db/schema/integrations");
    const cols = integrations._.columns;

    // id uuid PK
    expect(cols).toHaveProperty("id");
    expect(cols["id"]?.primary).toBe(true);

    // user_id uuid NOT NULL FK
    expect(cols).toHaveProperty("user_id");
    expect(cols["user_id"]?.notNull).toBe(true);

    // provider text NOT NULL
    expect(cols).toHaveProperty("provider");
    expect(cols["provider"]?.notNull).toBe(true);

    // status text NOT NULL
    expect(cols).toHaveProperty("status");
    expect(cols["status"]?.notNull).toBe(true);

    // access_token_encrypted text NOT NULL (plaintext never persisted)
    expect(cols).toHaveProperty("access_token_encrypted");
    expect(cols["access_token_encrypted"]?.notNull).toBe(true);

    // refresh_token_encrypted text (nullable)
    expect(cols).toHaveProperty("refresh_token_encrypted");

    // scopes text[] NOT NULL
    expect(cols).toHaveProperty("scopes");
    expect(cols["scopes"]?.notNull).toBe(true);

    // Optional columns
    expect(cols).toHaveProperty("provider_account_id");
    expect(cols).toHaveProperty("last_synced_at");
    expect(cols).toHaveProperty("last_error");
    expect(cols).toHaveProperty("expires_at");

    // connected_at timestamptz NOT NULL DEFAULT now()
    expect(cols).toHaveProperty("connected_at");
    expect(cols["connected_at"]?.notNull).toBe(true);
  });

  it("integrations has RLS enabled", async () => {
    const { integrations } = await import("@/lib/db/schema/integrations");
    expect((integrations as { _: { isRLSEnabled?: boolean } })._.isRLSEnabled).toBe(true);
  });

  it("integrations declares a policy referencing user_id", async () => {
    const { integrations } = await import("@/lib/db/schema/integrations");
    const tableConfig = integrations._.config;
    const extraConfig = (tableConfig as unknown as { extra?: unknown[] })?.extra ?? [];
    const hasPolicyWithUserId = JSON.stringify(extraConfig).includes("user_id");
    expect(hasPolicyWithUserId).toBe(true);
  });

  it("integrations has unique(user_id, provider) constraint", async () => {
    const { integrations } = await import("@/lib/db/schema/integrations");
    // Drizzle stores unique constraints in the table config
    const tableConfig = integrations._.config;
    const uniqueConstraints = JSON.stringify(tableConfig);
    expect(uniqueConstraints).toContain("user_id");
    expect(uniqueConstraints).toContain("provider");
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
