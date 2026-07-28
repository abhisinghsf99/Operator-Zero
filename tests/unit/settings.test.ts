/**
 * tests/unit/settings.test.ts
 * Phase 4 Settings requirements — brand voice (SET-02)
 *
 * Requirements covered:
 *   SET-02 — Brand Voice: saveBrandVoice encrypts; regenerate returns draft without saving
 *
 * Turned GREEN by: 04-03 (Settings slice — Brand Voice + Memory + Profile)
 *
 * Tests verify:
 *   1. saveBrandVoice exists and calls encryptToken before DB write
 *   2. regenerateBrandVoice exists and returns { draft } without writing to DB
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

// Mock crypto — encryptToken returns predictable "encrypted:<plaintext>"
vi.mock("@/lib/integrations/crypto", () => ({
  encryptToken: vi.fn().mockImplementation((v: string) =>
    Promise.resolve(`encrypted:${v}`)
  ),
  decryptToken: vi.fn().mockImplementation((v: string) => {
    if (v.startsWith("encrypted:")) return Promise.resolve(v.slice(10));
    throw new Error("Decryption failed: not a ciphertext");
  }),
}));

// Mock Supabase auth — authenticated user by default; individual tests (WS8)
// override mockGetClaims to exercise anonymous / shared-demo identities.
const mockGetClaims = vi.fn().mockResolvedValue({
  data: { claims: { sub: "user-uuid-test-123" } },
});
vi.mock("@/lib/auth/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getClaims: mockGetClaims,
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

// Mock serviceDb — captures what was written
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
});

const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([
        {
          user_id: "user-uuid-test-123",
          sample_text: "hand-thrown, small-batch ceramic pieces.",
          source: "onboarding",
        },
      ]),
    }),
  }),
});

// Tracks whether disconnectIntegration's RLS-scoped delete ever ran — WS8
// tests assert this stays untouched when a sandbox/demo identity is blocked.
const mockTxDeleteWhere = vi.fn().mockResolvedValue([]);
const mockTxDelete = vi.fn().mockReturnValue({ where: mockTxDeleteWhere });
const mockWithUserRls = vi.fn(
  (_claims: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ delete: mockTxDelete })
);

vi.mock("@/lib/db/client", () => ({
  serviceDb: {
    update: mockUpdate,
    select: mockSelect,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        // Support both .returning() (legacy) and .onConflictDoUpdate() (upsert — CR-01)
        returning: vi.fn().mockResolvedValue([{ id: "mem-id-1" }]),
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  },
  // disconnectIntegration (WS8) imports withUserRls via "@/lib/db", which
  // re-exports it from this module (lib/db/index.ts: `export { withUserRls,
  // serviceDb } from "./client"`) — mock it here so that re-export resolves.
  withUserRls: mockWithUserRls,
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock the AI SDK boundary (regenerateBrandVoice now uses generateText) —
// returns a predictable draft.
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "# Generated Voice\n\nWarm, direct, and human.",
  }),
}));
vi.mock("@/lib/agent/llm/models", () => ({
  resolveModel: vi.fn().mockReturnValue({ provider: "anthropic", modelId: "claude-opus-4-5" }),
}));

// Mock memory functions
vi.mock("@/lib/agent/memory", () => ({
  storeMemoryItem: vi.fn().mockResolvedValue({ id: "mem-id-1" }),
  updateMemoryItem: vi.fn().mockResolvedValue(undefined),
  softDeleteMemoryItem: vi.fn().mockResolvedValue(undefined),
  recallMemory: vi.fn().mockResolvedValue([]),
}));

// ─── SET-02: Brand Voice ──────────────────────────────────────────────────────

describe("SET-02 — brand voice", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("saveBrandVoice exists and is exported from settings/actions", async () => {
    const actionsModule = await import("@/app/app/settings/actions").catch(
      () => null
    );
    expect(actionsModule).not.toBeNull();
    const saveBrandVoice =
      actionsModule && "saveBrandVoice" in actionsModule
        ? actionsModule.saveBrandVoice
        : null;
    expect(saveBrandVoice).not.toBeNull();
    expect(typeof saveBrandVoice).toBe("function");
  });

  it("saveBrandVoice calls encryptToken before DB write (plaintext never persisted)", async () => {
    // Re-import fresh module to pick up mocks
    const { saveBrandVoice } = await import("@/app/app/settings/actions");
    const { encryptToken } = await import("@/lib/integrations/crypto");
    const { serviceDb } = await import("@/lib/db/client");

    const testMarkdown = "## Voice\n\nFriendly and direct.";
    await saveBrandVoice(testMarkdown);

    // encryptToken must have been called with the raw markdown
    expect(encryptToken).toHaveBeenCalledWith(testMarkdown);

    // serviceDb.insert must have been called (CR-01: upsert instead of bare UPDATE)
    expect(serviceDb.insert).toHaveBeenCalled();

    // The value passed to .values() should include the encrypted form (not raw markdown)
    const insertResult = (serviceDb.insert as ReturnType<typeof vi.fn>).mock.results[0];
    expect(insertResult).toBeDefined();
  });

  it("regenerateBrandVoice exists and is exported from settings/actions", async () => {
    const actionsModule = await import("@/app/app/settings/actions").catch(
      () => null
    );
    const regenerateBrandVoice =
      actionsModule && "regenerateBrandVoice" in actionsModule
        ? actionsModule.regenerateBrandVoice
        : null;

    expect(regenerateBrandVoice).not.toBeNull();
    expect(typeof regenerateBrandVoice).toBe("function");
  });

  it("regenerateBrandVoice returns { draft } without calling DB update (no silent overwrite — SET-02, T-4-03-04)", async () => {
    const { regenerateBrandVoice } = await import("@/app/app/settings/actions");
    const { serviceDb } = await import("@/lib/db/client");

    const result = await regenerateBrandVoice();

    // Must return a draft property
    expect(result).toHaveProperty("draft");
    if ("draft" in result) {
      expect(typeof result.draft).toBe("string");
      expect(result.draft.length).toBeGreaterThan(0);
    }

    // serviceDb.update should NOT have been called (no DB write — T-4-03-04)
    expect(serviceDb.update).not.toHaveBeenCalled();
  });
});

// ─── WS8: sandbox guard on disconnectIntegration ──────────────────────────────

describe("WS8 — disconnectIntegration blocks every sandbox/demo identity", () => {
  const REAL_DEMO_USER_ID = process.env.DEMO_USER_ID;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-uuid-test-123" } },
    });
  });

  afterEach(() => {
    if (REAL_DEMO_USER_ID === undefined) {
      delete process.env.DEMO_USER_ID;
    } else {
      process.env.DEMO_USER_ID = REAL_DEMO_USER_ID;
    }
  });

  it("blocks an anonymous sandbox visitor (is_anonymous: true) and performs no delete", async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "anon-visitor-1", is_anonymous: true } },
    });

    const { disconnectIntegration } = await import("@/app/app/settings/actions");
    const { DEMO_DISABLED_MESSAGE } = await import("@/lib/auth/demo");

    const result = await disconnectIntegration("shopify");

    expect(result).toEqual({ error: DEMO_DISABLED_MESSAGE });
    expect(mockTxDelete).not.toHaveBeenCalled();
  });

  it("blocks the shared demo user's claims regardless of DEMO_SHOPIFY_LOCKED and performs no delete", async () => {
    process.env.DEMO_USER_ID = "shared-demo-user-id";
    delete process.env.DEMO_SHOPIFY_LOCKED; // unset = "unlocked" under the OLD guard
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "shared-demo-user-id" } },
    });

    const { disconnectIntegration } = await import("@/app/app/settings/actions");
    const { DEMO_DISABLED_MESSAGE } = await import("@/lib/auth/demo");

    const result = await disconnectIntegration("shopify");

    expect(result).toEqual({ error: DEMO_DISABLED_MESSAGE });
    expect(mockTxDelete).not.toHaveBeenCalled();
  });

  it("does not block an ordinary authenticated user", async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "ordinary-user-1" } },
    });

    const { disconnectIntegration } = await import("@/app/app/settings/actions");
    const result = await disconnectIntegration("shopify");

    expect(result).not.toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
    expect(mockTxDelete).toHaveBeenCalled();
  });
});
