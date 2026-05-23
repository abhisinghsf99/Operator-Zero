/**
 * app/(auth)/login/page.tsx
 * Email + password sign-in + Google OAuth — styled in the Operator Zero design language.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - All inputs have explicit <label htmlFor> associations.
 *   - Error messages announced via role="alert" + aria-live.
 *   - Keyboard navigation: tab order matches visual order; submit via Enter.
 */
"use client";

import { login } from "./actions";
import { createBrowserClient } from "@/lib/auth/client";
import Link from "next/link";
import { useState, useActionState, type CSSProperties } from "react";
import { Button } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";

type LoginState = { error: string } | null;

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  fontSize: 14,
  color: "var(--text)",
  background: "var(--bg-subtle)",
  border: "0.5px solid var(--border-strong)",
  borderRadius: "var(--r-sm)",
  outline: "none",
  transition: "border-color 0.12s",
};

function fieldFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--acc-chat-ink)";
}
function fieldBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--border-strong)";
}

/** Google OAuth trigger — client-side only. */
function GoogleSignInButton() {
  const [oauthError, setOauthError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setOauthError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/app/home`,
      },
    });
    if (error) {
      setOauthError("Google sign-in failed. Please try again.");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        aria-label="Sign in with Google"
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
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-chat)] focus-visible:ring-offset-1"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        <span>Sign in with Google</span>
      </button>
      {oauthError && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>
          {oauthError}
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      return await login(formData);
    },
    null
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--bg-elevated)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: 32,
          boxShadow: "var(--shadow-md)",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "var(--text)",
              color: "var(--bg)",
            }}
            aria-hidden="true"
          >
            <Icons.Logo size={18} strokeWidth={1.4} />
          </div>
          <span className="display" style={{ fontSize: 20, color: "var(--text)" }}>
            Operator Zero
          </span>
        </div>

        <h1
          className="display"
          style={{ fontSize: 30, margin: "0 0 4px", color: "var(--text)", letterSpacing: "-0.02em" }}
        >
          Welcome back
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "var(--text-tertiary)" }}>
          Sign in to pick up where the agent left off.
        </p>

        {state?.error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: "var(--r-sm)",
              fontSize: 12.5,
              color: "var(--danger)",
              background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
              border: "0.5px solid color-mix(in oklch, var(--danger) 30%, transparent)",
            }}
          >
            {state.error}
          </div>
        )}

        <form action={formAction} noValidate>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="email" style={labelStyle}>
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              style={inputStyle}
              onFocus={fieldFocus}
              onBlur={fieldBlur}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="password" style={labelStyle}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Your password"
              style={inputStyle}
              onFocus={fieldFocus}
              onBlur={fieldBlur}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            accent="chat"
            size="lg"
            disabled={isPending}
            style={{ width: "100%" }}
          >
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
          <span style={{ flex: 1, height: 0.5, background: "var(--border)" }} />
          <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>or</span>
          <span style={{ flex: 1, height: 0.5, background: "var(--border)" }} />
        </div>

        <GoogleSignInButton />

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            style={{ color: "var(--acc-chat-ink)", fontWeight: 500 }}
            className="hover:underline focus-visible:underline focus-visible:outline-none"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
