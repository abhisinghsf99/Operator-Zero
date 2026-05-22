/**
 * tests/unit/gmail-sync.test.ts
 * Wave-0 scaffold — INTEG-05: Gmail History API incremental cursor advance
 *
 * Tests initial 30-day sync and incremental History API sync with cursor tracking.
 *
 * Requirement: INTEG-05 — 30-day thread sync; 5-min polling via History API; email classification
 */
import { describe, it, expect } from "vitest";

describe("INTEG-05 — Gmail History API incremental cursor advance", () => {
  it.todo("initial sync pulls threads from last 30 days");

  it.todo("stores last historyId from Gmail profile after initial sync");

  it.todo("incremental sync uses last_history_id from gmail_sync_state as startHistoryId");

  it.todo("updates last_history_id after each incremental poll");

  it.todo("upserts gmail_threads with no duplicates on repeated sync");

  it.todo("upserts gmail_messages with no duplicates on repeated sync");

  it.todo("classifies customer support emails using Anthropic fast-path");

  it.todo("sets gmail_threads.is_customer_support based on classification result");

  it.todo("polls via Inngest cron every 5 minutes");

  it.todo("handles historyId expiry by falling back to full re-sync");
});
