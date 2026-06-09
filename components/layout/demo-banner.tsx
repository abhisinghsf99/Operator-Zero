/**
 * components/layout/demo-banner.tsx
 * Slim, non-dismissible demo notice strip shown at the top of /app/*.
 *
 * Two variants:
 *   - "shared"  — the seeded shared demo account (live, real Shopify store).
 *   - "sandbox" — a per-visitor anonymous sandbox: isolated, throwaway, resets
 *                 when the visitor leaves. This is the public demo path.
 *
 * Server component (no interactivity needed).
 * Styled with design tokens — no Tailwind utilities for the strip itself.
 */

export function DemoBanner({
  variant = "shared",
}: {
  variant?: "shared" | "sandbox";
}) {
  const message =
    variant === "sandbox"
      ? "Demo sandbox — your changes are private to this session and reset when you leave. Nothing here affects other visitors."
      : "Demo — a live portfolio demo of Operator Zero, connected to a real Shopify store.";

  return (
    <div
      role="note"
      aria-label="Demo notice"
      style={{
        width: "100%",
        height: 30,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--acc-chat-bg)",
        color: "var(--text-secondary)",
        fontSize: 12,
        borderBottom: "0.5px solid var(--border)",
        padding: "0 12px",
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}
