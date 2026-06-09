/**
 * app/app/layout.tsx
 * Protected app shell layout — async Server Component. Routes at /app/* require auth.
 *
 * The middleware.ts root guard redirects unauthenticated /app/* requests to
 * /login BEFORE this layout ever renders — defense-in-depth.
 *
 * Phase 2: Full nav chrome — desktop sidebar + mobile bottom-tabs.
 *
 * Demo mode: When the authenticated user is a demo identity — either the seeded
 * shared demo account OR a per-visitor anonymous sandbox — a slim non-dismissible
 * DemoBanner is rendered at the top of the shell (with variant-specific copy).
 * Non-demo users see the shell exactly as before.
 */
import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { DemoBanner } from "@/components/layout/demo-banner";
import { SandboxExitBeacon } from "@/components/layout/sandbox-exit-beacon";
import { createClient } from "@/lib/auth/server";
import { isSandboxClaims } from "@/lib/auth/demo";

export const metadata: Metadata = {
  title: "Operator Zero",
  description: "Autonomous agent system for your Shopify store",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  const isDemo = isSandboxClaims(claims);
  const isSandbox = (claims as { is_anonymous?: boolean } | null)?.is_anonymous === true;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg)]">
      {/* Demo banner — rendered for the shared demo account and every sandbox visitor */}
      {isDemo && <DemoBanner variant={isSandbox ? "sandbox" : "shared"} />}

      {/* Sandbox teardown beacon + heartbeat — only for anonymous sandbox visitors */}
      {isSandbox && <SandboxExitBeacon />}

      {/* Main shell row: Sidebar + content + BottomTabs */}
      <div className="flex flex-1 min-h-0">
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
    </div>
  );
}
