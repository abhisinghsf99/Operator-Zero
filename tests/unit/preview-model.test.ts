/**
 * tests/unit/preview-model.test.ts
 * Coverage for buildPreviewModel (pure discriminated-union builder) and sanitizeHtml.
 *
 * No DB/LLM mocks needed — both functions are pure.
 * Tests mirror every branch in the <behavior> spec from the PLAN.
 */

import { describe, it, expect } from "vitest";
import { buildPreviewModel } from "@/lib/approvals/preview-model";
import { sanitizeHtml } from "@/lib/html/sanitize";

// ─── sanitizeHtml ─────────────────────────────────────────────────────────────

describe("sanitizeHtml", () => {
  it("strips a <script>alert(1)</script> payload", () => {
    const result = sanitizeHtml('<p>hello</p><script>alert(1)</script>');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<p>hello</p>");
  });

  it("strips an onerror= event-handler attribute", () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
  });

  it("strips a javascript: URL", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("strips <style> blocks", () => {
    const result = sanitizeHtml('<p>ok</p><style>body{color:red}</style>');
    expect(result).not.toContain("<style");
    expect(result).toContain("<p>ok</p>");
  });

  it("strips <iframe> blocks", () => {
    const result = sanitizeHtml('<p>ok</p><iframe src="evil.com"></iframe>');
    expect(result).not.toContain("<iframe");
  });

  it("strips markdown code fences", () => {
    const result = sanitizeHtml('```html\n<p>hi</p>\n```');
    expect(result).not.toContain("```");
  });

  it("returns clean passthrough HTML untouched", () => {
    const clean = '<h2>Great</h2><ul><li>One</li></ul>';
    const result = sanitizeHtml(clean);
    expect(result).toBe(clean);
  });
});

// ─── buildPreviewModel ────────────────────────────────────────────────────────

