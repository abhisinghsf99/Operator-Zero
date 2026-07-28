/**
 * app/(auth)/login/page.tsx
 * Email + password sign-in + Google OAuth — styled in the Operator Zero design language.
 *
 * Demo CTA is the primary action at the top of the card; the existing email/password
 * form + Google sign-in remain fully functional and unchanged below it.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - All inputs have explicit <label htmlFor> associations.
 *   - Error messages announced via role="alert" + aria-live.
 *   - Keyboard navigation: tab order matches visual order; submit via Enter.
 */
"use client";

import { login, enterSandbox } from "./actions";
import Link from "next/link";
import { useActionState, useState, useTransition, type CSSProperties } from "react";
import { Button } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
import { GoogleAuthButton, AuthDivider } from "@/components/auth/google-auth-button";

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

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      return await login(formData);
    },
    null
  );

  const [isDemoPending, startTransition] = useTransition();
  const [demoError, setDemoError] = useState<string | null>(null);

  // Show whichever error is present (form error or demo error)
  const displayError = state?.error ?? demoError;

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

        {/* ── Demo CTA (primary path) ── */}
        <Button
          variant="primary"
          accent="chat"
          size="lg"
          disabled={isDemoPending}
          style={{ width: "100%" }}
          onClick={() => {
            setDemoError(null);
            startTransition(async () => {
              const res = await enterSandbox();
              if (res && "error" in res) setDemoError(res.error);
            });
          }}
        >
          {isDemoPending ? "Preparing your sandbox…" : "Try the live demo →"}
        </Button>

        {/* Demo disclaimer line */}
        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 12,
            color: "var(--text-tertiary)",
            textAlign: "center",
          }}
        >
          A private, hands-on sandbox of Operator Zero. Edit anything — your changes stay yours and reset when you leave.
        </p>

        {/* Divider separating demo from standard login */}
        <div style={{ marginTop: 20, marginBottom: 4 }}>
          <AuthDivider />
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

        {displayError && (
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
            {displayError}
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

        <AuthDivider />

        <GoogleAuthButton label="Sign in with Google" next="/app/home" />

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
