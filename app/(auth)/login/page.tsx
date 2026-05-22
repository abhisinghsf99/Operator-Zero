/**
 * app/(auth)/login/page.tsx
 * Email + password sign-in form + Google OAuth button.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - All inputs have explicit <label htmlFor> associations.
 *   - Error messages announced via role="alert" + aria-live.
 *   - Keyboard navigation: tab order matches visual order; submit via Enter.
 *
 * The Google OAuth button is a Client Component (needs browser client for signInWithOAuth).
 * The email/password form uses the login Server Action.
 */
"use client";

import { login } from "./actions";
import { createBrowserClient } from "@/lib/auth/client";
import Link from "next/link";
import { useState, useActionState } from "react";

type LoginState = { error: string } | null;

/** Google OAuth trigger — client-side only. */
function GoogleSignInButton() {
  const [oauthError, setOauthError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setOauthError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // After Google consent, Supabase redirects to /auth/callback?next=/app/home.
        // The callback route performs the server-side code exchange.
        redirectTo: `${window.location.origin}/auth/callback?next=/app/home`,
      },
    });
    if (error) {
      // Surface the failure to the user instead of only logging it.
      setOauthError("Google sign-in failed. Please try again.");
    }
    // On success, the browser follows the OAuth redirect chain.
    // No client-side navigation needed here.
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {/* Google logo SVG (accessible — title provided via aria-label on button) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        <span>Sign in with Google</span>
      </button>
      {oauthError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
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
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">
          Sign in to Operator Zero
        </h1>

        {/* Error banner */}
        {state?.error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {state.error}
          </div>
        )}

        <form action={formAction} noValidate>
          {/* Email */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            aria-disabled={isPending}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <hr className="flex-1 border-gray-200" />
          <span className="text-xs text-gray-500">or</span>
          <hr className="flex-1 border-gray-200" />
        </div>

        {/* Google OAuth */}
        <GoogleSignInButton />

        <p className="mt-4 text-center text-sm text-gray-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