describe("buildPreviewModel", () => {
  // Null / empty → kind:'empty'
  describe("empty inputs → kind:'empty'", () => {
    it("null → { kind:'empty' }", () => {
      expect(buildPreviewModel(null)).toEqual({ kind: "empty" });
    });

    it("undefined → { kind:'empty' }", () => {
      expect(buildPreviewModel(undefined)).toEqual({ kind: "empty" });
    });

    it("empty object {} → { kind:'empty' }", () => {
      expect(buildPreviewModel({})).toEqual({ kind: "empty" });
    });
  });

  // Scalar string → kind:'text'
  describe("scalar string → kind:'text'", () => {
    it("string → { kind:'text', text:'...' }", () => {
      const model = buildPreviewModel("just a string");
      expect(model).toEqual({ kind: "text", text: "just a string" });
    });
  });

  // kind='email' — explicit kind prop
  describe("email detection", () => {
    it("{ kind:'email', to, subject, body } → kind:'email'", () => {
      const model = buildPreviewModel({ kind: "email", to: "a@b.com", subject: "Hi", body: "Hello" });
      expect(model.kind).toBe("email");
    });

    it("{ draft: string } → kind:'email'", () => {
      const model = buildPreviewModel({ draft: "Here is my reply", customer: "Alice", question: "Where is my order?" });
      expect(model.kind).toBe("email");
      if (model.kind === "email") {
        expect(model.draft).toBe("Here is my reply");
        expect(model.customer).toBe("Alice");
        expect(model.question).toBe("Where is my order?");
      }
    });

    it("{ to, subject, body } (no kind) → kind:'email'", () => {
      const model = buildPreviewModel({ to: "x@y.com", subject: "Re: test", body: "Hello there" });
      expect(model.kind).toBe("email");
    });
  });

  // kind='diff' — content-diff
  describe("diff detection", () => {
    it("{ kind:'content-diff' } → { kind:'diff' }", () => {
      const model = buildPreviewModel({ kind: "content-diff", before: "old text", after: "new text" });
      expect(model.kind).toBe("diff");
      if (model.kind === "diff") {
        expect(model.before).toBe("old text");
        expect(model.after).toBe("new text");
      }
    });

    it("{ before:'old', after:'new' } (both strings, no kind) → { kind:'diff' }", () => {
      const model = buildPreviewModel({ before: "old", after: "new" });
      expect(model.kind).toBe("diff");
      if (model.kind === "diff") {
        expect(model.before).toBe("old");
        expect(model.after).toBe("new");
      }
    });
  });

  // kind='list'
  describe("list detection", () => {
    it("{ kind:'list', items } → { kind:'list', items }", () => {
      const items = [{ from: "a", to: "b" }];
      const model = buildPreviewModel({ kind: "list", items, showing: "3 items", window: "7 days" });
      expect(model.kind).toBe("list");
      if (model.kind === "list") {
        expect(model.items).toEqual(items);
        expect(model.showing).toBe("3 items");
        expect(model.window).toBe("7 days");
      }
    });

    it("{ items:[{from,to}] } (no kind) → { kind:'list' }", () => {
      const model = buildPreviewModel({ items: [{ from: "x", to: "y" }] });
      expect(model.kind).toBe("list");
    });
  });

  // kind='html' — optimize_description payload
  describe("html detection (body_html)", () => {
    it("{ product_gid, body_html } → { kind:'html', title:'Product description', html:'...' }", () => {
      const html = "<h2>Hi</h2><ul><li>a</li></ul>";
      const model = buildPreviewModel({ product_gid: "gid://shopify/Product/1", body_html: html });
      expect(model.kind).toBe("html");
      if (model.kind === "html") {
        expect(model.title).toBe("Product description");
        // raw html carried in model, NOT sanitized at model-build time
        expect(model.html).toBe(html);
      }
    });

    it("html value is carried raw (not sanitized) in the model", () => {
      const htmlWithScript = "<h2>Title</h2><script>evil()</script>";
      const model = buildPreviewModel({ product_gid: "gid://shopify/Product/1", body_html: htmlWithScript });
      expect(model.kind).toBe("html");
      if (model.kind === "html") {
        // Raw html stored; sanitizer is caller's responsibility at render time
        expect(model.html).toBe(htmlWithScript);
      }
    });
  });

  // kind='fields' — meta title/description
  describe("fields detection (meta)", () => {
    it("{ product_gid, meta_title, meta_description } → kind:'fields' with character counts", () => {
      const metaTitle = "Buy our great mug today";
      const metaDesc = "A long meta description for SEO purposes here.";
      const model = buildPreviewModel({ product_gid: "gid://shopify/Product/1", meta_title: metaTitle, meta_description: metaDesc });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        const titleField = model.fields.find(f => f.label === "Meta title");
        const descField = model.fields.find(f => f.label === "Meta description");
        expect(titleField).toBeDefined();
        expect(titleField?.value).toBe(metaTitle);
        expect(titleField?.count).toBe(`${metaTitle.length}/60`);
        expect(descField).toBeDefined();
        expect(descField?.value).toBe(metaDesc);
        expect(descField?.count).toBe(`${metaDesc.length}/160`);
      }
    });

    it("meta_description only → exactly one field", () => {
      const metaDesc = "Only description, no title.";
      const model = buildPreviewModel({ product_gid: "gid://shopify/Product/1", meta_description: metaDesc });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        expect(model.fields).toHaveLength(1);
        expect(model.fields[0]?.label).toBe("Meta description");
      }
    });
  });

  // kind='fields' — restock payload
  describe("fields detection (restock)", () => {
    it("{ variant_gid, inventory_qty: 5 } → kind:'fields' showing 'Restock to' + variant", () => {
      const model = buildPreviewModel({ variant_gid: "gid://shopify/ProductVariant/1", inventory_qty: 5 });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        const restockField = model.fields.find(f => f.label === "Restock to");
        expect(restockField).toBeDefined();
        expect(restockField?.value).toBe("5 units");
        const variantField = model.fields.find(f => f.label === "Variant");
        expect(variantField).toBeDefined();
      }
    });

    it("{ variant_gid, inventory_qty: 0 } → renders '0 units', NOT empty/falsy fallback", () => {
      const model = buildPreviewModel({ variant_gid: "gid://shopify/ProductVariant/1", inventory_qty: 0 });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        const restockField = model.fields.find(f => f.label === "Restock to");
        expect(restockField).toBeDefined();
        expect(restockField?.value).toBe("0 units");
      }
    });
  });

  // generic fallback
  describe("generic fallback → kind:'fields' (humanized labels)", () => {
    it("{ foo_bar:'baz', widget_count:3 } → humanized label/value rows", () => {
      const model = buildPreviewModel({ foo_bar: "baz", widget_count: 3 });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        const fooField = model.fields.find(f => f.label === "Foo bar");
        expect(fooField).toBeDefined();
        expect(fooField?.value).toBe("baz");
        const widgetField = model.fields.find(f => f.label === "Widget count");
        expect(widgetField).toBeDefined();
        expect(widgetField?.value).toBe("3");
      }
    });

    it("HTML-looking string field flagged with html:true and carries raw value", () => {
      const model = buildPreviewModel({ banner_html: '<p onclick="x">hi</p>' });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        const bannerField = model.fields.find(f => f.label === "Banner html");
        expect(bannerField).toBeDefined();
        expect(bannerField?.html).toBe(true);
        expect(bannerField?.value).toBe('<p onclick="x">hi</p>');
      }
    });

    it("NEVER emits JSON.stringify escaped-JSON output in any field value", () => {
      const model = buildPreviewModel({ foo_bar: "baz", widget_count: 3, banner_html: '<p>hi</p>' });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        for (const field of model.fields) {
          // No field value should look like indented JSON dump
          expect(field.value).not.toMatch(/\{[\s\S]*\n\s{2}/);
          expect(field.value).not.toContain('": "');
        }
      }
    });

    it("nested object value → compact one-line summary (not multi-line JSON)", () => {
      const nested = { a: 1, b: "x" };
      const model = buildPreviewModel({ config: nested, name: "test" });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        const configField = model.fields.find(f => f.label === "Config");
        expect(configField).toBeDefined();
        // Must not be indented JSON.stringify output
        expect(configField?.value).not.toContain('\n');
        // Must not contain JSON.stringify with indentation
        expect(configField?.value).not.toMatch(/\{\n\s{2}/);
      }
    });

    it("array value → compact one-line summary", () => {
      const model = buildPreviewModel({ tags: ["a", "b", "c"] });
      expect(model.kind).toBe("fields");
      if (model.kind === "fields") {
        const tagsField = model.fields.find(f => f.label === "Tags");
        expect(tagsField).toBeDefined();
        expect(tagsField?.value).not.toContain('\n');
      }
    });
  });
});
