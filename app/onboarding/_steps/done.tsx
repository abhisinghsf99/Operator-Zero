"use client";

/**
 * app/onboarding/_steps/done.tsx
 * Step 5: Onboarding complete — "You have an operator."
 *
 * Calls completeOnboarding() Server Action which sets onboarding_completed_at
 * and redirects to /app/workflows — the default landing surface (D-16).
 */
import { useState } from "react";
import { Button } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
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
          background: "var(--success)",
          color: "white",
          display: "grid",
          placeItems: "center",
        }}
        aria-hidden="true"
      >
        <Icons.CheckDouble size={36} strokeWidth={1.8} />
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
        You have an operator.
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
        Three workflows are seeded as drafts. The first run is ready in your Approval Inbox.
        From here on out, the agent is working for you.
      </p>

      {error && (
        <p style={{ fontSize: 13, color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      <Button
        variant="primary"
        accent="workflow"
        size="lg"
        icon="ArrowRight"
        onClick={handleEnter}
        disabled={entering}
        aria-label={entering ? "Setting up your operator" : undefined}
      >
        {entering ? "Setting up…" : "Enter Operator Zero"}
      </Button>
    </div>
  );
}
