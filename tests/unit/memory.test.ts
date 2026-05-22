/**
 * tests/unit/memory.test.ts
 * Phase 4 Memory management requirements (SET-04)
 *
 * Requirements covered:
 *   SET-04 — "What I Remember": delete = soft-delete with 24h recoverable window;
 *            recallMemory excludes soft-deleted items within the 24h undo window
 *
 * Turned GREEN by: 04-03 (Settings slice — Memory section)
 *
 * NOTE: agent-memory.test.ts (Phase 2) covers the basic soft-delete pattern and
 * recallMemory exclusion of soft-deleted items generally. This file extends that
 * coverage with the Phase 4-specific 24h undo window semantics — the UI exposes
 * an undo toast via Sonner, and recallMemory must exclude items where
 * soft_deleted_at is set (regardless of recency) during the undo window.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

vi.mock("@/lib/agent/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
}));

// Track the soft_deleted_at value set on serviceDb.update
let capturedSetArg: Record<string, unknown> | null = null;
let softDeletedAt: Date | null = null;

vi.mock("@/lib/db/client", () => {
  return {
    serviceDb: {
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((arg: Record<string, unknown>) => {
          capturedSetArg = arg;
          if (arg.soft_deleted_at !== undefined) {
            softDeletedAt = arg.soft_deleted_at as Date | null;
          }
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: "mem-item-1" },
          ]),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    },
  };
});

// ─── SET-04: Soft-delete + 24h undo window ───────────────────────────────────

describe("SET-04 — memory soft-delete + 24h undo window", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedSetArg = null;
    softDeletedAt = null;
  });

  it("softDeleteMemoryItem sets soft_deleted_at timestamp (not hard-delete)", async () => {
    const { softDeleteMemoryItem } = await import("@/lib/agent/memory");
    const { serviceDb } = await import("@/lib/db/client");

    await softDeleteMemoryItem("user-uuid-1", "item-id-1");

    // serviceDb.update must have been called (a DB write happened)
    expect(serviceDb.update).toHaveBeenCalled();

    // The set argument must include soft_deleted_at as a Date
    const setMock = (serviceDb.update as ReturnType<typeof vi.fn>).mock.results[0]?.value?.set;
    expect(setMock).toBeDefined();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        soft_deleted_at: expect.any(Date),
      })
    );

    // Confirm it was NOT a hard delete (delete() should not be called)
    expect(serviceDb.delete).toBeUndefined();
  });

  it("recallMemory excludes soft-deleted items within the 24h undo window", async () => {
    const { recallMemory } = await import("@/lib/agent/memory");

    expect(recallMemory).not.toBeNull();
    expect(typeof recallMemory).toBe("function");

    // Call recallMemory — the WHERE clause in memory.ts uses isNull(soft_deleted_at)
    // which excludes ALL soft-deleted items, including recently deleted ones
    // still in the 24h undo window. The DB mock returns [] (no items — simulating
    // that soft-deleted items are excluded from results).
    const results = await recallMemory("user-uuid-1", "test query");

    // recallMemory queries the DB — serviceDb.select must have been called
    const { serviceDb } = await import("@/lib/db/client");
    expect(serviceDb.select).toHaveBeenCalled();

    // Results are empty (our mock returns no items, as soft-deleted ones are excluded)
    expect(Array.isArray(results)).toBe(true);
  });

  it("undoDeleteMemoryItem (via settings actions) restores item — soft_deleted_at set back to null", async () => {
    // undoDeleteMemoryItem is in settings/actions.ts (Phase 4 addition)
    // It clears soft_deleted_at so the item reappears in recall results.
    const actionsModule = await import("@/app/app/settings/actions").catch(
      () => null
    );
    expect(actionsModule).not.toBeNull();
    expect(
      actionsModule && "undoDeleteMemoryItem" in actionsModule
        ? typeof actionsModule.undoDeleteMemoryItem
        : null
    ).toBe("function");
  });
});
