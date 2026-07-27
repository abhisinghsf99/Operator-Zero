/**
 * scripts/gemini-smoke.ts
 * Live smoke test: resolve each agent role under MODEL_PROFILE=google and run
 * a minimal generateText against the real Gemini API.
 *
 * Run: npx tsx scripts/gemini-smoke.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) continue;
  const key = trimmed.slice(0, idx);
  if (!(key in process.env)) process.env[key] = trimmed.slice(idx + 1);
}
process.env.MODEL_PROFILE = "google";

async function main() {
  const { generateText } = await import("ai");
  const { resolveModel, resolveModelChoice } = await import("@/lib/agent/llm/models");

  for (const role of ["ORCHESTRATOR", "CLASSIFIER", "AUDIT", "DRAFTER"] as const) {
    const choice = resolveModelChoice(role);
    const t0 = Date.now();
    try {
      const res = await generateText({
        model: resolveModel(role),
        prompt: "Reply with exactly: OK",
      });
      console.log(
        `${role.padEnd(12)} ${choice.provider}:${choice.modelId.padEnd(24)} → "${res.text.trim().slice(0, 40)}" (${Date.now() - t0}ms, ${res.usage?.totalTokens ?? "?"} tok)`
      );
    } catch (e) {
      console.error(`${role.padEnd(12)} ${choice.provider}:${choice.modelId} FAILED: ${String(e).slice(0, 300)}`);
      process.exitCode = 1;
    }
  }
}

main();
