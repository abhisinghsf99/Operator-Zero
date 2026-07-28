/**
 * tests/unit/write-tools-simulated.test.ts
 * WS4 — the four new Shopify mutation helpers (previously stub write tools)
 * must, on a sandbox (sentinel-token) connection, perform a real mirror write
 * BEFORE returning ok:true, and writeActivity must be called before that
 * mirror write (observability-first, WF-06).
 *
 * Mocking style follows tests/unit/shopify-mutations.test.ts: vi.doMock per
 * test + vi.resetModules() so each helper is re-imported fresh against its
 * own mocks.
 */
import { describe, it, expect, vi } from "vitest";

/**
 * Builds a mock serviceDb that:
 *   - select().from().where().limit() alternates between `beforeRow` (1st call)
 *     and `afterRow` (2nd+ call) — matching the before-read / after-re-read
 *     pattern every mutation helper follows.
 *   - insert() pushes "mirrorInsert" onto `callOrder` when invoked, then
 *     returns a chainable { values -> { onConflictDoUpdate } } stub.
 *   - update() is a no-op chain (used by backfillAfterState).
 */
function makeMockServiceDb(
  beforeRow: unknown,
  afterRow: unknown,
  callOrder: string[]
) {
  let selectCallCount = 0;
  const insertValuesSpy = vi.fn().mockReturnValue({
    onConflictDoUpdate: vi.fn().mockResolvedValue([]),
  });
  return {
    mockServiceDb: {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              selectCallCount++;
              const row = selectCallCount === 1 ? beforeRow : afterRow;
              return row ? [row] : [];
            }),
          }),
        }),
      })),
      insert: vi.fn().mockImplementation(() => {
        callOrder.push("mirrorInsert");
        return { values: insertValuesSpy };
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    },
    insertValuesSpy,
  };
}

function mockSchemaModules() {
  vi.doMock("@/lib/db/schema/shopify-mirror", () => ({
    shopifyProducts: { name: "shopify_products" },
    shopifyProductVariants: { name: "shopify_product_variants" },
    shopifyPages: { name: "shopify_pages" },
    shopifyRedirects: { name: "shopify_redirects" },
  }));
  vi.doMock("@/lib/db/schema", () => ({
    activityEntries: { name: "activity_entries" },
  }));
}

