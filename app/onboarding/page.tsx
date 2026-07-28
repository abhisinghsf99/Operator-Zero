/**
 * app/onboarding/page.tsx
 * Inline 6-step onboarding wizard shell — Server Component.
 *
 * Renders within the app shell (NOT a modal). Step is read from ?step search
 * param, defaulting to user_profiles.onboarding_step (resume from last step).
 *
 * Steps:
 *   0 — Welcome
 *   1 — Connect Shopify (required gate)
 *   2 — Connect Gmail (skippable with warning)
 *   3 — Brand voice (3-question conversation)
 *   4 — Catalog audit + starter selection
 *   5 — Done
 *
 * SECURITY:
 *   - Middleware redirects unauthenticated /onboarding to /login (T-2-08-01)
 *   - Authenticated users with onboarding_completed_at set are redirected to /app/workflows
 *   - User ID comes from getClaims().sub — never from URL/query params
 *
 * WCAG 2.1 AA:
 *   - Progress rail has aria-current="step"
 *   - Skip to main content link
 */
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { getIntegrationHealth } from "@/lib/integrations/health";
import { getCatalogAuditSuggestions } from "@/lib/inngest/functions/catalog-audit";
import { ProgressRail, type ProgressStep } from "@/components/onboarding/progress-rail";
import { OnboardingWizard } from "@/app/onboarding/_wizard";
import { Icons } from "@/components/design/icons";

const STEPS: ProgressStep[] = [
  { key: "welcome", label: "Welcome" },
  { key: "shopify", label: "Connect Shopify" },
  { key: "gmail", label: "Connect Gmail" },
  { key: "voice", label: "Brand voice" },
  { key: "audit", label: "Catalog audit" },
  { key: "done", label: "All set" },
];

interface OnboardingPageProps {
  searchParams: Promise<{ step?: string }>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  // 1. Validate session + get/create profile (middleware has already checked auth)
  const profile = await getOrCreateProfile();

  // 2. If onboarding already completed, redirect to the Workflows surface (D-16)
  if (profile.onboarding_completed_at) {
    redirect("/app/workflows");
  }

  // 3. Resolve the current step
  const resolvedSearchParams = await searchParams;
  const stepParam = resolvedSearchParams?.step;
  const parsedStep = stepParam ? parseInt(stepParam, 10) : NaN;
  const stepFromUrl = !isNaN(parsedStep) && parsedStep >= 0 && parsedStep <= 5 ? parsedStep : null;
  // Resume from last saved step or URL step (whichever is more advanced)
  const savedStep = profile.onboarding_step ?? 0;
  const currentStep = stepFromUrl !== null ? stepFromUrl : savedStep;

  // 4. Pre-fetch integration health for step 1 & 2
  const userId = profile.user_id;
  const [shopifyHealth, gmailHealth] = await Promise.all([
    getIntegrationHealth(userId, "shopify"),
    getIntegrationHealth(userId, "gmail"),
  ]);

  // 5. Pre-fetch catalog audit suggestions for step 4
  const auditSuggestions = currentStep >= 4
    ? await getCatalogAuditSuggestions(userId)
    : [];

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      {/* Skip to main content (WCAG) */}
      <a
        href="#onboarding-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--r-sm)] focus:bg-[var(--bg-elevated)] focus:px-3 focus:py-2 focus:text-[13px] focus:text-[var(--text)]"
      >
        Skip to main content
      </a>

      {/* Top progress rail */}
      <div
        style={{
          padding: "20px 40px",
          borderBottom: "0.5px solid var(--border)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 720, margin: "0 auto" }}>
          {/* Logo mark + wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 18 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--text)",
                color: "var(--bg)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Icons.Logo size={13} aria-hidden={true} />
            </div>
            <span className="display" style={{ fontSize: 16, color: "var(--text)" }}>Operator Zero</span>
          </div>
          <ProgressRail steps={STEPS} currentStep={currentStep} />
        </div>
      </div>

      {/* Wizard body */}
      <main
        id="onboarding-main"
        className="flex flex-1 items-center justify-center overflow-auto px-10 py-10"
      >
        <div className="w-full max-w-[640px]">
          <OnboardingWizard
            initialStep={currentStep}
            shopifyConnected={shopifyHealth.status === "healthy" || shopifyHealth.status === "stale"}
            gmailConnected={gmailHealth.status === "healthy" || gmailHealth.status === "stale"}
            auditSuggestions={auditSuggestions}
          />
        </div>
      </main>
    </div>
  );
}
