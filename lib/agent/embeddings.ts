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
//
// [Build fix] voyageai@0.2.1 ships a broken ESM build (dist/esm/extended/index.mjs uses
// extensionless / directory relative imports that Node's ESM loader and Next's bundler
// reject — ERR_UNSUPPORTED_DIR_IMPORT). Its CJS build is correct, so load that via
// createRequire. The `import type` below is erased at compile time (no static import for
// the bundler to follow); `voyageai` is also in next.config serverExternalPackages.
// This module is server-only.
import { createRequire } from "node:module";
import type { VoyageAIClient as VoyageAIClientCtor } from "voyageai";

const requireCjs = createRequire(import.meta.url);
const { VoyageAIClient } = requireCjs("voyageai") as {
  VoyageAIClient: typeof VoyageAIClientCtor;
};

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
