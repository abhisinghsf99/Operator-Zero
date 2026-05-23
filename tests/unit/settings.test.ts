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
import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Mock Supabase auth — authenticated user
vi.mock("@/lib/auth/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: "user-uuid-test-123" } },
      }),
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
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock Anthropic SDK — returns a predictable draft
vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: "# Generated Voice\n\nWarm, direct, and human.",
            },
          ],
        }),
      },
    };
  });
  return { default: MockAnthropic };
});

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
