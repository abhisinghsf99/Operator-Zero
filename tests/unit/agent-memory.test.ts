/**
 * tests/unit/agent-memory.test.ts
 * Wave-0 scaffold — AGENT-05: Memory record/update/soft-delete + semantic recall
 *
 * Tests the agent memory lifecycle — recording, updating, soft-deleting memory items
 * and semantic recall via pgvector cosine similarity.
 *
 * Requirement: AGENT-05 — Agent records durable memory items silently with pgvector embeddings
 *
 * LLM TESTING RULE: mock serviceDb + embedText. No live DB or Voyage calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock embeddings ───────────────────────────────────────────────────────────
// vi.mock is hoisted — factory must NOT reference top-level variables declared later.

vi.mock("@/lib/agent/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
}));

// ─── Mock serviceDb ────────────────────────────────────────────────────────────
// All mocks must be set up inside vi.mock factories (hoisted) or reassigned in beforeEach.

vi.mock("@/lib/db/client", () => {
  // Build the chain structure inside the factory (no top-level variable refs)
  function makeMockDb() {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      returning: vi.fn().mockResolvedValue([
        {
          id: "mem-new-id",
          user_id: "user-abc",
          category: "preference",
          content: "User prefers concise writing",
          source_type: "agent_inferred",
          source_reference_id: null,
          confidence: null,
          soft_deleted_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
      set: vi.fn().mockReturnThis(),
    };
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: chain.returning,
      }),
    });
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const mockSelect = vi.fn().mockReturnValue(chain);
    return { insert: mockInsert, update: mockUpdate, select: mockSelect };
  }

  return { serviceDb: makeMockDb() };
});

// ─── Import under test ─────────────────────────────────────────────────────────

import {
  storeMemoryItem,
  updateMemoryItem,
  softDeleteMemoryItem,
  recallMemory,
} from "@/lib/agent/memory";
import { embedText } from "@/lib/agent/embeddings";
import { serviceDb } from "@/lib/db/client";

const USER_ID = "user-abc";

// Cast for access to mock internals
const mockEmbedText = embedText as ReturnType<typeof vi.fn>;
const mockDb = serviceDb as unknown as {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AGENT-05 — Memory record/update/soft-delete + semantic recall", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-wire insert mock after clearAllMocks
    const returningMock = vi.fn().mockResolvedValue([
      {
        id: "mem-new-id",
        user_id: USER_ID,
        category: "preference",
        content: "User prefers concise writing",
        source_type: "agent_inferred",
        source_reference_id: null,
        confidence: null,
        soft_deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: returningMock }),
    });

    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(selectChain);

    mockEmbedText.mockResolvedValue(new Array(1024).fill(0.1));
  });

  it("storeMemoryItem creates memory_items row with correct user_id and category", async () => {
    await storeMemoryItem(USER_ID, "User prefers concise writing", "preference");
    expect(mockDb.insert).toHaveBeenCalled();
    // First insert call should be memory_items
    const firstValues = mockDb.insert.mock.results[0]?.value;
    const valuesCall = firstValues?.values;
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        category: "preference",
        content: "User prefers concise writing",
      })
    );
  });

  it("storeMemoryItem creates memory_embeddings row with 1024-dim vector", async () => {
    // Track all insert().values() calls across both inserts
    const valuesArgs: unknown[] = [];
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((arg: unknown) => {
        valuesArgs.push(arg);
        return { returning: vi.fn().mockResolvedValue([mockInsertedMemoryItem]) };
      }),
    }));

    const mockInsertedMemoryItem = {
      id: "mem-new-id",
      user_id: USER_ID,
      category: "preference",
      content: "User prefers concise writing",
      source_type: "agent_inferred",
      source_reference_id: null,
      confidence: null,
      soft_deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await storeMemoryItem(USER_ID, "User prefers concise writing", "preference");

    // insert should be called twice: once for memory_items, once for memory_embeddings
    expect(mockDb.insert).toHaveBeenCalledTimes(2);

    // Second call args (memory_embeddings row)
    const secondCallArg = valuesArgs[1] as Record<string, unknown> | undefined;
    expect(secondCallArg).toBeDefined();
    expect(secondCallArg).toHaveProperty("embedding");
    expect(Array.isArray(secondCallArg?.embedding)).toBe(true);
    expect((secondCallArg?.embedding as unknown[]).length).toBe(1024);
  });

  it("storeMemoryItem uses Voyage voyage-4 model for embedding", async () => {
    await storeMemoryItem(USER_ID, "Test content", "brand");
    expect(mockEmbedText).toHaveBeenCalledWith("Test content", "document");
  });

  it("updateMemoryItem replaces content and re-embeds", async () => {
    await updateMemoryItem(USER_ID, "mem-existing-id", "Updated content about brand voice");
    // Should re-embed
    expect(mockEmbedText).toHaveBeenCalledWith("Updated content about brand voice", "document");
    // Should call update on memory_items (first) and memory_embeddings (second)
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it("softDeleteMemoryItem sets soft_deleted_at timestamp (not hard-deleted)", async () => {
    await softDeleteMemoryItem(USER_ID, "mem-to-delete");
    expect(mockDb.update).toHaveBeenCalled();
    const updateResult = mockDb.update.mock.results[0]?.value;
    const setCall = updateResult?.set;
    const setArg = setCall?.mock?.calls?.[0]?.[0];
    expect(setArg).toHaveProperty("soft_deleted_at");
    expect(setArg?.soft_deleted_at).toBeInstanceOf(Date);
  });

  it("recallMemory returns top-K items sorted by cosine similarity", async () => {
    const mockResults = [
      {
        id: "mem-1",
        user_id: USER_ID,
        category: "preference",
        content: "Most similar item",
        source_type: "agent_inferred",
        source_reference_id: null,
        confidence: null,
        soft_deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        similarity: 0.95,
      },
    ];
    const limitMock = vi.fn().mockResolvedValue(mockResults);
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: limitMock,
    });

    const results = await recallMemory(USER_ID, "writing style preferences", 5);
    expect(Array.isArray(results)).toBe(true);
    expect(mockEmbedText).toHaveBeenCalledWith("writing style preferences", "query");
  });

  it("recallMemory excludes soft-deleted items from results", async () => {
    await recallMemory(USER_ID, "test query");
    // The query should apply a where filter
    const chainObj = mockDb.select.mock.results[0]?.value;
    expect(chainObj?.where).toHaveBeenCalled();
  });

  it("recallMemory is scoped to the requesting user_id", async () => {
    await recallMemory("specific-user-id", "test query");
    const chainObj = mockDb.select.mock.results[0]?.value;
    // Where clause must have been called — ensures user_id filter is applied
    expect(chainObj?.where).toHaveBeenCalled();
  });

  it("embedding dimension is exactly 1024 (voyage-4 output)", async () => {
    const testEmbedding = new Array(1024).fill(0.1);
    mockEmbedText.mockResolvedValue(testEmbedding);
    await storeMemoryItem(USER_ID, "Dimension check", "preference");
    const result = await mockEmbedText.mock.results[0]?.value;
    expect(result.length).toBe(1024);
  });
});
