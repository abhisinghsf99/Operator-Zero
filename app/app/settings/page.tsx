/**
 * app/app/settings/page.tsx
 * Settings page — Server Component.
 *
 * Renders the Connections section (SET-01, INTEG-06):
 *   - Shopify row: health badge (healthy/stale/needs_reconnect) + last_synced_at
 *   - Gmail row: health badge + last_synced_at
 *   - Reconnect button (re-initiates OAuth)
 *   - Disconnect button (opens confirm dialog, then calls disconnectIntegration)
 *
 * SECURITY:
 *   T-2-08-04: Reads integration data via withUserRls (cross-user protection)
 *   T-2-08-05: Disconnect requires confirm dialog (enforced in ConnectionRow client component)
 *
 * WCAG 2.1 AA:
 *   - Status badges have text labels (not color alone)
 *   - Confirm dialog is focus-trapped (Radix Dialog handles this)
 *   - Reconnect + Disconnect buttons have descriptive aria-labels
 */
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { getIntegrationHealth } from "@/lib/integrations/health";
import { ConnectionsSection } from "@/app/app/settings/_connections";

export default async function SettingsPage() {
  // 1. Validate session (middleware already guards /app/*)
  const profile = await getOrCreateProfile();

  // 2. Gate on onboarding completion
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const userId = profile.user_id;

  // 3. Load integration health for Shopify + Gmail (RLS via getIntegrationHealth)
  const [shopifyHealth, gmailHealth] = await Promise.all([
    getIntegrationHealth(userId, "shopify"),
    getIntegrationHealth(userId, "gmail"),
  ]);

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
        <ConnectionsSection
          shopifyHealth={shopifyHealth}
          gmailHealth={gmailHealth}
        />
      </div>
    </div>
  );
}
