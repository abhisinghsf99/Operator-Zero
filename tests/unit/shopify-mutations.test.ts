/**
 * tests/unit/shopify-mutations.test.ts
 * Wave-0 scaffold — INTEG-07: Idempotent Shopify write (pre-read → write → re-read)
 *
 * Tests that all Shopify write operations are idempotent via the
 * pre-read/write/re-read pattern with idempotency keys.
 *
 * Requirement: INTEG-07 — All Shopify writes idempotent, direct to Shopify, then re-read to update mirror
 */
import { describe, it, expect } from "vitest";

describe("INTEG-07 — Shopify idempotent write (pre-read → write → re-read)", () => {
  it.todo("reads before_state from mirror before writing to Shopify");

  it.todo("writes activity_entry BEFORE making the Shopify API call");

  it.todo("re-reads mirror after successful Shopify write to update local state");

  it.todo("uses idempotency key: userId:actionType:targetId:timestamp_bucket_15min");

  it.todo("does not duplicate writes if same idempotency key is submitted twice");

  it.todo("records after_state in activity_entry after successful write");

  it.todo("records error in activity_entry if Shopify API call fails");

  it.todo("is_revertable defaults to true for write operations");
});
