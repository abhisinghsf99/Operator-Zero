/**
 * app/app/approvals/layout.tsx
 * Approvals layout — wraps the approval inbox with mobile drill-down context.
 *
 * Desktop (md+):  380px list panel + flex-1 detail panel (two-pane side-by-side)
 * Mobile (<md):   list panel fills full width; when a detail is active, the detail
 *                 panel fills full width with a ← Back affordance (D-11, UX-01).
 *
 * The two-pane vs. drill-down behavior is controlled by the ApprovalsView client
 * component via CSS: on mobile the list hides when a detail is active
 * (data-mobile-view attribute drives the visibility classes).
 *
 * Focus management:
 *   - Navigating to detail: focus moves to the detail panel heading
 *   - Pressing Back: focus returns to the activating list row
 *
 * WCAG 2.1 AA:
 *   - Back button has aria-label="Back to approvals list"
 *   - Detail heading receives focus on open (managed in _list.tsx via ref)
 *   - Mobile parity: all actions (approve/reject/snooze/edit/bulk) work at 375px
 */
export default function ApprovalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
