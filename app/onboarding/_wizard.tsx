"use client";

/**
 * app/onboarding/_wizard.tsx
 * Client-side wizard shell — manages step transitions and persists progress.
 *
 * The RSC page.tsx handles data fetching; this client component handles
 * step navigation and calls saveOnboardingStep() on each advance.
 */
import { useState, useTransition } from "react";
import { WelcomeStep } from "@/app/onboarding/_steps/welcome";
import { ConnectShopifyStep } from "@/app/onboarding/_steps/connect-shopify";
import { ConnectGmailStep } from "@/app/onboarding/_steps/connect-gmail";
import { BrandVoiceStep } from "@/app/onboarding/_steps/brand-voice";
import { CatalogAuditStep, type WorkflowSuggestion } from "@/app/onboarding/_steps/catalog-audit";
import { DoneStep } from "@/app/onboarding/_steps/done";
import { saveOnboardingStep } from "@/app/onboarding/actions";

interface OnboardingWizardProps {
  initialStep: number;
  shopifyConnected: boolean;
  gmailConnected: boolean;
  auditSuggestions: WorkflowSuggestion[];
}

export function OnboardingWizard({
  initialStep,
  shopifyConnected,
  gmailConnected,
  auditSuggestions,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(initialStep);
  const [isPending, startTransition] = useTransition();

  function advance(nextStep: number) {
    startTransition(async () => {
      await saveOnboardingStep(nextStep);
      setStep(nextStep);
      // Update URL without full navigation (preserves state)
      window.history.replaceState(null, "", `/onboarding?step=${nextStep}`);
    });
  }

  return (
    <div aria-live="polite" aria-atomic="false">
      {step === 0 && (
        <WelcomeStep onNext={() => advance(1)} />
      )}
      {step === 1 && (
        <ConnectShopifyStep
          initiallyConnected={shopifyConnected}
          onNext={() => advance(2)}
        />
      )}
      {step === 2 && (
        <ConnectGmailStep
          initiallyConnected={gmailConnected}
          onNext={() => advance(3)}
        />
      )}
      {step === 3 && (
        <BrandVoiceStep onNext={() => advance(4)} />
      )}
      {step === 4 && (
        <CatalogAuditStep
          suggestions={auditSuggestions}
          onNext={() => advance(5)}
        />
      )}
      {step === 5 && (
        <DoneStep />
      )}
    </div>
  );
}
