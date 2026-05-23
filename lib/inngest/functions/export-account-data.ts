/**
 * lib/inngest/functions/export-account-data.ts
 * Durable account data export job — SET-06, D-08.
 *
 * Triggered by: account.export_requested
 * Retries: 2 (each step individually checkpointed)
 *
 * Steps:
 *   1. assemble-bundle — query all user-owned tables → JSON bundle
 *   2. upload-to-storage — upload to PRIVATE "user-exports" bucket, create 24h signed URL
 *   3. notify-user — upsert user_exports row (status=ready, signed_url, object_path)
 *
 * SECURITY:
 *   T-4-05-01: every serviceDb query MUST filter by userId (serviceDb bypasses RLS)
 *   T-4-05-02: private bucket; signed URL only — never a public object URL
 *   D-08: export is per-user scoped — no other tenant's data is included
 *
 * OBSERVABILITY:
 *   WF-06: log structured event BEFORE external effect (Storage upload counts as external write)
 */

import { inngest } from "@/lib/inngest/client";
import { serviceDb } from "@/lib/db/client";
import {
  workflows,
  workflowVersions,
  workflowRuns,
  activityEntries,
  memoryItems,
  brandVoiceProfiles,
  userExports,
} from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { decryptToken } from "@/lib/integrations/crypto";
import { createClient } from "@supabase/supabase-js";

// ── Supabase Admin client (service role — bypasses RLS for Storage) ────────────

function getSupabaseAdmin() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── exportAccountData ────────────────────────────────────────────────────────

export const exportAccountData = inngest.createFunction(
  {
    id: "export-account-data",
    retries: 2,
    triggers: [{ event: "account.export_requested" }],
    // No concurrency key — one export at a time per user is enforced by the
    // gate in the Server Action (a pending export row signals the job is running).
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };

    // ── Step 1: assemble-bundle ────────────────────────────────────────────────
    // Query ALL user-owned tables filtered by userId.
    // serviceDb bypasses RLS — userId filter is MANDATORY (T-4-05-01).
    const bundle = await step.run("assemble-bundle", async () => {
      // Workflows
      const userWorkflows = await serviceDb
        .select()
        .from(workflows)
        .where(eq(workflows.user_id, userId))
        .orderBy(desc(workflows.updated_at));

      // Workflow versions — join through workflows to maintain user_id scoping
      // (workflowVersions has no user_id column — isolation via workflow FK)
      const userVersions = await serviceDb
        .select({ version: workflowVersions })
        .from(workflowVersions)
        .innerJoin(workflows, eq(workflowVersions.workflow_id, workflows.id))
        .where(eq(workflows.user_id, userId))
        .orderBy(desc(workflowVersions.created_at))
        .then((rows) => rows.map((r) => r.version));

      // Workflow runs
      const userRuns = await serviceDb
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.user_id, userId))
        .orderBy(desc(workflowRuns.started_at));

      // Activity entries
      const userActivity = await serviceDb
        .select()
        .from(activityEntries)
        .where(eq(activityEntries.user_id, userId))
        .orderBy(desc(activityEntries.occurred_at));

      // Memory items (non-deleted)
      const userMemory = await serviceDb
        .select()
        .from(memoryItems)
        .where(and(eq(memoryItems.user_id, userId), isNull(memoryItems.soft_deleted_at)));

      // Brand voice (decrypt for export — Sarah's own data)
      const [brandVoiceRow] = await serviceDb
        .select()
        .from(brandVoiceProfiles)
        .where(eq(brandVoiceProfiles.user_id, userId))
        .limit(1);

      let brandVoiceDecrypted: string | null = null;
      if (brandVoiceRow?.profile_markdown) {
        try {
          brandVoiceDecrypted = await decryptToken(brandVoiceRow.profile_markdown);
        } catch {
          // Legacy plaintext fallback (A2 / Pitfall 6)
          brandVoiceDecrypted = brandVoiceRow.profile_markdown;
        }
      }

      return {
        exportedAt: new Date().toISOString(),
        userId,
        workflows: userWorkflows,
        workflowVersions: userVersions,
        workflowRuns: userRuns,
        activity: userActivity,
        memory: userMemory,
        brandVoice: brandVoiceRow
          ? {
              tone_tags: brandVoiceRow.tone_tags,
              forbidden_phrases: brandVoiceRow.forbidden_phrases,
              profile_markdown: brandVoiceDecrypted,
            }
          : null,
      };
    });

    // ── Step 2: upload-to-storage ──────────────────────────────────────────────
    // OBSERVABILITY (WF-06): log before external effect (Storage write)
    console.log(
      JSON.stringify({
        level: "info",
        event: "account.export.started",
        userId,
        timestamp: new Date().toISOString(),
      })
    );

    const { signedUrl, objectPath } = await step.run(
      "upload-to-storage",
      async () => {
        const supabaseAdmin = getSupabaseAdmin();
        const ts = Date.now();
        const path = `exports/${userId}/${ts}-export.json`;
        const bytes = Buffer.from(JSON.stringify(bundle, null, 2));

        // Upload to PRIVATE "user-exports" bucket (T-4-05-02 — never public URL)
        const { error: uploadError } = await supabaseAdmin.storage
          .from("user-exports")
          .upload(path, bytes, { contentType: "application/json", upsert: true });

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        // Create 24h signed URL — the only download method (T-4-05-02)
        const { data: urlData, error: urlError } = await supabaseAdmin.storage
          .from("user-exports")
          .createSignedUrl(path, 60 * 60 * 24);

        if (urlError || !urlData?.signedUrl) {
          throw new Error(
            `Failed to create signed URL: ${urlError?.message ?? "unknown error"}`
          );
        }

        return { signedUrl: urlData.signedUrl, objectPath: path };
      }
    );

    // ── Step 3: notify-user ────────────────────────────────────────────────────
    // Upsert a user_exports row with status=ready, signed_url, object_path.
    // This is what the Settings UI polls to surface the download link (A5).
    //
    // WR-02: use onConflictDoUpdate keyed on user_id (UNIQUE constraint added
    // by migration 0008). Without this, onConflictDoNothing was a no-op (no
    // unique constraint), causing unbounded row accumulation on retries/re-exports.
    await step.run("notify-user", async () => {
      await serviceDb
        .insert(userExports)
        .values({
          user_id: userId,
          status: "ready",
          signed_url: signedUrl,
          object_path: objectPath,
          completed_at: new Date(),
        })
        .onConflictDoUpdate({
          target: userExports.user_id,  // requires UNIQUE(user_id) — see migration 0008
          set: {
            status: "ready",
            signed_url: signedUrl,
            object_path: objectPath,
            completed_at: new Date(),
          },
        });
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "account.export.completed",
        userId,
        objectPath,
        timestamp: new Date().toISOString(),
      })
    );

    return { signedUrl };
  }
);
