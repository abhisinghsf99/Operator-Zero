/**
 * app/app/settings/page.tsx
 * Settings page — Server Component.
 *
 * Renders Settings sections:
 *   - Connections (SET-01, INTEG-06): Shopify + Gmail health badges
 *   - Brand Voice (SET-02): markdown editor + preview + encrypted save + regenerate-with-confirm
 *   - Memory (SET-04): categorized items with inline edit/add/soft-delete + undo toast
 *   - Profile (SET-05): name, email, password, avatar [added in Task 3]
 *   - Notifications (SET-08): badge explainer + coming-soon [added in Task 3]
 *
 * SECURITY:
 *   T-2-08-04: Reads integration data via withUserRls (cross-user protection)
 *   T-2-08-05: Disconnect requires confirm dialog (enforced in ConnectionRow client component)
 *   T-4-03-01: getBrandVoice decrypts with legacy-plaintext fallback (A2)
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
import { BrandVoiceSection } from "@/app/app/settings/_brand-voice";
import { MemorySection } from "@/app/app/settings/_memory";
import { getBrandVoice, getMemoryItems } from "@/app/app/settings/actions";

export default async function SettingsPage() {
  // 1. Validate session (middleware already guards /app/*)
  const profile = await getOrCreateProfile();

  // 2. Gate on onboarding completion
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const userId = profile.user_id;

  // 3. Parallel data loads — integration health + brand voice + memory
  const [shopifyHealth, gmailHealth, brandVoice, memoryItemsList] = await Promise.all([
    getIntegrationHealth(userId, "shopify"),
    getIntegrationHealth(userId, "gmail"),
    getBrandVoice(userId),      // T-4-03-01: decrypt with legacy-plaintext fallback
    getMemoryItems(userId),
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

        {/* SET-04: Memory — categorized items with inline edit/add/soft-delete + undo */}
        <MemorySection items={memoryItemsList} />
      </div>
    </div>
  );
}
