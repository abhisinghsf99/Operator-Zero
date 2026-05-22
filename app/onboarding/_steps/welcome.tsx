"use client";

/**
 * app/onboarding/_steps/welcome.tsx
 * Step 0: Welcome screen.
 */
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--acc-workflow-bg)] text-[var(--acc-workflow-ink)]">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="flex flex-col gap-4">
        <h1 className="display text-[52px] leading-[1.05] tracking-[-0.02em] text-[var(--text)]">
          Hi. I'm <em>your operator.</em>
        </h1>
        <p className="mx-auto max-w-[520px] text-[16px] leading-[1.55] text-[var(--text-secondary)]">
          I run the day-to-day of your Shopify store. Drafting copy, replying to customers, watching inventory, polishing SEO. You stay in charge of what matters. I handle the rest.
        </p>
        <p className="mx-auto max-w-[460px] text-[14px] leading-[1.55] text-[var(--text-tertiary)]">
          Setup takes about 10 minutes. By the end, you'll have a working workflow running for you.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button
          variant="workflow"
          size="lg"
          onClick={onNext}
        >
          Let's begin
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="font-mono text-[11.5px] text-[var(--text-tertiary)]">
          About 10 min · 4 steps
        </span>
      </div>
    </div>
  );
}
