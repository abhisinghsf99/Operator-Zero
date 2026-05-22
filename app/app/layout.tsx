/**
 * app/app/layout.tsx
 * Protected app shell layout — Server Component. Routes at /app/* require auth.
 *
 * The middleware.ts root guard redirects unauthenticated /app/* requests to
 * /login BEFORE this layout ever renders — so we have defense-in-depth here.
 *
 * This layout provides a minimal authenticated shell (incl. sign-out).
 * Phase 2 will add the sidebar nav, workflow list, and persistent header.
 */
import type { Metadata } from "next";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Operator Zero",
  description: "Autonomous agent system for your Shopify store",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal authenticated shell — Phase 2 will add full nav */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-gray-900">
            Operator Zero
          </span>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-gray-500 sm:inline">
              Walking Skeleton — Phase 1
            </span>
            {/* Server-action sign-out — works without client JS. */}
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
