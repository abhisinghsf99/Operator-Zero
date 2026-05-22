/**
 * app/app/layout.tsx
 * Protected app shell layout — Server Component. Routes at /app/* require auth.
 *
 * The middleware.ts root guard redirects unauthenticated /app/* requests to
 * /login BEFORE this layout ever renders — defense-in-depth.
 *
 * Phase 2: Full nav chrome — desktop sidebar + mobile bottom-tabs.
 */
import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomTabs } from "@/components/layout/bottom-tabs";

export const metadata: Metadata = {
  title: "Operator Zero",
  description: "Autonomous agent system for your Shopify store",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      {/* Desktop sidebar — hidden below md breakpoint */}
      <Sidebar />

      {/* Main content area */}
      <main
        id="main-content"
        className="flex-1 min-w-0 overflow-y-auto bg-[var(--bg)]
                   pb-[56px] md:pb-0"
        tabIndex={-1}
      >
        {children}
      </main>

      {/* Mobile bottom tabs — visible only below md breakpoint */}
      <BottomTabs />
    </div>
  );
}
