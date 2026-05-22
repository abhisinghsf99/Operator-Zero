/**
 * tests/unit/catalog-audit.test.ts
 * Wave-0 scaffold — ONBOARD-04 + ONBOARD-07: Catalog audit suggestions + empty store branch
 *
 * Tests that the catalog audit Inngest function returns ≥3 starter workflow
 * suggestions from mock product data, and that an empty store skips the audit
 * and suggests content/Q&A-only workflows.
 *
 * Requirements:
 *   ONBOARD-04 — Read-only catalog audit returns ≥3 starter suggestions
 *   ONBOARD-07 — Empty store skips catalog audit; suggests content/Q&A only
 */
import { describe, it, expect } from "vitest";

describe("ONBOARD-04 — Catalog audit yields ≥3 suggestions", () => {
  it.todo("returns at least 3 workflow suggestions from mock product data");

  it.todo("suggestions include at least one SEO-type workflow (meta title/description)");

  it.todo("suggestions are returned as JSON with name, description, and type fields");

  it.todo("audit queries shopify_products for meta_title IS NULL or body_html IS NULL");

  it.todo("suggestions are created as Draft L2 workflows with source='onboarding'");
});

describe("ONBOARD-07 — Empty store skips audit → content/Q&A only", () => {
  it.todo("when shopify_products count = 0, skips catalog audit step");

  it.todo("when store is empty, suggests 3 hardcoded content/Q&A workflows");

  it.todo("empty store suggestions do not include product SEO workflows");

  it.todo("empty store branch creates Draft L2 workflows just like non-empty branch");
});
