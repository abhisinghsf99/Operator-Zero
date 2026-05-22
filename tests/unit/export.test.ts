/**
 * tests/unit/export.test.ts
 * Wave-0 RED scaffolds — Phase 4 Export account data requirements
 *
 * Requirements covered:
 *   SET-06 — exportAccountData Inngest function returns signedUrl via mocked step.run
 *
 * Turned GREEN by: 04-04 (Sessions + Export + Purge slice)
 *
 * Each it() is a failing assertion (RED) — the Inngest function does not exist
 * yet. Tests fail until 04-04 creates lib/inngest/functions/export-account-data.ts.
 *
 * Pattern: mock step.run and Supabase Storage admin client; assert the function
 * returns a signed URL without making live network calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const USER_ID = "user-export-test-01";

// ─── SET-06: exportAccountData ────────────────────────────────────────────────

describe("SET-06 — exportAccountData", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exportAccountData returns signedUrl from mocked step.run (no live DB or Storage)", async () => {
    // TODO(04-04): create lib/inngest/functions/export-account-data.ts
    // exportAccountData must:
    //   1. step.run("assemble-bundle") — query all user-owned tables → JSON bundle
    //   2. step.run("upload-to-storage") — upload to "user-exports" bucket, create 24h signed URL
    //   3. step.run("notify-user") — write status row to user_exports table
    //   4. return { signedUrl }
    const { exportAccountData } = await import(
      "@/lib/inngest/functions/export-account-data"
    ).catch(() => ({ exportAccountData: null }));

    // RED: function does not exist yet
    expect(exportAccountData).not.toBeNull();
    // When implemented (with step.run mocked to return { signedUrl: "https://..." }):
    // const mockStep = {
    //   run: vi.fn()
    //     .mockResolvedValueOnce({ workflows: [], activity: [], memory: [], brandVoice: {} })
    //     .mockResolvedValueOnce({ signedUrl: "https://supabase.co/signed-url-test" })
    //     .mockResolvedValue(undefined),
    // };
    // const result = await exportAccountData.fn({ event: { data: { userId: USER_ID } }, step: mockStep });
    // expect(result).toHaveProperty("signedUrl");
    // expect(typeof result.signedUrl).toBe("string");
  });
});
