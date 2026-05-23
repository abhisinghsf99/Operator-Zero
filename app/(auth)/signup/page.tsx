/**
 * app/(auth)/signup/page.tsx
 * Email + password sign-up — styled in the Operator Zero design language.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - All inputs have explicit <label htmlFor> associations.
 *   - Error messages associated via aria-describedby + role="alert".
 *   - Keyboard navigation: document order; submit via Enter or button.
 */
"use client";

import { signUp } from "./actions";
import Link from "next/link";
import { useActionState, type CSSProperties } from "react";
import { Button } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
import { GoogleAuthButton, AuthDivider } from "@/components/auth/google-auth-button";

type SignUpState = { error: string } | null;

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

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState<SignUpState, FormData>(
    async (_prev: SignUpState, formData: FormData): Promise<SignUpState> => {
      return await signUp(formData);
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
          Create your account
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "var(--text-tertiary)" }}>
          Hand the day-to-day store operations to your agent.
        </p>

        {state?.error && (
          <div
            id="form-error"
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
              aria-describedby={state?.error ? "form-error" : undefined}
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
              autoComplete="new-password"
              required
              minLength={8}
              aria-describedby={state?.error ? "form-error" : undefined}
              placeholder="At least 8 characters"
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
            {isPending ? "Creating account…" : "Sign up"}
          </Button>
        </form>

        <AuthDivider />

        {/* New Google users have no onboarding_completed_at → routed to /onboarding */}
        <GoogleAuthButton label="Sign up with Google" next="/onboarding" />

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
          Already have an account?{" "}
          <Link
            href="/login"
            style={{ color: "var(--acc-chat-ink)", fontWeight: 500 }}
            className="hover:underline focus-visible:underline focus-visible:outline-none"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
