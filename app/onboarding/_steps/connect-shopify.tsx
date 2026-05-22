"use client";

/**
 * app/onboarding/_steps/connect-shopify.tsx
 * Step 1: Connect Shopify (required).
 *
 * Gates progression — user cannot advance without an active Shopify integration.
 * Checks the REAL integrations table on "Continue" via checkShopifyConnected().
 *
 * SECURITY: T-2-08-02 — Shopify gate checks real integrations row, not a client flag.
 */
import { useState } from "react";
import { ConnectStep } from "@/components/onboarding/connect-step";
import { checkShopifyConnected } from "@/app/onboarding/actions";

interface ConnectShopifyStepProps {
  /** Whether Shopify was already connected before entering this step */
  initiallyConnected: boolean;
  onNext: () => void;
}

export function ConnectShopifyStep({ initiallyConnected, onNext }: ConnectShopifyStepProps) {
  const [connected, setConnected] = useState(initiallyConnected);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleNext() {
    // Always re-check the DB before advancing — do not trust client state alone
    setChecking(true);
    setError(null);

    const result = await checkShopifyConnected();

    setChecking(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    if (!result.connected) {
      setError("Please connect Shopify before continuing.");
      return;
    }

    setConnected(true);
    onNext();
  }

  return (
    <div className="flex flex-col gap-4">
      <ConnectStep
        kind="shopify"
        name="Shopify"
        description="Required. Your agent reads catalog, orders, content, SEO fields, inventory."
        scope={[
          "Read & write products",
          "Read orders & customers",
          "Read & write content (pages, blogs)",
          "Read & write SEO fields",
          "Read inventory",
        ]}
        connected={connected}
        connectPath="/api/integrations/shopify/connect"
        onNext={handleNext}
        skippable={false}
      />
      {checking && (
        <p className="text-[13px] text-[var(--text-tertiary)]" aria-live="polite">
          Checking connection…
        </p>
      )}
      {error && (
        <p className="text-[13px] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
