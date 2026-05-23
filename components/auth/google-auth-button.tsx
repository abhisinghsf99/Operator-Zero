"use client";

/**
 * components/auth/google-auth-button.tsx
 * Shared Google OAuth button for the login + signup pages.
 *
 * Google OAuth is identity-provider sign-in: the same flow signs a returning user
 * in and provisions a new account on first use, so it backs both "Sign in with
 * Google" and "Sign up with Google" — only the label + post-auth `next` differ.
 *
 * Styled in the Operator Zero design language (token-driven, hairline border).
 * On success the browser follows the OAuth redirect chain; middleware then routes
 * new users (no onboarding_completed_at) to /onboarding.
 */
import { useState } from "react";
import { createBrowserClient } from "@/lib/auth/client";

export function GoogleAuthButton({
  label,
  next = "/app/workflows",
}: {
  label: string;
  /** Path to land on after the OAuth code exchange. */
  next?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    const supabase = createBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      setError("Google sign-in failed. Please try again.");
    }
    // On success the browser follows the OAuth redirect chain.
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleClick()}
        aria-label={label}
        style={{
          width: "100%",
          height: 40,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "var(--bg-elevated)",
          color: "var(--text)",
          border: "0.5px solid var(--border-strong)",
          borderRadius: "var(--r-sm)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.12s",
        }}
        className="hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-chat)] focus-visible:ring-offset-1"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        <span>{label}</span>
      </button>
      {error && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Visual "or" divider for the auth pages. */
export function AuthDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
      <span style={{ flex: 1, height: 0.5, background: "var(--border)" }} />
      <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>or</span>
      <span style={{ flex: 1, height: 0.5, background: "var(--border)" }} />
    </div>
  );
}