describe("WS4 — simulated Shopify write helpers perform real mirror writes", () => {
  it("updateProductImageAlt: simulated branch writes to shopify_products, writeActivity called first", async () => {
    vi.resetModules();
    const callOrder: string[] = [];
    vi.doMock("@/lib/workflows/activity", () => ({
      writeActivity: async () => {
        callOrder.push("writeActivity");
      },
    }));

    function MockAdapter() {}
    MockAdapter.prototype.isSimulated = async () => true;
    vi.doMock("@/lib/integrations/shopify/client", () => ({ ShopifyAdapter: MockAdapter }));

    const { mockServiceDb, insertValuesSpy } = makeMockServiceDb(
      { product_gid: "gid://shopify/Product/1", title: "Old", user_id: "user-1" },
      { product_gid: "gid://shopify/Product/1", title: "Old", user_id: "user-1" },
      callOrder
    );
    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    mockSchemaModules();

    const { updateProductImageAlt } = await import("@/lib/integrations/shopify/mutations");

    const result = await updateProductImageAlt("user-1", {
      product_gid: "gid://shopify/Product/1",
      image_id: "gid://shopify/MediaImage/1",
      alt_text: "A leather weekender bag",
    });

    expect(callOrder).toContain("writeActivity");
    expect(callOrder).toContain("mirrorInsert");
    expect(callOrder.indexOf("writeActivity")).toBeLessThan(callOrder.indexOf("mirrorInsert"));
    expect(insertValuesSpy).toHaveBeenCalled();
    expect(result.idempotency_key).toContain("user-1:update_image_alt:");
  });

  it("updateVariantPrice: simulated branch writes to shopify_product_variants, writeActivity called first", async () => {
    vi.resetModules();
    const callOrder: string[] = [];
    vi.doMock("@/lib/workflows/activity", () => ({
      writeActivity: async () => {
        callOrder.push("writeActivity");
      },
    }));

    function MockAdapter() {}
    MockAdapter.prototype.isSimulated = async () => true;
    vi.doMock("@/lib/integrations/shopify/client", () => ({ ShopifyAdapter: MockAdapter }));

    const { mockServiceDb, insertValuesSpy } = makeMockServiceDb(
      {
        variant_gid: "gid://shopify/ProductVariant/1",
        product_gid: "gid://shopify/Product/1",
        price: "19.99",
        inventory_qty: 5,
        user_id: "user-1",
      },
      {
        variant_gid: "gid://shopify/ProductVariant/1",
        product_gid: "gid://shopify/Product/1",
        price: "24.00",
        inventory_qty: 5,
        user_id: "user-1",
      },
      callOrder
    );
    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    mockSchemaModules();

    const { updateVariantPrice } = await import("@/lib/integrations/shopify/mutations");

    const result = await updateVariantPrice("user-1", {
      variant_gid: "gid://shopify/ProductVariant/1",
      price: 24,
    });

    expect(callOrder).toContain("writeActivity");
    expect(callOrder).toContain("mirrorInsert");
    expect(callOrder.indexOf("writeActivity")).toBeLessThan(callOrder.indexOf("mirrorInsert"));
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ price: "24.00" })
    );
    expect(result.after_state).toEqual(
      expect.objectContaining({ price: "24.00" })
    );
  });

  it("createRedirect: simulated branch writes to shopify_redirects, writeActivity called first", async () => {
    vi.resetModules();
    const callOrder: string[] = [];
    vi.doMock("@/lib/workflows/activity", () => ({
      writeActivity: async () => {
        callOrder.push("writeActivity");
      },
    }));

    function MockAdapter() {}
    MockAdapter.prototype.isSimulated = async () => true;
    vi.doMock("@/lib/integrations/shopify/client", () => ({ ShopifyAdapter: MockAdapter }));

    const { mockServiceDb, insertValuesSpy } = makeMockServiceDb(
      null,
      { redirect_id: "sandbox-abc", path: "/old-path", target: "/new-path", user_id: "user-1" },
      callOrder
    );
    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    mockSchemaModules();

    const { createRedirect } = await import("@/lib/integrations/shopify/mutations");

    const result = await createRedirect("user-1", {
      path: "/old-path",
      target: "/new-path",
    });

    expect(callOrder).toContain("writeActivity");
    expect(callOrder).toContain("mirrorInsert");
    expect(callOrder.indexOf("writeActivity")).toBeLessThan(callOrder.indexOf("mirrorInsert"));
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/old-path", target: "/new-path" })
    );
    expect(result.before_state).toBeNull();
    expect(result.after_state).toEqual(
      expect.objectContaining({ path: "/old-path", target: "/new-path" })
    );
  });

  it("updatePageContent: simulated branch writes to shopify_pages, writeActivity called first", async () => {
    vi.resetModules();
    const callOrder: string[] = [];
    vi.doMock("@/lib/workflows/activity", () => ({
      writeActivity: async () => {
        callOrder.push("writeActivity");
      },
    }));

    function MockAdapter() {}
    MockAdapter.prototype.isSimulated = async () => true;
    vi.doMock("@/lib/integrations/shopify/client", () => ({ ShopifyAdapter: MockAdapter }));

    const { mockServiceDb, insertValuesSpy } = makeMockServiceDb(
      { page_gid: "gid://shopify/Page/1", title: "Shipping", body_html: "<p>old</p>", user_id: "user-1" },
      { page_gid: "gid://shopify/Page/1", title: "Shipping", body_html: "<p>new</p>", user_id: "user-1" },
      callOrder
    );
    vi.doMock("@/lib/db/client", () => ({ serviceDb: mockServiceDb }));
    mockSchemaModules();

    const { updatePageContent } = await import("@/lib/integrations/shopify/mutations");

    const result = await updatePageContent("user-1", {
      page_gid: "gid://shopify/Page/1",
      body_html: "<p>new</p>",
    });

    expect(callOrder).toContain("writeActivity");
    expect(callOrder).toContain("mirrorInsert");
    expect(callOrder.indexOf("writeActivity")).toBeLessThan(callOrder.indexOf("mirrorInsert"));
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ body_html: "<p>new</p>" })
    );
    expect(result.after_state).toEqual(
      expect.objectContaining({ body_html: "<p>new</p>" })
    );
  });
});
