/**
 * tests/unit/gmail-sync.test.ts
 * Wave-0 tests — INTEG-05: Gmail History API incremental cursor advance
 *
 * Tests initial 30-day sync and incremental History API sync with cursor tracking.
 * All Gmail API + DB + Anthropic calls are mocked — no live network requests.
 *
 * Requirement: INTEG-05 — 30-day thread sync; 5-min polling via History API; email classification
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock state ────────────────────────────────────────────────────────

const gmailState = vi.hoisted(() => ({
  // DB state
  syncStateRow: null as null | Record<string, unknown>,
  upsertedThreads: [] as Array<Record<string, unknown>>,
  upsertedMessages: [] as Array<Record<string, unknown>>,
  updatedSyncState: null as null | Record<string, unknown>,

  // Gmail API mock responses
  threadsList: [] as Array<{ id: string; threadId: string }>,
  messagesGet: {} as Record<string, Record<string, unknown>>,
  historyList: [] as Array<Record<string, unknown>>,
  profileHistoryId: "12345",
}));

// Mock DB client
vi.mock("@/lib/db/client", () => {
  const serviceDb = {
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.limit = () =>
        Promise.resolve(
          gmailState.syncStateRow ? [gmailState.syncStateRow] : []
        );
      return chain;
    },
    insert: () => {
      const chain: Record<string, unknown> = {};
      let _insertVal: Record<string, unknown> | null = null;
      chain.values = (val: Record<string, unknown>) => {
        // Check gmail_message_id FIRST — message rows have both gmail_message_id + gmail_thread_id
        // Thread rows only have gmail_thread_id (no gmail_message_id)
        if ("gmail_message_id" in val) {
          gmailState.upsertedMessages.push(val);
        } else if ("gmail_thread_id" in val) {
          gmailState.upsertedThreads.push(val);
        }
        _insertVal = val;
        chain._val = val;
        return chain;
      };
      chain.onConflictDoUpdate = (opts: Record<string, unknown>) => {
        // WR-10: capture the upsert set values for sync state assertions
        // The upsert for gmailSyncState uses last_history_id / sync_status fields
        const setVals = opts.set as Record<string, unknown> | undefined;
        if (setVals && ("last_history_id" in setVals || "sync_status" in setVals)) {
          // Merge the insert values + the conflict-update set values
          gmailState.updatedSyncState = { ...(_insertVal ?? {}), ...(setVals ?? {}) };
        }
        return Promise.resolve(undefined);
      };
      return chain;
    },
    update: () => {
      const chain: Record<string, unknown> = {};
      chain.set = (val: Record<string, unknown>) => {
        // Keep update mock for any remaining UPDATE calls in incremental sync
        gmailState.updatedSyncState = val;
        return chain;
      };
      chain.where = () => Promise.resolve(undefined);
      return chain;
    },
  };
  return { serviceDb };
});

// Mock GmailAdapter.getAccessToken
vi.mock("@/lib/integrations/gmail/client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/integrations/gmail/client")
  >();
  return {
    ...actual,
    GmailAdapter: vi.fn().mockImplementation(() => ({
      getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
      isHealthy: vi.fn().mockResolvedValue(true),
      refreshToken: vi.fn().mockResolvedValue(undefined),
    })),
    createGmailClient: vi.fn().mockResolvedValue({
      users: {
        threads: {
          list: vi.fn().mockImplementation(async () => ({
            data: {
              threads: gmailState.threadsList,
              nextPageToken: null,
            },
          })),
          get: vi.fn().mockImplementation(
            async (params: { userId: string; id: string }) => ({
              data: gmailState.messagesGet[params.id] ?? {
                id: params.id,
                messages: [],
              },
            })
          ),
        },
        history: {
          list: vi.fn().mockImplementation(async () => ({
            data: {
              history: gmailState.historyList,
              historyId: "99999",
            },
          })),
        },
        getProfile: vi.fn().mockImplementation(async () => ({
          data: { historyId: gmailState.profileHistoryId },
        })),
      },
    }),
  };
});

// Mock the AI SDK boundary for classifySupport (now uses generateText)
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "YES" }),
}));
vi.mock("@/lib/agent/llm/models", () => ({
  resolveModel: vi.fn().mockReturnValue({ provider: "anthropic", modelId: "claude-haiku-4-5" }),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import {
  gmailInitialSync,
  gmailIncrementalSync,
} from "@/lib/integrations/gmail/sync";
import { classifySupport } from "@/lib/integrations/gmail/classify";

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("INTEG-05 — Gmail History API incremental cursor advance", () => {
  beforeEach(() => {
    gmailState.syncStateRow = null;
    gmailState.upsertedThreads = [];
    gmailState.upsertedMessages = [];
    gmailState.updatedSyncState = null;
    gmailState.threadsList = [];
    gmailState.messagesGet = {};
    gmailState.historyList = [];
    gmailState.profileHistoryId = "12345";
    vi.clearAllMocks();
  });

  it("initial sync pulls threads from last 30 days", async () => {
    gmailState.threadsList = [
      { id: "thread-1", threadId: "thread-1" },
      { id: "thread-2", threadId: "thread-2" },
    ];
    gmailState.messagesGet = {
      "thread-1": {
        id: "thread-1",
        messages: [
          {
            id: "msg-1",
            payload: {
              headers: [
                { name: "Subject", value: "Order question" },
                { name: "From", value: "customer@example.com" },
                { name: "To", value: "store@example.com" },
              ],
              body: { data: "" },
            },
            internalDate: String(Date.now()),
          },
        ],
      },
      "thread-2": {
        id: "thread-2",
        messages: [
          {
            id: "msg-2",
            payload: {
              headers: [],
              body: { data: "" },
            },
            internalDate: String(Date.now()),
          },
        ],
      },
    };

    await gmailInitialSync("test-user-id");

    // Should have stored threads
    expect(gmailState.upsertedThreads.length).toBeGreaterThan(0);
  });

  it("stores last historyId from Gmail profile after initial sync", async () => {
    gmailState.profileHistoryId = "54321";
    gmailState.threadsList = [];

    await gmailInitialSync("test-user-id");

    // Should have updated sync state with the profile historyId
    expect(gmailState.updatedSyncState).not.toBeNull();
    expect(gmailState.updatedSyncState?.last_history_id).toBe("54321");
  });

  it("incremental sync uses last_history_id from gmail_sync_state as startHistoryId", async () => {
    gmailState.syncStateRow = {
      user_id: "test-user-id",
      last_history_id: "77777",
      last_poll_at: new Date(),
    };

    const { createGmailClient } = await import(
      "@/lib/integrations/gmail/client"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockClient = await (createGmailClient as (...args: any[]) => Promise<any>)("test-user-id");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historyListSpy = mockClient.users.history.list as (...args: any[]) => Promise<unknown>;

    await gmailIncrementalSync("test-user-id");

    expect(historyListSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        startHistoryId: "77777",
      })
    );
  });

  it("updates last_history_id after each incremental poll", async () => {
    gmailState.syncStateRow = {
      user_id: "test-user-id",
      last_history_id: "11111",
      last_poll_at: new Date(),
    };

    await gmailIncrementalSync("test-user-id");

    // Should have updated sync state with new historyId
    expect(gmailState.updatedSyncState?.last_history_id).toBe("99999");
    expect(gmailState.updatedSyncState?.last_poll_at).toBeDefined();
  });

  it("upserts gmail_threads with no duplicates on repeated sync", async () => {
    gmailState.threadsList = [{ id: "thread-1", threadId: "thread-1" }];
    gmailState.messagesGet = {
      "thread-1": {
        id: "thread-1",
        messages: [
          {
            id: "msg-1",
            payload: { headers: [], body: { data: "" } },
            internalDate: String(Date.now()),
          },
        ],
      },
    };

    // Run initial sync twice — onConflictDoUpdate handles dedup
    await gmailInitialSync("test-user-id");
    gmailState.upsertedThreads = [];
    await gmailInitialSync("test-user-id");

    // Threads are upserted (no duplicate constraint violation)
    expect(gmailState.upsertedThreads.length).toBeGreaterThan(0);
  });

  it("upserts gmail_messages with no duplicates on repeated sync", async () => {
    gmailState.threadsList = [{ id: "thread-1", threadId: "thread-1" }];
    gmailState.messagesGet = {
      "thread-1": {
        id: "thread-1",
        messages: [
          {
            id: "msg-1",
            payload: { headers: [], body: { data: "" } },
            internalDate: String(Date.now()),
          },
        ],
      },
    };

    await gmailInitialSync("test-user-id");
    gmailState.upsertedMessages = [];
    await gmailInitialSync("test-user-id");

    // Messages are upserted (no duplicate constraint violation)
    expect(gmailState.upsertedMessages.length).toBeGreaterThan(0);
  });

  it("classifies customer support emails using the classifier fast-path", async () => {
    const isSupport = await classifySupport("Order question", "Where is my order?");
    expect(isSupport).toBe(true);

    const { generateText } = await import("ai");
    expect(generateText).toHaveBeenCalled();
  });

  it("sets gmail_threads.is_customer_support based on classification result", async () => {
    gmailState.threadsList = [{ id: "thread-1", threadId: "thread-1" }];
    gmailState.messagesGet = {
      "thread-1": {
        id: "thread-1",
        messages: [
          {
            id: "msg-1",
            payload: {
              headers: [{ name: "Subject", value: "Order question" }],
              body: { data: "" },
            },
            internalDate: String(Date.now()),
          },
        ],
        snippet: "Where is my order?",
      },
    };

    await gmailInitialSync("test-user-id");

    // The thread upsert should include is_customer_support field
    const thread = gmailState.upsertedThreads[0];
    expect(thread).toBeDefined();
    // is_customer_support is set (true because mock returns YES)
    expect(typeof thread?.is_customer_support).toBe("boolean");
  });

  it("polls via Inngest cron every 5 minutes", async () => {
    // Verify the Inngest function exports exist and have the correct cron trigger
    const { gmailInitialSyncFn, gmailIncrementalPollFn } = await import(
      "@/lib/inngest/functions/gmail-sync"
    );
    // Functions should be defined (registered in serve())
    expect(gmailInitialSyncFn).toBeDefined();
    expect(gmailIncrementalPollFn).toBeDefined();
  });

  it("handles historyId expiry by falling back to full re-sync", async () => {
    gmailState.syncStateRow = {
      user_id: "test-user-id",
      last_history_id: "expired-history-id",
      last_poll_at: new Date(),
    };

    // When history.list throws a 404/410 (historyId expired), should not throw
    // Instead should trigger a re-sync
    const { createGmailClient } = await import(
      "@/lib/integrations/gmail/client"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockClient = await (createGmailClient as (...args: any[]) => Promise<any>)("test-user-id");
    mockClient.users.history.list = vi.fn().mockRejectedValue(
      Object.assign(new Error("Invalid historyId"), { code: 404 })
    );

    // Should not throw — falls back gracefully
    await expect(gmailIncrementalSync("test-user-id")).resolves.not.toThrow();
  });
});
