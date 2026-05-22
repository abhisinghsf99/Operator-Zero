/**
 * tests/unit/sessions.test.ts
 * Wave-0 RED scaffolds — Phase 4 Session management requirements
 *
 * Requirements covered:
 *   AUTH-04 — revokeSession sets revoked_at on the target session row
 *   AUTH-05 — signOutEverywhere marks ALL session rows revoked for the user
 *
 * Turned GREEN by: 04-04 (Sessions + Export + Purge slice)
 *
 * Each it() is a failing assertion (RED) — the Server Actions do not exist
 * yet. Tests fail until 04-04 ships them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const USER_ID = "user-session-test-01";
const SESSION_ID = "sess-test-01";

// ─── AUTH-04: Per-session revoke ──────────────────────────────────────────────

describe("AUTH-04 — revokeSession", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("revokeSession sets revoked_at on the target user_sessions row", async () => {
    // TODO(04-04): implement revokeSession Server Action in settings/actions.ts
    // Must: verify ownership (user_id match), set revoked_at = now() on the row
    const actionsModule = await import("@/app/app/settings/actions").catch(
      () => null
    );
    const revokeSession =
      actionsModule && "revokeSession" in actionsModule
        ? actionsModule.revokeSession
        : null;

    // RED: revokeSession does not exist in settings/actions.ts yet (04-04 will add it)
    expect(revokeSession).not.toBeNull();
    // When implemented (with serviceDb mock):
    // const result = await revokeSession(SESSION_ID);
    // expect(result).toEqual({ success: true });
    // expect(updateMock).toHaveBeenCalledWith(
    //   expect.objectContaining({ revoked_at: expect.any(Date) })
    // );
  });
});

// ─── AUTH-05: Sign out everywhere ────────────────────────────────────────────

describe("AUTH-05 — signOutEverywhere", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("signOutEverywhere marks ALL user_sessions rows revoked for the current user", async () => {
    // TODO(04-04): implement signOutEverywhere Server Action in settings/actions.ts
    // Must: set revoked_at = now() on ALL rows WHERE user_id = userId AND revoked_at IS NULL
    // Also call: supabase.auth.admin.signOut(userId, { scope: "global" }) via service role
    const actionsModule = await import("@/app/app/settings/actions").catch(
      () => null
    );
    const signOutEverywhere =
      actionsModule && "signOutEverywhere" in actionsModule
        ? actionsModule.signOutEverywhere
        : null;

    // RED: signOutEverywhere does not exist in settings/actions.ts yet (04-04 will add it)
    expect(signOutEverywhere).not.toBeNull();
    // When implemented (with mocked serviceDb + auth admin):
    // const result = await signOutEverywhere();
    // expect(result).toEqual({ success: true });
    // expect(updateAllMock).toHaveBeenCalledWith(
    //   expect.objectContaining({ revoked_at: expect.any(Date) })
    // );
    // expect(authAdminSignOutMock).toHaveBeenCalledWith(expect.objectContaining({ scope: "global" }));
  });
});
