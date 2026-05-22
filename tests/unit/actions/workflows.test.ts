/**
 * tests/unit/actions/workflows.test.ts
 * Unit tests for lib/actions/workflows.ts Server Actions.
 *
 * Focus:
 *   - runNow sends 'workflow.run_requested' with {userId, workflowId, triggerSource:'manual'}
 *   - runNow rejects when caller does not own the workflow (returns {error})
 *
 * Strategy: mock inngest.send + withUserRls + createClient to control the auth
 * and DB results without a live DB or Inngest instance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (hoisted so vi.mock factories can reference them) ──────────────────

const { mockInngestSend, mockGetClaims, mockWithUserRlsImpl } = vi.hoisted(() => ({
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
  mockGetClaims: vi.fn(),
  mockWithUserRlsImpl: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: mockInngestSend,
  },
}));

vi.mock("@/lib/auth/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getClaims: mockGetClaims,
    },
  })),
}));

// Control withUserRls behavior
vi.mock("@/lib/db/client", () => ({
  withUserRls: vi.fn((claims: unknown, fn: (tx: unknown) => Promise<unknown>) => mockWithUserRlsImpl(claims, fn)),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Import after mocking
import { runNow } from "@/lib/actions/workflows";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";
const FAKE_WORKFLOW_ID = "00000000-0000-0000-0000-000000000002";

const FAKE_CLAIMS = {
  sub: FAKE_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

function setupAuthenticatedUser() {
  mockGetClaims.mockResolvedValue({
    data: { claims: FAKE_CLAIMS },
    error: null,
  });
}

function setupWorkflowFound() {
  mockWithUserRlsImpl.mockImplementation(
    async (_claims: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      // Simulate tx that finds the workflow
      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: FAKE_WORKFLOW_ID }]),
            }),
          }),
        }),
      };
      return fn(mockTx);
    }
  );
}

function setupWorkflowNotFound() {
  mockWithUserRlsImpl.mockImplementation(
    async (_claims: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      // Simulate tx that returns no rows (workflow not owned by user)
      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // empty
            }),
          }),
        }),
      };
      return fn(mockTx);
    }
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runNow Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends 'workflow.run_requested' event with correct data shape on owned workflow", async () => {
    setupAuthenticatedUser();
    setupWorkflowFound();

    const result = await runNow(FAKE_WORKFLOW_ID);

    expect("error" in result).toBe(false);
    expect(result).toMatchObject({ success: true });

    expect(mockInngestSend).toHaveBeenCalledOnce();
    const sentEvent = mockInngestSend.mock.calls[0]![0];
    expect(sentEvent.name).toBe("workflow.run_requested");
    expect(sentEvent.data.userId).toBe(FAKE_USER_ID);
    expect(sentEvent.data.workflowId).toBe(FAKE_WORKFLOW_ID);
    expect(sentEvent.data.triggerSource).toBe("manual");
  });

  it("returns {error} and does NOT send Inngest event when workflow not owned", async () => {
    setupAuthenticatedUser();
    setupWorkflowNotFound();

    const result = await runNow(FAKE_WORKFLOW_ID);

    expect("error" in result).toBe(true);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("returns {error: 'Not authenticated'} when no claims (valid UUID, no session)", async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null });

    const result = await runNow(FAKE_WORKFLOW_ID);

    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Not authenticated/i);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("returns {error} for invalid workflowId (not a UUID)", async () => {
    setupAuthenticatedUser();

    const result = await runNow("not-a-uuid");

    expect("error" in result).toBe(true);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});
