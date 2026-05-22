"use client";

/**
 * app/onboarding/_steps/connect-gmail.tsx
 * Step 2: Connect Gmail (skippable with explicit warning).
 *
 * Gmail is optional per ONBOARD-02. Shows a warning when skipping
 * that Q&A workflows won't work without Gmail.
 */
import { useState } from "react";
import { ConnectStep } from "@/components/onboarding/connect-step";
import { skipGmailStep } from "@/app/onboarding/actions";

interface ConnectGmailStepProps {
  /** Whether Gmail was already connected before entering this step */
  initiallyConnected: boolean;
  onNext: () => void;
}

export function ConnectGmailStep({ initiallyConnected, onNext }: ConnectGmailStepProps) {
  const [connected, setConnected] = useState(initiallyConnected);
  const [skipping, setSkipping] = useState(false);

  async function handleSkip() {
    setSkipping(true);
    // Persist that Gmail was skipped (advance step to 3)
    await skipGmailStep();
    setSkipping(false);
    onNext();
  }

  return (
    <ConnectStep
      kind="gmail"
      name="Gmail"
      description="For customer-support workflows. The agent reads incoming mail and drafts (or sends, with your level) replies."
      scope={[
        "Read inbox & threads",
        "Compose & save drafts",
        "Send as you (workflow-controlled)",
      ]}
      connected={connected}
      connectPath="/api/integrations/gmail/connect"
      onNext={onNext}
      onSkip={handleSkip}
      skippable={true}
    />
  );
}
