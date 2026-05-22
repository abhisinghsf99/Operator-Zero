/**
 * tests/unit/agent-memory.test.ts
 * Wave-0 scaffold — AGENT-05: Memory record/update/soft-delete + semantic recall
 *
 * Tests the agent memory lifecycle — recording, updating, soft-deleting memory items
 * and semantic recall via pgvector cosine similarity.
 *
 * Requirement: AGENT-05 — Agent records durable memory items silently with pgvector embeddings
 */
import { describe, it, expect } from "vitest";

describe("AGENT-05 — Memory record/update/soft-delete + semantic recall", () => {
  it.todo("storeMemoryItem creates memory_items row with correct user_id and category");

  it.todo("storeMemoryItem creates memory_embeddings row with 1024-dim vector");

  it.todo("storeMemoryItem uses Voyage voyage-4 model for embedding");

  it.todo("updateMemoryItem replaces content and re-embeds");

  it.todo("softDeleteMemoryItem sets soft_deleted_at timestamp (not hard-deleted)");

  it.todo("recallMemory returns top-K items sorted by cosine similarity");

  it.todo("recallMemory excludes soft-deleted items from results");

  it.todo("recallMemory is scoped to the requesting user_id");

  it.todo("embedding dimension is exactly 1024 (voyage-4 output)");
});
