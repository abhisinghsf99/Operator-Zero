// lib/agent/embeddings.ts
// Source: https://platform.claude.com/docs/en/docs/build-with-claude/embeddings
// Pattern 6 (RESEARCH.md): Voyage AI embeddings wiring — server-only.
// SECURITY (T-1-03-02): VOYAGE_API_KEY is a server-only env var.
// Never add NEXT_PUBLIC_ prefix.
//
// DIMENSION NOTE (RESEARCH.md finding #2 / Pitfall 3):
// voyage-4 defaults to 1024 dimensions. Schema uses vector(1024) — NOT vector(1536).
//
// [Rule 1 - Bug] RESEARCH.md pattern used result.embeddings![0] but the VoyageAI SDK v0.2.1
// returns { data: [{ embedding: number[] }] } — fixed to use result.data?.[0]?.embedding.
import { VoyageAIClient } from "voyageai";

const voyage = new VoyageAIClient({
  // Read at runtime (server-only). Will throw if key is missing in production.
  apiKey: process.env.VOYAGE_API_KEY,
});

/**
 * Embed a single text string using Voyage AI's voyage-4 model.
 *
 * Returns a 1024-dimensional float vector.
 *
 * @param text - The text to embed
 * @param inputType - "document" for content to store; "query" for search queries
 */
export async function embedText(
  text: string,
  inputType: "query" | "document" = "document"
): Promise<number[]> {
  const result = await voyage.embed({
    input: text,
    model: "voyage-4",
    inputType,
  });
  const embedding = result.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("Voyage AI returned no embeddings");
  }
  return embedding;
}
