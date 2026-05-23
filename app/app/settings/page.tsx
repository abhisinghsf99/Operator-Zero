/**
 * app/app/settings/page.tsx
 * Settings page — Server Component.
 *
 * Renders eight Settings sections:
 *   - Connections (SET-01, INTEG-06): Shopify + Gmail health badges
 *   - Brand Voice (SET-02): markdown editor + preview + encrypted save + regenerate-with-confirm
 *   - Autonomy Thresholds (SET-03): default level + curated per-action overrides (D-05/D-06)
 *   - Memory (SET-04): categorized items with inline edit/add/soft-delete + undo toast
 *   - Profile (SET-05): name, email, password, avatar
 *   - Sessions (AUTH-04/AUTH-05): active sessions list + revoke + sign-out-everywhere (D-10)
 *   - Notifications (SET-08): badge explainer + coming-soon placeholder (no functional toggles)
 *   - Danger Zone (SET-06/07): export data + delete account (typed confirm, run-gate, cancellable)
 *
 * SECURITY:
 *   T-2-08-04: Reads integration data via withUserRls (cross-user protection)
 *   T-2-08-05: Disconnect requires confirm dialog (enforced in ConnectionRow client component)
 *   T-4-03-01: getBrandVoice decrypts with legacy-plaintext fallback (A2)
 *   T-4-04-03: listSessions filtered by userId — no cross-user session exposure
 *   T-4-05-01: getLatestExport filtered by userId — no cross-user export exposure
 *   T-4-05-02: signed_url from user_exports (24h) — never a public object URL
 *
 * WCAG 2.1 AA:
 *   - Status badges have text labels (not color alone)
 *   - Confirm dialog is focus-trapped (Radix Dialog handles this)
 *   - Reconnect + Disconnect buttons have descriptive aria-labels
 *   - All interactive controls have focus-visible ring
 */
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { getIntegrationHealth } from "@/lib/integrations/health";
import { ConnectionsSection } from "@/app/app/settings/_connections";
import { BrandVoiceSection } from "@/app/app/settings/_brand-voice";
import { AutonomySection } from "@/app/app/settings/_autonomy";
import { MemorySection } from "@/app/app/settings/_memory";
import { ProfileSection } from "@/app/app/settings/_profile";
import { SessionsSection } from "@/app/app/settings/_sessions";
import { NotificationsSection } from "@/app/app/settings/_notifications";
import { DangerSection } from "@/app/app/settings/_danger";
import {
  getBrandVoice,
  getMemoryItems,
  getAutonomyThresholds,
  listSessions,
  getLatestExport,
} from "@/app/app/settings/actions";

export default async function SettingsPage() {
  // 1. Validate session (middleware already guards /app/*)
  const profile = await getOrCreateProfile();

  // 2. Gate on onboarding completion
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const userId = profile.user_id;

  // 3. Parallel data loads — integration health + brand voice + autonomy + memory + sessions + danger
  const [shopifyHealth, gmailHealth, brandVoice, autonomyThresholds, memoryItemsList, sessions, latestExport] =
    await Promise.all([
      getIntegrationHealth(userId, "shopify"),
      getIntegrationHealth(userId, "gmail"),
      getBrandVoice(userId),              // T-4-03-01: decrypt with legacy-plaintext fallback
      getAutonomyThresholds(userId),      // SET-03: default level + curated overrides
      getMemoryItems(userId),
      listSessions(userId),               // AUTH-04: non-revoked session rows (T-4-04-03)
      getLatestExport(userId),            // SET-06: most recent export job status (T-4-05-01/02)
    ]);

  const initialMarkdown = brandVoice?.profile_markdown ?? "";

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)]">
      {/* Page header */}
      <div className="border-b-[0.5px] border-[var(--border)] bg-[var(--bg)] px-10 py-7">
        <div className="mx-auto max-w-[800px]">
          <div className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            Settings
          </div>
          <h1 className="display mt-1 text-[36px] tracking-[-0.015em] text-[var(--text)]">
            Tune the operator.
          </h1>
          <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
            Connections, voice, autonomy, memory. Everything the agent uses to do its job.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[800px] px-10 py-8">
        {/* SET-01: Connections */}
        <ConnectionsSection
          shopifyHealth={shopifyHealth}
          gmailHealth={gmailHealth}
        />

        {/* SET-02: Brand Voice — markdown editor + encrypted save + regenerate-with-confirm */}
        <div className="mt-8">
          <BrandVoiceSection initialMarkdown={initialMarkdown} />
        </div>

        {/* SET-03: Autonomy Thresholds — default level + curated per-action overrides (D-05/D-06) */}
        <AutonomySection thresholds={autonomyThresholds} />

        {/* SET-04: Memory — categorized items with inline edit/add/soft-delete + undo */}
        <MemorySection items={memoryItemsList} />

        {/* SET-05: Profile — name, email, password, avatar */}
        <ProfileSection profile={profile} />

        {/* AUTH-04/05: Active Sessions — session list + revoke + sign-out-everywhere (D-10) */}
        <SessionsSection sessions={sessions} />

        {/* SET-08: Notifications — badge explainer + coming-soon placeholder (no functional toggles) */}
        <NotificationsSection />

        {/* SET-06/07: Danger Zone — export data + delete account (typed confirm, run-gate, 7d grace) */}
        <DangerSection
          latestExport={latestExport}
          deletionRequestedAt={profile.deletion_requested_at ?? null}
        />
      </div>
    </div>
  );
}
