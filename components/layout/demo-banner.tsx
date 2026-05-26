/**
 * components/layout/demo-banner.tsx
 * Slim, non-dismissible demo notice strip shown at the top of /app/* when the
 * authenticated user is the seeded demo account.
 *
 * Server component (no interactivity needed).
 * Styled with design tokens — no Tailwind utilities for the strip itself.
 */

export function DemoBanner() {
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
      }}
    >
      Demo — you&apos;re viewing a portfolio demo of Operator Zero with sample data, not the live product.
    </div>
  );
}
