"use client";

/**
 * app/onboarding/_steps/done.tsx
 * Step 5: Onboarding complete — "You have an operator."
 *
 * Calls completeOnboarding() Server Action which sets onboarding_completed_at
 * and redirects to /app/chat with a welcome seed.
 */
import { useState } from "react";
import { ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/app/onboarding/actions";

export function DoneStep() {
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnter() {
    setEntering(true);
    setError(null);

    const result = await completeOnboarding();

    // completeOnboarding() calls redirect() on success — this line only
    // reached on failure (redirect throws and is caught by Next.js)
    if (result && "error" in result) {
      setError(result.error);
      setEntering(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--success)] text-white">
        <CheckCircle className="h-9 w-9" strokeWidth={1.8} aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-4">
        <h1 className="display text-[52px] leading-[1.05] tracking-[-0.02em] text-[var(--text)]">
          You have an operator.
        </h1>
        <p className="mx-auto max-w-[520px] text-[16px] leading-[1.55] text-[var(--text-secondary)]">
          Three workflows are seeded as drafts. The first run is ready in your Approval Inbox. From here on out, the agent is working for you.
        </p>
      </div>

      {error && (
        <p className="text-[13px] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      <Button
        variant="workflow"
        size="lg"
        onClick={handleEnter}
        disabled={entering}
        aria-busy={entering}
      >
        {entering ? "Setting up…" : "Enter Operator Zero"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
