/**
 * app/(app)/layout.tsx
 * Protected app shell layout — Server Component.
 *
 * All routes inside (app)/ require authentication.
 * The middleware.ts root guard redirects unauthenticated requests to /login
 * BEFORE this layout ever renders — so we have defense-in-depth here.
 *
 * This layout provides a minimal authenticated shell.
 * Phase 2 will add the sidebar nav, workflow list, and persistent header.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Operator Zero",
  description: "Autonomous agent system for your Shopify store",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal authenticated shell — Phase 2 will add full nav */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">
            Operator Zero
          </span>
          <span className="text-xs text-gray-500">
            Walking Skeleton — Phase 1
          </span>
        </div>
      </header>

      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
