/**
 * tests/unit/chat-actions.test.ts
 * Unit tests for the new/changed app/app/chat/actions.ts Server Actions
 * (Plan 2, task 1, Part C): autoNameThreadIfDefault, reapStaleStreamingMessages,
 * saveWorkflowFromPlan's automationLevel override, and listMessages' approval
 * enrichment.
 *
 * Strategy: mock @/lib/db (withUserRls + serviceDb + table refs), @/lib/auth/server
 * (getClaims), and @/lib/activity/gid-titles.server (resolveGidTitles) — mirrors
 * the mocking style of tests/unit/actions/workflows.test.ts and
 * tests/integration/chat-stream.test.ts. No live DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (hoisted so vi.mock factories can reference them) ──────────────────

const { mockGetClaims, mockWithUserRlsImpl, mockServiceDbSelect } = vi.hoisted(() => ({
  mockGetClaims: vi.fn(),
  mockWithUserRlsImpl: vi.fn(),
  mockServiceDbSelect: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getClaims: mockGetClaims },
  })),
}));

vi.mock("@/lib/db", () => ({
  withUserRls: vi.fn((claims: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    mockWithUserRlsImpl(claims, fn)
  ),
  serviceDb: {
    select: mockServiceDbSelect,
  },
  threads: { id: "threads.id", title: "threads.title" },
  messages: {
    id: "messages.id",
    thread_id: "messages.thread_id",
    status: "messages.status",
    created_at: "messages.created_at",
    role: "messages.role",
    content: "messages.content",
    inline_block_type: "messages.inline_block_type",
    inline_block_payload: "messages.inline_block_payload",
    user_id: "messages.user_id",
  },
  workflows: { id: "workflows.id", user_id: "workflows.user_id" },
  workflowVersions: { id: "workflowVersions.id" },
  approvals: {
    id: "approvals.id",
    status: "approvals.status",
    reasoning_summary: "approvals.reasoning_summary",
    stakes: "approvals.stakes",
    action_type: "approvals.action_type",
    preview: "approvals.preview",
    user_id: "approvals.user_id",
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const original = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...original,
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val, op: "eq" })),
    desc: vi.fn((col: unknown) => ({ col, dir: "desc" })),
    and: vi.fn((...args: unknown[]) => ({ args, op: "and" })),
    isNull: vi.fn((col: unknown) => ({ col, op: "isNull" })),
    inArray: vi.fn((col: unknown, vals: unknown[]) => ({ col, vals, op: "inArray" })),
  };
});

vi.mock("@/lib/activity/gid-titles.server", () => ({
  resolveGidTitles: vi.fn().mockResolvedValue({}),
}));

// Import after mocking
import {
  autoNameThreadIfDefault,
  reapStaleStreamingMessages,
  saveWorkflowFromPlan,
  listMessages,
} from "@/app/app/chat/actions";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";
const FAKE_THREAD_ID = "00000000-0000-0000-0000-000000000002";
const FAKE_MESSAGE_ID = "00000000-0000-0000-0000-000000000003";
const FAKE_WORKFLOW_ID = "00000000-0000-0000-0000-000000000004";

const FAKE_CLAIMS = {
  sub: FAKE_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

function setupAuthenticatedUser() {
  mockGetClaims.mockResolvedValue({ data: { claims: FAKE_CLAIMS }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── autoNameThreadIfDefault (WS7.3) ────────────────────────────────────────

describe("autoNameThreadIfDefault", () => {
  it("renames a thread titled 'New conversation' from the first message", async () => {
    setupAuthenticatedUser();

    const updateSetMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: FAKE_THREAD_ID, title: "New conversation" }]),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: updateSetMock }),
    };
    mockWithUserRlsImpl.mockImplementation(
      async (_claims: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx)
    );

    const result = await autoNameThreadIfDefault(
      FAKE_THREAD_ID,
      "Audit my catalog for missing meta titles please"
    );

    expect(result).toEqual({ ok: true, renamed: true });
    expect(tx.update).toHaveBeenCalledOnce();
    expect(updateSetMock).toHaveBeenCalledWith({
      title: "Audit my catalog for missing meta titles…",
    });
  });

  it("renames a thread with a null title", async () => {
    setupAuthenticatedUser();

    const updateSetMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: FAKE_THREAD_ID, title: null }]),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: updateSetMock }),
    };
    mockWithUserRlsImpl.mockImplementation(
      async (_claims: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx)
    );

    const result = await autoNameThreadIfDefault(FAKE_THREAD_ID, "Hello there");
    expect(result).toEqual({ ok: true, renamed: true });
  });

  it("leaves any other title untouched", async () => {
    setupAuthenticatedUser();

    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: FAKE_THREAD_ID, title: "Q4 SEO audit" }]),
        }),
      }),
      update: vi.fn(),
    };
    mockWithUserRlsImpl.mockImplementation(
      async (_claims: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx)
    );

    const result = await autoNameThreadIfDefault(FAKE_THREAD_ID, "A brand new message");

    expect(result).toEqual({ ok: true, renamed: false });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns {error} for an invalid threadId, never throws", async () => {
    setupAuthenticatedUser();
    const result = await autoNameThreadIfDefault("not-a-uuid", "hello");
    expect("error" in result).toBe(true);
  });
});

// ─── reapStaleStreamingMessages (D-3, WS7.9) ────────────────────────────────

describe("reapStaleStreamingMessages", () => {
  it("issues the expected UPDATE and returns the number of rows touched", async () => {
    setupAuthenticatedUser();

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "m1" }, { id: "m2" }]),
      }),
    });
    const tx = { update: vi.fn().mockReturnValue({ set: setMock }) };
    mockWithUserRlsImpl.mockImplementation(
      async (_claims: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx)
    );

    const result = await reapStaleStreamingMessages(FAKE_THREAD_ID);

    expect(result).toBe(2);
    expect(tx.update).toHaveBeenCalledOnce();
    expect(setMock).toHaveBeenCalledWith({ status: "errored" });
  });

  it("never throws on a DB error — returns 0", async () => {
    setupAuthenticatedUser();
    mockWithUserRlsImpl.mockImplementation(async () => {
      throw new Error("connection reset");
    });

    const result = await reapStaleStreamingMessages(FAKE_THREAD_ID);
    expect(result).toBe(0);
  });

  it("returns 0 for an invalid threadId without calling the DB", async () => {
    setupAuthenticatedUser();
    const result = await reapStaleStreamingMessages("not-a-uuid");
    expect(result).toBe(0);
    expect(mockWithUserRlsImpl).not.toHaveBeenCalled();
  });
});

// ─── saveWorkflowFromPlan automationLevel (WS7.12 server half) ──────────────

describe("saveWorkflowFromPlan — automationLevel", () => {
  function setupSaveWorkflowMocks(payload: Record<string, unknown>) {
    const insertWorkflowValuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: FAKE_WORKFLOW_ID }]),
    });
    const insertVersionValuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "version-1" }]),
    });

    let call = 0;
    mockWithUserRlsImpl.mockImplementation(
      async (_claims: unknown, fn: (t: unknown) => Promise<unknown>) => {
        call += 1;
        if (call === 1) {
          // 1. select the message
          const tx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  {
                    id: FAKE_MESSAGE_ID,
                    inline_block_type: "workflow_plan",
                    inline_block_payload: payload,
                    user_id: FAKE_USER_ID,
                  },
                ]),
              }),
            }),
          };
          return fn(tx);
        }
        if (call === 2) {
          // 2. insert workflow row
          const tx = {
            insert: vi.fn().mockReturnValue({ values: insertWorkflowValuesMock }),
          };
          return fn(tx);
        }
        // 3. insert version + set current_version_id
        const tx = {
          insert: vi.fn().mockReturnValue({ values: insertVersionValuesMock }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
          }),
        };
        return fn(tx);
      }
    );

    return { insertWorkflowValuesMock };
  }

  it("honours an explicit automationLevel over the payload value", async () => {
    setupAuthenticatedUser();
    const { insertWorkflowValuesMock } = setupSaveWorkflowMocks({
      name: "Restock watcher",
      automation_level: "L1",
      steps: [],
    });

    const result = await saveWorkflowFromPlan(FAKE_MESSAGE_ID, "L3");

    expect("workflowId" in result).toBe(true);
    expect(insertWorkflowValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ automation_level: "L3" })
    );
  });

  it("falls back to the payload's automation_level when omitted", async () => {
    setupAuthenticatedUser();
    const { insertWorkflowValuesMock } = setupSaveWorkflowMocks({
      name: "Restock watcher",
      automation_level: "L1",
      steps: [],
    });

    const result = await saveWorkflowFromPlan(FAKE_MESSAGE_ID);

    expect("workflowId" in result).toBe(true);
    expect(insertWorkflowValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ automation_level: "L1" })
    );
  });

  it("falls back to 'L2' when neither an explicit level nor a payload value is present", async () => {
    setupAuthenticatedUser();
    const { insertWorkflowValuesMock } = setupSaveWorkflowMocks({
      name: "Restock watcher",
      steps: [],
    });

    const result = await saveWorkflowFromPlan(FAKE_MESSAGE_ID);

    expect("workflowId" in result).toBe(true);
    expect(insertWorkflowValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ automation_level: "L2" })
    );
  });
});

// ─── listMessages — approval enrichment (WS7.11) ────────────────────────────

describe("listMessages — approval_card enrichment", () => {
  it("merges the approval's live status/reasoning/risk into the payload", async () => {
    setupAuthenticatedUser();

    let call = 0;
    mockWithUserRlsImpl.mockImplementation(
      async (_claims: unknown, fn: (t: unknown) => Promise<unknown>) => {
        call += 1;
        if (call === 1) {
          // reapStaleStreamingMessages — no stale rows
          const tx = {
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
              }),
            }),
          };
          return fn(tx);
        }
        // main select
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([
                  {
                    id: "msg-1",
                    role: "assistant",
                    content: "Here's what I'd like to do:",
                    status: "complete",
                    inline_block_type: "approval_card",
                    inline_block_payload: {
                      approval_id: "approval-1",
                      action_type: "shopify_optimize_meta",
                      summary: "Update meta title",
                      risk: "med",
                    },
                    created_at: new Date(),
                  },
                ]),
              }),
            }),
          }),
        };
        return fn(tx);
      }
    );

    mockServiceDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: "approval-1",
            status: "approved",
            reasoning_summary: "The current title is under 30 characters.",
            stakes: "med",
            action_type: "shopify_optimize_meta",
            preview: { before: "Old title", after: "New title" },
          },
        ]),
      }),
    });

    const result = await listMessages(FAKE_THREAD_ID);

    expect("messages" in result).toBe(true);
    const msgs = (result as { messages: Array<{ inline_block_payload: unknown }> }).messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.inline_block_payload).toMatchObject({
      approval_id: "approval-1",
      status: "approved",
      reasoning: "The current title is under 30 characters.",
      risk: "med",
      action_type: "shopify_optimize_meta",
      preview: { before: "Old title", after: "New title" },
    });
  });

  it("leaves payloads without a matching approval row untouched", async () => {
    setupAuthenticatedUser();

    let call = 0;
    mockWithUserRlsImpl.mockImplementation(
      async (_claims: unknown, fn: (t: unknown) => Promise<unknown>) => {
        call += 1;
        if (call === 1) {
          const tx = {
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
              }),
            }),
          };
          return fn(tx);
        }
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([
                  {
                    id: "msg-1",
                    role: "assistant",
                    content: "Hello",
                    status: "complete",
                    inline_block_type: null,
                    inline_block_payload: null,
                    created_at: new Date(),
                  },
                ]),
              }),
            }),
          }),
        };
        return fn(tx);
      }
    );

    const result = await listMessages(FAKE_THREAD_ID);

    expect("messages" in result).toBe(true);
    // No approval_card messages present — serviceDb.select must not be queried.
    expect(mockServiceDbSelect).not.toHaveBeenCalled();
  });
});
