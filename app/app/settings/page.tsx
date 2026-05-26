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
 * Mobile drill-down (D-11, UX-01):
 *   SettingsShell handles mobile-first section navigation:
 *   - Mobile: section nav list → tap → full-screen section with ← Back affordance
 *   - Desktop: sidebar nav (240px) + content panel per design
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
import { ByokSection } from "@/app/app/settings/_byok";
import { BrandVoiceSection } from "@/app/app/settings/_brand-voice";
import { AutonomySection } from "@/app/app/settings/_autonomy";
import { MemorySection } from "@/app/app/settings/_memory";
import { ProfileSection } from "@/app/app/settings/_profile";
import { SessionsSection } from "@/app/app/settings/_sessions";
import { NotificationsSection } from "@/app/app/settings/_notifications";
import { DangerSection } from "@/app/app/settings/_danger";
import { SettingsShell } from "@/app/app/settings/_settings-shell";
import { SurfaceHeader } from "@/components/design/primitives";
import { isDemoUser } from "@/lib/auth/demo";
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

  // 4. Build section definitions for the SettingsShell (mobile drill-down + desktop sidebar)
  const sections = [
    {
      id: "connections",
      label: "Connections",
      icon: "Plus" as const,
      description: "Shopify and Gmail integration status",
      content: (
        <ConnectionsSection
          shopifyHealth={shopifyHealth}
          gmailHealth={gmailHealth}
        />
      ),
    },
    {
      id: "ai-provider",
      label: "AI Provider",
      icon: "Lock" as const,
      description: "Bring your own model key",
      content: <ByokSection isDemo={isDemoUser(profile.user_id)} />,
    },
    {
      id: "brand-voice",
      label: "Brand voice",
      icon: "Sparkles" as const,
      description: "Your store's tone, style, and voice profile",
      content: <BrandVoiceSection initialMarkdown={initialMarkdown} />,
    },
    {
      id: "autonomy",
      label: "Autonomy thresholds",
      icon: "Bolt" as const,
      description: "Trust levels and per-action overrides",
      content: <AutonomySection thresholds={autonomyThresholds} />,
    },
    {
      id: "memory",
      label: "What I remember",
      icon: "Brain" as const,
      description: "What the agent has learned and remembered",
      content: <MemorySection items={memoryItemsList} />,
    },
    {
      id: "profile",
      label: "Profile",
      icon: "Edit" as const,
      description: "Name, email, password, and avatar",
      content: <ProfileSection profile={profile} />,
    },
    {
      id: "sessions",
      label: "Sessions",
      icon: "Lock" as const,
      description: "Active sessions and device management",
      content: <SessionsSection sessions={sessions} />,
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: "Sparkles" as const,
      description: "How the agent surfaces updates",
      content: <NotificationsSection />,
    },
    {
      id: "danger",
      label: "Export & delete",
      icon: "Trash" as const,
      description: "Export data, delete account",
      content: (
        <DangerSection
          latestExport={latestExport}
          deletionRequestedAt={profile.deletion_requested_at ?? null}
        />
      ),
    },
  ];

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
      data-testid="settings-page"
    >
      {/* Page header — matches design SurfaceHeader */}
      <SurfaceHeader
        kicker="Settings"
        title="Tune the operator."
        subtitle="Connections, voice, autonomy, memory. Everything the agent uses to do its job — visible and yours to change."
        accent="activity"
      />

      {/* Content — SettingsShell handles desktop sidebar + mobile drill-down */}
      <SettingsShell sections={sections} />
    </div>
  );
}
