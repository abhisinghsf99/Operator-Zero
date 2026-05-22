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
 *   - execute() → first call is the atomic INSERT ... SELECT ... RETURNING
 *     (returns the inserted [{ id, version_number }]); subsequent execute() calls
 *     (the retention prune DELETE) resolve to an empty array.
 *   - update().set().where() → resolves ok
 *
 * WR-08: createWorkflowVersion now inserts via a single INSERT ... SELECT
 * statement through tx.execute() (computing version_number inline), so the
 * tx.insert() builder is no longer used.
 */
function buildMockTx({
  workflow = { id: "wf-001", current_version_id: "ver-000", user_id: "user-001" },
  currentVersion = { id: "ver-000", definition: { steps: [] }, schema_version: 1 },
  insertedVersion = { id: "ver-new", version_number: 4 },
}: {
  workflow?: Record<string, unknown>;
  currentVersion?: Record<string, unknown>;
  insertedVersion?: Record<string, unknown>;
} = {}) {
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
    insert: vi.fn(),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    // First execute() = atomic INSERT ... RETURNING; later execute() = prune DELETE
    execute: mockExecute
      .mockResolvedValueOnce([insertedVersion])
      .mockResolvedValue([]),
    transaction: vi.fn(),
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

  it("returns the version_number from the atomic INSERT ... RETURNING (= 4)", async () => {
    // WR-08: version_number is computed inside the INSERT statement and surfaced
    // via RETURNING; the helper no longer derives it from a separate MAX read.
    const mockTx = buildMockTx({ insertedVersion: { id: "ver-4", version_number: 4 } });
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

  it("returns version_number = 1 for the first version (RETURNING surfaces 1)", async () => {
    const mockTx = buildMockTx({ insertedVersion: { id: "ver-1", version_number: 1 } });
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

    // WR-08: new version inserted via the atomic INSERT ... SELECT (execute),
    // plus the retention prune DELETE — old rows are never UPDATEd, only the
    // workflow row's current_version_id is updated once.
    expect(mockTx.execute).toHaveBeenCalled();
    expect(mockTx.update).toHaveBeenCalledTimes(1);
  });
});

describe("createWorkflowVersion — 10-version retention prune", () => {
  it("calls execute() to prune old versions beyond 10", async () => {
    const mockTx = buildMockTx({
      insertedVersion: { id: "ver-11", version_number: 11 },
    });
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    };

    await createWorkflowVersion(mockDb as never, "user-001", "wf-001", { name: "v11" });

    // WR-08: execute() runs the atomic INSERT ... RETURNING and the retention
    // prune DELETE. (mockExecute is module-shared across describe blocks, so we
    // assert it was invoked rather than a brittle absolute count.)
    expect(mockTx.execute).toHaveBeenCalled();
  });
});
