/**
 * tests/unit/memory.test.ts
 * Wave-0 RED scaffolds — Phase 4 Memory management requirements (SET-04)
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
 *
 * Each it() is a failing assertion (RED) — the 24h undo window behavior
 * is not yet surfaced in the Settings UI. Tests fail until 04-03 ships it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

vi.mock("@/lib/agent/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
}));

// ─── SET-04: Soft-delete + 24h undo window ───────────────────────────────────

describe("SET-04 — memory soft-delete + 24h undo window", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("softDeleteMemoryItem sets soft_deleted_at timestamp (not hard-delete)", async () => {
    // TODO(04-03): Phase 4 wires the Settings panel delete button to softDeleteMemoryItem.
    // softDeleteMemoryItem exists in lib/agent/memory.ts (Phase 2) but the Settings UI
    // that calls it + the Sonner undo toast are not yet built.
    // RED: assert the Settings-UI wiring — fails until 04-03 ships the Memory section UI.
    expect(true).toBe(false); // TODO(04-03): wire Settings Memory panel delete → softDeleteMemoryItem + undo toast
    // When wired from Settings UI:
    // await softDeleteMemoryItem("item-id-1", USER_ID);
    // expect(setArg.soft_deleted_at).toBeInstanceOf(Date);
    // expect(setArg.hard_deleted_at).toBeUndefined(); // soft only
  });

  it("recallMemory excludes soft-deleted items within the 24h undo window", async () => {
    // TODO(04-03): recallMemory must exclude ANY item with soft_deleted_at set,
    // including those soft-deleted within the last 24h (still reversible via undo toast).
    // Items in the undo window are "pending deletion" — not available for agent recall.
    const { recallMemory } = await import(
      "@/lib/agent/memory"
    ).catch(() => ({ recallMemory: null }));

    expect(recallMemory).not.toBeNull();

    // RED: assert exclusion behavior for items recently soft-deleted (within 24h window)
    // This is the critical Phase 4 requirement — the undo window must NOT expose
    // soft-deleted items to the agent even though they haven't been hard-deleted yet.
    expect(true).toBe(false); // TODO(04-03): replace with mocked query assertion verifying
    // the WHERE clause includes: soft_deleted_at IS NULL
    // even for items deleted within the last 24h.
  });

  it("undo within 24h window restores item — soft_deleted_at set back to null", async () => {
    // TODO(04-03): implement undoDeleteMemoryItem (or reuse updateMemoryItem) that
    // clears soft_deleted_at, making the item available for recall again.
    const { updateMemoryItem } = await import(
      "@/lib/agent/memory"
    ).catch(() => ({ updateMemoryItem: null }));

    expect(updateMemoryItem).not.toBeNull();
    // When the undo action is triggered from the Sonner toast (within 24h):
    // await updateMemoryItem("item-id-1", { soft_deleted_at: null });
    // — item should reappear in recallMemory results.
    expect(true).toBe(false); // TODO(04-03): wire undo action from Settings UI
  });
});
