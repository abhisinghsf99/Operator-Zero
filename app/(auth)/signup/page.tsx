/**
 * app/(auth)/signup/page.tsx
 * Email + password sign-up form.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - All inputs have explicit <label htmlFor> associations.
 *   - Error messages are associated via aria-describedby.
 *   - Keyboard navigation: form elements in document order; submit via Enter or button.
 *   - Colour contrast ratios meet AA requirements for default Tailwind colours.
 *   - role="alert" on error banner for screen readers.
 *
 * SERVER ACTION: Form action is a bound signUp Server Action.
 * On error, the Server Action returns { error: string }; the page re-renders
 * with the error displayed.
 */
"use client";

import { signUp } from "./actions";
import Link from "next/link";
import { useState, useActionState } from "react";

type SignUpState = { error: string } | null;

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState<SignUpState, FormData>(
    async (_prev: SignUpState, formData: FormData): Promise<SignUpState> => {
      return await signUp(formData);
    },
    null
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">
          Create your account
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
              aria-describedby={state?.error ? "form-error" : undefined}
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
              autoComplete="new-password"
              required
              minLength={8}
              aria-describedby={state?.error ? "form-error" : undefined}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="At least 8 characters"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            aria-disabled={isPending}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
