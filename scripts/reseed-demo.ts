/**
 * scripts/reseed-demo.ts
 * One-shot: re-seed the shared demo account (env DEMO_USER_ID) with the
 * canonical Wanderbound dataset. Loads .env.local, then calls reseedDemo().
 *
 * Run: npx tsx scripts/reseed-demo.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local before importing anything that reads process.env at module init.
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) continue;
  const key = trimmed.slice(0, idx);
  if (!(key in process.env)) process.env[key] = trimmed.slice(idx + 1);
}

async function main() {
  const { reseedDemo } = await import("@/lib/demo/seed");
  const user = process.env.DEMO_USER_ID;
  if (!user) {
    console.error("DEMO_USER_ID not set — nothing to do.");
    process.exit(1);
  }
  console.log(`Reseeding demo account ${user.slice(0, 8)}…`);
  const t0 = Date.now();
  await reseedDemo();
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Reseed failed:", e);
  process.exit(1);
});
