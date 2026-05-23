"use client";

/**
 * app/onboarding/_steps/welcome.tsx
 * Step 0: Welcome screen.
 */
import { Button } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div
      className="anim-pop"
      style={{
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22,
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "var(--acc-workflow-bg)",
          color: "var(--acc-workflow-ink)",
          display: "grid",
          placeItems: "center",
        }}
        aria-hidden="true"
      >
        <Icons.Logo size={36} />
      </div>

      <h1
        className="display"
        style={{
          fontSize: 52,
          margin: 0,
          color: "var(--text)",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
        }}
      >
        Hi. I&apos;m <em>your operator.</em>
      </h1>

      <p
        style={{
          margin: 0,
          fontSize: 16,
          color: "var(--text-secondary)",
          maxWidth: 520,
          lineHeight: 1.55,
        }}
      >
        I run the day-to-day of your Shopify store. Drafting copy, replying to customers, watching
        inventory, polishing SEO. You stay in charge of what matters. I handle the rest.
      </p>

      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: "var(--text-tertiary)",
          maxWidth: 460,
          lineHeight: 1.55,
        }}
      >
        Setup takes about 10 minutes. By the end, you&apos;ll have a working workflow running for you.
      </p>

      <Button variant="primary" accent="workflow" size="lg" icon="ArrowRight" onClick={onNext}>
        Let&apos;s begin
      </Button>

      <div
        style={{
          fontSize: 11.5,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        About 10 min · 4 steps
      </div>
    </div>
  );
}
