/**
 * tests/unit/workflows/revert.test.ts
 * Unit tests for canRevert() pure function (lib/workflows/revert.ts).
 *
 * Covers all 5 failure modes + success path + already_reverted + is_revert_entry
 * per 03-VALIDATION.md and ACT-08 / D-11.
 *
 * canRevert is a pure function — no mocks needed.
 */
import { describe, it, expect, vi } from "vitest";
import { canRevert, REVERT_REASON_LABELS } from "@/lib/workflows/revert";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/** Minimal entry fixture — adjust fields per test */
function makeEntry(overrides: Partial<{
  action_type: string;
  occurred_at: Date;
  is_revertable: boolean;
  reverted_at: Date | null;
  before_state: Record<string, unknown> | null;
}> = {}) {
  return {
    action_type: "update_product",
    occurred_at: hoursAgo(1),
    is_revertable: true,
    reverted_at: null,
    before_state: { title: "Old title" },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("canRevert — failure modes", () => {
  it("returns already_reverted when reverted_at is set", () => {
    const entry = makeEntry({ reverted_at: new Date() });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("already_reverted");
  });

  it("returns is_revert_entry when is_revertable is false", () => {
    const entry = makeEntry({ is_revertable: false });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("is_revert_entry");
  });

  it("returns sent for send_email_draft action type", () => {
    const entry = makeEntry({ action_type: "send_email_draft" });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("sent");
  });

  it("returns sent for send_email_reply action type", () => {
    const entry = makeEntry({ action_type: "send_email_reply" });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("sent");
  });

  it("returns out_of_window for content edit older than 7 days", () => {
    const entry = makeEntry({
      action_type: "update_product",
      occurred_at: daysAgo(8),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("out_of_window");
  });

  it("returns out_of_window for structural edit older than 24 hours", () => {
    const entry = makeEntry({
      action_type: "update_price",
      occurred_at: hoursAgo(25),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("out_of_window");
  });

  it("returns out_of_window for inventory update older than 24 hours", () => {
    const entry = makeEntry({
      action_type: "update_inventory",
      occurred_at: hoursAgo(26),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("out_of_window");
  });

  it("returns manually_edited_since when shopifyUpdatedAt > occurred_at", () => {
    const occurred = hoursAgo(2);
    const shopifyUpdated = hoursAgo(1); // updated after the action
    const entry = makeEntry({ occurred_at: occurred });
    const result = canRevert(entry, shopifyUpdated);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("manually_edited_since");
  });
});

describe("canRevert — success path", () => {
  it("returns allowed:true for an in-window content edit with no shopify update", () => {
    const entry = makeEntry({
      action_type: "update_product",
      occurred_at: hoursAgo(12),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns allowed:true for an in-window structural edit (within 24h)", () => {
    const entry = makeEntry({
      action_type: "update_price",
      occurred_at: hoursAgo(23),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed:true for content edit when shopifyUpdatedAt is before occurred_at", () => {
    const occurred = hoursAgo(2);
    const shopifyUpdated = hoursAgo(5); // updated before the agent action
    const entry = makeEntry({ occurred_at: occurred });
    const result = canRevert(entry, shopifyUpdated);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed:true for unknown action_type (defaults to content/7d window)", () => {
    const entry = makeEntry({
      action_type: "some_unknown_action_type_xyz",
      occurred_at: hoursAgo(2),
    });
    const result = canRevert(entry);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed:true when shopifyUpdatedAt is null (no Shopify target)", () => {
    const entry = makeEntry({ occurred_at: hoursAgo(1) });
    const result = canRevert(entry, null);
    expect(result.allowed).toBe(true);
  });
});

describe("REVERT_REASON_LABELS", () => {
  it("has a label for every possible reason", () => {
    const reasons: Array<NonNullable<ReturnType<typeof canRevert>["reason"]>> = [
      "out_of_window",
      "sent",
      "manually_edited_since",
      "already_reverted",
      "is_revert_entry",
    ];
    for (const reason of reasons) {
      expect(REVERT_REASON_LABELS[reason]).toBeTruthy();
      expect(typeof REVERT_REASON_LABELS[reason]).toBe("string");
    }
  });
});

// ─── executeRevertEffect — WS10: revert restores before_state for real ───────
// executeRevertEffect dynamically imports lib/integrations/shopify/mutations
// inside the branches it needs — mock that module per-test via vi.doMock and
// re-import lib/workflows/revert fresh (vi.resetModules) so the dynamic import
// resolves against the mock.

describe("executeRevertEffect — restores before_state through the write path", () => {
  it("product content restore calls updateProduct with the before_state fields", async () => {
    vi.resetModules();
    const updateProductMock = vi.fn().mockResolvedValue({ idempotency_key: "k" });
    vi.doMock("@/lib/integrations/shopify/mutations", () => ({
      updateProduct: updateProductMock,
      updateInventory: vi.fn(),
      updateVariantPrice: vi.fn(),
      updatePageContent: vi.fn(),
    }));

    const { executeRevertEffect } = await import("@/lib/workflows/revert");

    await executeRevertEffect(
      {
        action_type: "update_product",
        target_type: "product",
        target_id: "gid://shopify/Product/1",
        before_state: { body_html: "<p>old</p>", meta_title: "Old title" },
      },
      "user-1"
    );

    expect(updateProductMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        product_gid: "gid://shopify/Product/1",
        body_html: "<p>old</p>",
        meta_title: "Old title",
      })
    );
  });

  it("inventory restore calls updateInventory", async () => {
    vi.resetModules();
    const updateInventoryMock = vi.fn().mockResolvedValue({ idempotency_key: "k" });
    vi.doMock("@/lib/integrations/shopify/mutations", () => ({
      updateProduct: vi.fn(),
      updateInventory: updateInventoryMock,
      updateVariantPrice: vi.fn(),
      updatePageContent: vi.fn(),
    }));

    const { executeRevertEffect } = await import("@/lib/workflows/revert");

    await executeRevertEffect(
      {
        action_type: "update_inventory",
        target_type: "product_variant",
        target_id: "gid://shopify/ProductVariant/1",
        before_state: { inventory_qty: 12 },
      },
      "user-1"
    );

    expect(updateInventoryMock).toHaveBeenCalledWith("user-1", {
      variant_gid: "gid://shopify/ProductVariant/1",
      inventory_qty: 12,
    });
  });

  it("price restore calls updateVariantPrice", async () => {
    vi.resetModules();
    const updateVariantPriceMock = vi.fn().mockResolvedValue({ idempotency_key: "k" });
    vi.doMock("@/lib/integrations/shopify/mutations", () => ({
      updateProduct: vi.fn(),
      updateInventory: vi.fn(),
      updateVariantPrice: updateVariantPriceMock,
      updatePageContent: vi.fn(),
    }));

    const { executeRevertEffect } = await import("@/lib/workflows/revert");

    await executeRevertEffect(
      {
        action_type: "update_price",
        target_type: "product_variant",
        target_id: "gid://shopify/ProductVariant/1",
        before_state: { price: "19.99" },
      },
      "user-1"
    );

    expect(updateVariantPriceMock).toHaveBeenCalledWith("user-1", {
      variant_gid: "gid://shopify/ProductVariant/1",
      price: 19.99,
    });
  });

  it("page content restore calls updatePageContent", async () => {
    vi.resetModules();
    const updatePageContentMock = vi.fn().mockResolvedValue({ idempotency_key: "k" });
    vi.doMock("@/lib/integrations/shopify/mutations", () => ({
      updateProduct: vi.fn(),
      updateInventory: vi.fn(),
      updateVariantPrice: vi.fn(),
      updatePageContent: updatePageContentMock,
    }));

    const { executeRevertEffect } = await import("@/lib/workflows/revert");

    await executeRevertEffect(
      {
        action_type: "update_page_content",
        target_type: "page",
        target_id: "gid://shopify/Page/1",
        before_state: { body_html: "<p>old</p>", title: "Shipping" },
      },
      "user-1"
    );

    expect(updatePageContentMock).toHaveBeenCalledWith("user-1", {
      page_gid: "gid://shopify/Page/1",
      body_html: "<p>old</p>",
      title: "Shipping",
    });
  });

  it("sent-email is a no-op — does not import the mutations module", async () => {
    vi.resetModules();
    const { executeRevertEffect } = await import("@/lib/workflows/revert");

    await expect(
      executeRevertEffect(
        {
          action_type: "send_email_reply",
          target_type: "email",
          target_id: "thread-1",
          before_state: null,
        },
        "user-1"
      )
    ).resolves.toBeUndefined();
  });

  it("empty before_state throws instead of a silent no-op", async () => {
    vi.resetModules();
    const { executeRevertEffect } = await import("@/lib/workflows/revert");

    await expect(
      executeRevertEffect(
        {
          action_type: "update_product",
          target_type: "product",
          target_id: "gid://shopify/Product/1",
          before_state: null,
        },
        "user-1"
      )
    ).rejects.toThrow(/no before_state recorded/);
  });

  it("unmatched action_type/before_state shape throws instead of a silent no-op", async () => {
    vi.resetModules();
    const { executeRevertEffect } = await import("@/lib/workflows/revert");

    await expect(
      executeRevertEffect(
        {
          action_type: "some_unhandled_action",
          target_type: "unknown",
          target_id: "id-1",
          before_state: { unrelated_field: 1 },
        },
        "user-1"
      )
    ).rejects.toThrow(/no matching revert path/);
  });
});
