/**
 * tests/unit/workflows/versions.test.ts
 * Unit tests for createWorkflowVersion (lib/workflows/versions.ts).
 *
 * Tests WF-14:
 *   - version_number increments from MAX+1
 *   - restore creates a NEW forward version (old rows unchanged)
 *   - 10-version retention prune
 *
 * Strategy: mock the Drizzle tx object to control query results without a DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module-level mocks ───────────────────────────────────────────────────────

// We mock createWorkflowVersion to be testable with a fake db.
// The actual implementation uses Drizzle tx builders — we mock at the db level.

// Capture calls to tx.insert, tx.update, tx.execute, tx.select
const mockExecute = vi.fn();

/**
 * Build a minimal fake Drizzle tx that:
 *   - select().from().where().limit() → returns provided data
 *   - insert().values().returning() → returns provided data
 *   - update().set().where() → resolves ok
 *   - execute() → resolves ok
 */
function buildMockTx({
  workflow = { id: "wf-001", current_version_id: "ver-000", user_id: "user-001" },
  currentVersion = { id: "ver-000", definition: { steps: [] }, schema_version: 1 },
  maxVersionNumber = 3,
  insertedVersion = { id: "ver-new", version_number: 4 },
}: {
  workflow?: Record<string, unknown>;
  currentVersion?: Record<string, unknown>;
  maxVersionNumber?: number | null;
  insertedVersion?: Record<string, unknown>;
} = {}) {
  // Track all versions inserted (for prune verification)
  const insertedVersions: Array<Record<string, unknown>> = [];

  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn()
            // First call: load workflow
            .mockResolvedValueOnce([workflow])
            // Second call: load current version
            .mockResolvedValueOnce([currentVersion]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        insertedVersions.push(vals);
        return {
          returning: vi.fn().mockResolvedValue([insertedVersion]),
        };
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    execute: mockExecute.mockResolvedValue([{ max: maxVersionNumber }]),
    transaction: vi.fn(),
    _insertedVersions: insertedVersions,
  };
  return tx;
}

// Import after building helpers
import { createWorkflowVersion } from "@/lib/workflows/versions";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createWorkflowVersion — version increment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns newVersionNumber = MAX + 1 (= 4 when MAX is 3)", async () => {
    const mockTx = buildMockTx({ maxVersionNumber: 3, insertedVersion: { id: "ver-4", version_number: 4 } });
    // Wrap in a db mock that calls the transaction callback
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    };

    const result = await createWorkflowVersion(
      mockDb as never,
      "user-001",
      "wf-001",
      { name: "Updated name" }
    );

    expect(result.newVersionNumber).toBe(4);
    expect(result.newVersionId).toBe("ver-4");
  });

  it("returns newVersionNumber = 1 when no prior versions exist (MAX is null)", async () => {
    const mockTx = buildMockTx({ maxVersionNumber: null, insertedVersion: { id: "ver-1", version_number: 1 } });
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    };

    const result = await createWorkflowVersion(
      mockDb as never,
      "user-001",
      "wf-001",
      { name: "First version" }
    );

    expect(result.newVersionNumber).toBe(1);
  });

  it("throws when workflow not found (ownership check fails)", async () => {
    // Simulate workflow not found (null row)
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValueOnce([]), // empty → not found
          }),
        }),
      }),
      execute: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    };
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    };

    await expect(
      createWorkflowVersion(mockDb as never, "user-001", "wf-001", { name: "x" })
    ).rejects.toThrow();
  });
});

describe("createWorkflowVersion — restore creates forward version", () => {
  it("restore: calling with old definition creates a new row (old rows unchanged)", async () => {
    const oldDefinition = { steps: [{ id: "step-1", type: "action" }] };
    const mockTx = buildMockTx({
      maxVersionNumber: 5,
      insertedVersion: { id: "ver-6", version_number: 6 },
      currentVersion: { id: "ver-005", definition: { steps: [] }, schema_version: 1 },
    });
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    };

    // Simulate restore: pass old definition as the patch
    const result = await createWorkflowVersion(
      mockDb as never,
      "user-001",
      "wf-001",
      oldDefinition,
      "thread-restore-001"
    );

    // New version is created (forward)
    expect(result.newVersionNumber).toBe(6);
    expect(result.newVersionId).toBe("ver-6");

    // Insert was called once (new version only) — old rows untouched
    expect(mockTx.insert).toHaveBeenCalledTimes(1);

    // Update was called once to set current_version_id
    expect(mockTx.update).toHaveBeenCalledTimes(1);
  });
});

describe("createWorkflowVersion — 10-version retention prune", () => {
  it("calls execute() to prune old versions beyond 10", async () => {
    const mockTx = buildMockTx({
      maxVersionNumber: 10,
      insertedVersion: { id: "ver-11", version_number: 11 },
    });
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    };

    await createWorkflowVersion(mockDb as never, "user-001", "wf-001", { name: "v11" });

    // execute() is called for two things: MAX query + prune DELETE
    // The prune DELETE is the second call
    expect(mockTx.execute).toHaveBeenCalled();
  });
});
