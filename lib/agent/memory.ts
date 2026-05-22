/**
 * lib/agent/memory.ts
 * Durable agent memory — store, update, soft-delete, and semantically recall
 * memory items for a given user.
 *
 * Memory items are stored in the memory_items table with a corresponding
 * embedding in memory_embeddings (Voyage AI voyage-4, 1024 dimensions, HNSW index).
 *
 * Recall uses pgvector cosine similarity via Drizzle's cosineDistance helper.
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars.
 * SECURITY (T-2-05-04): every DB query filters by user_id (serviceDb bypasses RLS).
 *   Cross-user recall is prevented by the explicit user_id WHERE clause.
 * SECURITY: soft-deleted items are excluded from recall queries.
 *
 * Exports:
 *   storeMemoryItem(userId, content, category)    — insert + embed
 *   updateMemoryItem(userId, id, content)          — update content + re-embed
 *   softDeleteMemoryItem(userId, id)               — set soft_deleted_at
 *   recallMemory(userId, query, topK?)             — cosine recall, user-scoped
 */

import { serviceDb } from "@/lib/db/client";
import { memoryItems, memoryEmbeddings } from "@/lib/db/schema";
import { eq, and, isNull, cosineDistance, desc, sql } from "drizzle-orm";
import { embedText } from "./embeddings";
import type { SemanticRecallItem } from "./prompt";

// ─── Store ─────────────────────────────────────────────────────────────────────

/**
 * storeMemoryItem — insert a new memory item and its Voyage embedding.
 *
 * Inserts memory_items first (returns the new row's id), then inserts
 * memory_embeddings with the 1024-dim embedding.
 *
 * @param userId   — the authenticated user's UUID
 * @param content  — the text content to store
 * @param category — 'brand' | 'catalog' | 'policy' | 'preference' | 'decision_history'
 */
export async function storeMemoryItem(
  userId: string,
  content: string,
  category: string
): Promise<{ id: string }> {
  // 1. Embed first (fail fast before writing to DB)
  const embedding = await embedText(content, "document");

  // 2. Insert memory_items
  const [inserted] = await serviceDb
    .insert(memoryItems)
    .values({
      user_id: userId,
      category,
      content,
      source_type: "agent_inferred",
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to insert memory item");
  }

  // 3. Insert memory_embeddings with the Voyage vector
  await serviceDb.insert(memoryEmbeddings).values({
    user_id: userId,
    source_type: "memory_item",
    source_id: inserted.id,
    content,
    embedding,
  });

  return { id: inserted.id };
}

// ─── Update ────────────────────────────────────────────────────────────────────

/**
 * updateMemoryItem — replace content and re-embed.
 *
 * Updates the memory_items row (by id + user_id) and replaces the embedding
 * in memory_embeddings. Both are scoped to the user_id to prevent cross-user writes.
 *
 * @param userId  — the authenticated user's UUID
 * @param id      — the memory item UUID to update
 * @param content — new content string (will be re-embedded)
 */
export async function updateMemoryItem(
  userId: string,
  id: string,
  content: string
): Promise<void> {
  // 1. Re-embed new content
  const embedding = await embedText(content, "document");

  // 2. Update memory_items (scoped by user_id — T-2-05-04)
  await serviceDb
    .update(memoryItems)
    .set({ content, updated_at: new Date() })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.user_id, userId)));

  // 3. Update the embedding in memory_embeddings
  await serviceDb
    .update(memoryEmbeddings)
    .set({ content, embedding })
    .where(
      and(
        eq(memoryEmbeddings.source_id, id),
        eq(memoryEmbeddings.user_id, userId),
        eq(memoryEmbeddings.source_type, "memory_item")
      )
    );
}

// ─── Soft-delete ───────────────────────────────────────────────────────────────

/**
 * softDeleteMemoryItem — set soft_deleted_at on the memory item.
 *
 * The row is NOT hard-deleted. Recall queries exclude rows with a non-null
 * soft_deleted_at. Hard deletion happens in the nightly cleanup job.
 *
 * @param userId — the authenticated user's UUID
 * @param id     — the memory item UUID to soft-delete
 */
export async function softDeleteMemoryItem(
  userId: string,
  id: string
): Promise<void> {
  await serviceDb
    .update(memoryItems)
    .set({ soft_deleted_at: new Date() })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.user_id, userId)));
}

// ─── Recall ────────────────────────────────────────────────────────────────────

/**
 * recallMemory — semantic recall via pgvector HNSW cosine similarity.
 *
 * Embeds the query with Voyage (inputType="query"), then queries the
 * memory_embeddings HNSW index for the closest items. Joins to memory_items
 * to filter out soft-deleted rows and enforce user isolation.
 *
 * Returns items ordered by cosine similarity (most similar first).
 *
 * @param userId — the authenticated user's UUID (T-2-05-04: explicit filter)
 * @param query  — the search query text
 * @param topK   — number of results to return (default 5)
 */
export async function recallMemory(
  userId: string,
  query: string,
  topK = 5
): Promise<SemanticRecallItem[]> {
  // 1. Embed query (inputType="query" per Voyage recommendation)
  const queryVec = await embedText(query, "query");

  // 2. Query memory_embeddings HNSW index with cosine distance
  //    Join to memory_items to filter soft-deleted + enforce user_id
  //    cosineDistance returns 0 for identical, 2 for opposite — lower is better
  const results = await serviceDb
    .select({
      id: memoryItems.id,
      user_id: memoryItems.user_id,
      category: memoryItems.category,
      content: memoryItems.content,
      source_type: memoryItems.source_type,
      source_reference_id: memoryItems.source_reference_id,
      confidence: memoryItems.confidence,
      soft_deleted_at: memoryItems.soft_deleted_at,
      created_at: memoryItems.created_at,
      updated_at: memoryItems.updated_at,
      similarity: sql<number>`1 - (${cosineDistance(memoryEmbeddings.embedding, queryVec)})`,
    })
    .from(memoryEmbeddings)
    .where(
      and(
        eq(memoryEmbeddings.user_id, userId),
        eq(memoryEmbeddings.source_type, "memory_item"),
        // Join condition — only embeddings whose source memory item is not deleted
        eq(memoryItems.user_id, userId),
        isNull(memoryItems.soft_deleted_at)
      )
    )
    .orderBy(cosineDistance(memoryEmbeddings.embedding, queryVec))
    .limit(topK);

  return results;
}
