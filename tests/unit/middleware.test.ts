/**
 * tests/unit/middleware.test.ts
 * Route-guard unit tests for lib/auth/middleware.ts updateSession().
 *
 * Tests the three behaviors required by T-1-04-02:
 *   1. No claims + /app/home -> 307 redirect to /login
 *   2. Claims present + /app/home -> pass-through (non-redirect)
 *   3. Public path /login -> never redirected regardless of claims
 *
 * Strategy: mock @supabase/ssr createServerClient so that auth.getClaims()
 * returns controllable values. The actual middleware.ts is not tested here —
 * updateSession() from lib/auth/middleware.ts is the unit under test.
 *
 * Per RESEARCH.md Auth Pattern 2: getClaims() validates JWT signature.
 * These tests prove the branching logic; JWT signature validation is a
 * Supabase library concern (trusted).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Mock @supabase/ssr ───────────────────────────────────────────────────────

// We mock the module before importing the unit under test so the mock is in
// place when updateSession() calls createServerClient().

const mockGetClaims = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getClaims: mockGetClaims,
    },
  })),
}));

// Import after mocking.
import { updateSession } from "@/lib/auth/middleware";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal NextRequest fixture for a given pathname.
 */
function buildRequest(pathname: string): NextRequest {
  const url = `http://localhost:3000${pathname}`;
  return new NextRequest(url);
}

/**
 * Minimal claims payload — only sub is needed for auth presence check.
 */
const FAKE_CLAIMS = {
  sub: "test-user-id-00000000",
  aud: "authenticated",
  role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("updateSession — route guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no claims + /app/home -> redirects to /login (status 307)", async () => {
    // Arrange: getClaims returns null data (no session).
    mockGetClaims.mockResolvedValueOnce({ data: null, error: null });

    const request = buildRequest("/app/home");
    const response = await updateSession(request);

    // Assert: the response is a redirect.
    expect(response.status).toBe(307);
    const location = response.headers.get("Location");
    expect(location).toBeTruthy();
    expect(location).toMatch(/\/login$/);
  });

  it("no claims + /app/workflows -> redirects to /login (status 307)", async () => {
    // Arrange: getClaims returns null data (no session).
    mockGetClaims.mockResolvedValueOnce({ data: null, error: null });

    const request = buildRequest("/app/workflows");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("Location");
    expect(location).toMatch(/\/login$/);
  });

  it("claims present + /app/home -> pass-through (not a redirect)", async () => {
    // Arrange: getClaims returns valid claims.
    mockGetClaims.mockResolvedValueOnce({
      data: {
        claims: FAKE_CLAIMS,
        header: { alg: "RS256", typ: "JWT" },
        signature: new Uint8Array(0),
      },
      error: null,
    });

    const request = buildRequest("/app/home");
    const response = await updateSession(request);

    // Assert: not a redirect — should be 200 (NextResponse.next() default).
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("/login is never redirected (public path, no claims)", async () => {
    // Arrange: no claims.
    mockGetClaims.mockResolvedValueOnce({ data: null, error: null });

    const request = buildRequest("/login");
    const response = await updateSession(request);

    // /login is not under /app — should pass through.
    expect(response.status).toBe(200);
    // Must NOT redirect to /login (infinite loop guard).
    const location = response.headers.get("Location");
    expect(location).toBeNull();
  });

  it("/signup is never redirected (public path, no claims)", async () => {
    mockGetClaims.mockResolvedValueOnce({ data: null, error: null });

    const request = buildRequest("/signup");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("/login is never redirected even with claims present", async () => {
    // Arrange: valid claims.
    mockGetClaims.mockResolvedValueOnce({
      data: {
        claims: FAKE_CLAIMS,
        header: { alg: "RS256", typ: "JWT" },
        signature: new Uint8Array(0),
      },
      error: null,
    });

    const request = buildRequest("/login");
    const response = await updateSession(request);

    // Middleware does not redirect away from /login — that's the login page's job.
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });
});
