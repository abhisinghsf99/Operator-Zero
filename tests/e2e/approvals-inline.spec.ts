/**
 * tests/e2e/approvals-inline.spec.ts
 * Wave-0 RED scaffolds — Phase 4 Inline approval card requirements
 *
 * Requirements covered:
 *   APRV-04 — Full-fidelity inline approval cards in Conversation surface:
 *             approve/edit/reject/snooze without leaving the chat (D-01)
 *
 * Turned GREEN by: 04-02 (Approval Inbox slice — includes InlineApprovalCard)
 *
 * These tests are marked fixme (RED) until 04-02 ships the InlineApprovalCard component.
 */
import { test, expect } from "@playwright/test";

const HAS_LIVE_STACK = !!process.env["NEXT_PUBLIC_SUPABASE_URL"];

test.describe("APRV-04 — Inline approval card in Conversation", () => {
  // Marked fixme: RED until 04-02 ships InlineApprovalCard.

  test.fixme(
    "inline approval card is rendered in conversation when message.inline_block_type='approval_card'",
    async ({ page }) => {
      // TODO(04-02): InlineApprovalCard renders in _conversation_ surface (not Inbox)
      // message.inline_block_type = 'approval_card' triggers the card
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session + pending approval");
      await page.goto("/app/chat");
      await expect(page.getByTestId("inline-approval-card")).toBeVisible();
    }
  );

  test.fixme(
    "approving from inline card resolves the approval and updates the Inbox count",
    async ({ page }) => {
      // TODO(04-02): D-01 — approve/edit/reject/snooze without leaving Conversation
      // Approving in inline card must: DB update → approval.resolved event → revalidate
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session + pending approval");
      await page.goto("/app/chat");
      const inlineCard = page.getByTestId("inline-approval-card").first();
      await inlineCard.getByRole("button", { name: /approve/i }).click();
      await expect(inlineCard).not.toBeVisible(); // card dismissed after action
    }
  );

  test.fixme(
    "inline card edit action opens edit panel inline (D-01 — not bounce-to-chat)",
    async ({ page }) => {
      // TODO(04-02): D-01 — Edit = inline-editable preview inside the inline card
      test.skip(!HAS_LIVE_STACK, "Requires live stack + auth session + pending approval");
      await page.goto("/app/chat");
      const inlineCard = page.getByTestId("inline-approval-card").first();
      await inlineCard.getByRole("button", { name: /edit/i }).click();
      // Edit panel opens inline — NOT a navigation to a new route
      await expect(inlineCard.getByTestId("edit-preview")).toBeVisible();
      await expect(page).toHaveURL(/\/chat/); // still on chat, not redirected
    }
  );
});
