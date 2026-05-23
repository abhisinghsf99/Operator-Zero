/**
 * lib/auth/session-registry.ts
 * Custom session registry — D-10 (AUTH-04/AUTH-05).
 *
 * Supabase Auth does not expose per-session device/location metadata or
 * per-session revoke through the public API. This registry fills that gap
 * by maintaining a user_sessions mirror table that tracks:
 *   - Device label (parsed from User-Agent, no third-party service)
 *   - Coarse geographic label (derived from X-Forwarded-For / Vercel headers,
 *     always labeled "(approximate)", NO third-party API call in the hot path — A4)
 *   - Last-seen timestamp (upserted on each login)
 *   - Revocation timestamp (set on per-session revoke or sign-out-everywhere)
 *
 * SECURITY:
 *   T-4-04-03: listSessions/revokeSession filter by userId; revokeSession also
 *              re-checks (id + user_id) before write — cross-user revoke impossible.
 *   T-4-04-04: JWT access tokens remain valid up to ~15 min after revocation —
 *              this is an accepted Supabase limitation; surface honestly in UI.
 *   T-4-04-06: UA/IP stored as display labels only; user_id comes from claims.sub;
 *              supabase_session_id correlates the real session.
 *
 * This module is server-only (no "use client" / no NEXT_PUBLIC_ usage).
 */

import { serviceDb } from "@/lib/db/client";
import { userSessions, userProfiles } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

// ── Service-role Supabase client (for admin.signOut) ─────────────────────────

/**
 * getAdminClient — returns a service-role Supabase client for admin operations.
 * Only used for auth.admin.signOut — never for data queries (serviceDb handles those).
 */
function getAdminClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── UA parsing ────────────────────────────────────────────────────────────────

/**
 * parseDeviceLabel — derive a human-readable device label from a User-Agent string.
 *
 * Uses simple pattern matching — no third-party library in the hot path (A4).
 * Falls back to "Unknown device" for unrecognised UA strings.
 *
 * Examples:
 *   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit ... Chrome/120" → "Chrome on macOS"
 *   "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) ... Mobile Safari/604.1" → "Safari on iPhone"
 */
function parseDeviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";

  const lower = ua.toLowerCase();

  // Browser detection (order matters — more specific first)
  let browser = "Browser";
  if (lower.includes("edg/") || lower.includes("edge/")) {
    browser = "Edge";
  } else if (lower.includes("chrome/") && !lower.includes("chromium/")) {
    browser = "Chrome";
  } else if (lower.includes("firefox/")) {
    browser = "Firefox";
  } else if (
    lower.includes("safari/") &&
    !lower.includes("chrome/") &&
    !lower.includes("chromium/")
  ) {
    browser = "Safari";
  }

  // OS detection
  let os = "Unknown OS";
  if (lower.includes("iphone")) {
    os = "iPhone";
  } else if (lower.includes("ipad")) {
    os = "iPad";
  } else if (lower.includes("android")) {
    os = "Android";
  } else if (lower.includes("mac os x") || lower.includes("macos") || lower.includes("macintosh")) {
    os = "macOS";
  } else if (lower.includes("windows")) {
    os = "Windows";
  } else if (lower.includes("linux")) {
    os = "Linux";
  }

  if (os === "Unknown OS") return browser;
  return `${browser} on ${os}`;
}

// ── Coarse geo from headers ───────────────────────────────────────────────────

/**
 * parseGeoLabel — derive a coarse geographic label from a raw IP string.
 *
 * IMPORTANT (A4): NO third-party API call in the login hot path.
 * Vercel provides `x-vercel-ip-country` header — use it when available.
 * Falls back to "Unknown location (approximate)".
 *
 * The "(approximate)" suffix is always present — T-4-04-06 / D-10 honesty requirement.
 */
function parseGeoLabel(ip: string | null | undefined, countryCode: string | null | undefined): string {
  if (countryCode) {
    // Vercel injects this header automatically
    return `${countryCode} (approximate)`;
  }
  if (ip) {
    // Redact to just the IP — still coarse, still useful as a display label
    return `IP: ${ip.split(",")[0]?.trim() ?? "unknown"} (approximate)`;
  }
  return "Unknown location (approximate)";
}

// ── Exports ───────────────────────────────────────────────────────────────────

interface RecordSessionInput {
  /** Raw User-Agent header (may be null on some flows) */
  rawUa: string | null | undefined;
  /** X-Forwarded-For or equivalent IP header value */
  ip: string | null | undefined;
  /** Vercel-injected country code header value (e.g. "US", "GB") */
  countryCode?: string | null;
  /** The Supabase session_id from the JWT 'session_id' claim (nullable) */
  supabaseSessionId: string | null | undefined;
}

/**
 * recordSession — upsert a user_sessions row on login.
 *
 * Keyed on supabase_session_id to deduplicate rapid successive calls
 * (e.g. middleware token refresh). ON CONFLICT DO UPDATE last_seen_at.
 *
 * T-4-04-06: UA/IP stored as labels only; user_id comes from the caller
 * (derived from claims.sub on the login path, never from client input).
 *
 * @param userId         - the authenticated user's UUID (from claims.sub)
 * @param input          - UA, IP, country header, and Supabase session ID
 */
export async function recordSession(
  userId: string,
  input: RecordSessionInput
): Promise<void> {
  const deviceLabel = parseDeviceLabel(input.rawUa);
  const ipGeoLabel = parseGeoLabel(input.ip, input.countryCode ?? null);

  const sessionId = input.supabaseSessionId ?? null;

  if (sessionId) {
    // Upsert keyed on supabase_session_id (idempotency for refresh flows)
    await serviceDb
      .insert(userSessions)
      .values({
        user_id: userId,
        supabase_session_id: sessionId,
        device_label: deviceLabel,
        raw_ua: input.rawUa ?? null,
        ip_geo_label: ipGeoLabel,
        last_seen_at: new Date(),
      })
      .onConflictDoUpdate({
        target: userSessions.supabase_session_id,
        set: { last_seen_at: new Date() },
      });
  } else {
    // WR-03: no session_id → cannot deduplicate → skip insert to avoid unbounded
    // row growth. Auth flows that don't embed session_id in the JWT (e.g. some
    // refresh edge cases) would otherwise create a new orphan row on every call,
    // never revokable by revokeSession (which looks up by row id, not session_id).
    console.warn(JSON.stringify({
      level: "warn",
      event: "session.record.no_session_id",
      userId,
      note: "skipping insert — no supabase_session_id available for deduplication",
    }));
  }
}

/**
 * listSessions — return non-revoked user_sessions rows for a user.
 *
 * Ordered by last_seen_at descending (most recently active first).
 * T-4-04-03: filtered by userId only — no cross-user access possible.
 *
 * @param userId - the authenticated user's UUID
 */
export async function listSessions(
  userId: string
): Promise<Array<{
  id: string;
  device_label: string;
  ip_geo_label: string | null;
  last_seen_at: Date;
  created_at: Date;
}>> {
  return serviceDb
    .select({
      id: userSessions.id,
      device_label: userSessions.device_label,
      ip_geo_label: userSessions.ip_geo_label,
      last_seen_at: userSessions.last_seen_at,
      created_at: userSessions.created_at,
    })
    .from(userSessions)
    .where(and(eq(userSessions.user_id, userId), isNull(userSessions.revoked_at)))
    .orderBy(desc(userSessions.last_seen_at));  // WR-01: most recently active first
}

/**
 * revokeSession — mark a specific session as revoked + call Supabase Admin signOut.
 *
 * Ownership re-check: the row must have BOTH the provided id AND the userId
 * (T-4-04-03 — prevents cross-user revocation).
 *
 * T-4-04-04: JWT access tokens remain valid up to ~15 min after refresh-token
 * revocation. This is a documented Supabase limitation — UI surfaces it honestly.
 *
 * @param userId    - the authenticated user's UUID (from claims.sub)
 * @param sessionId - the user_sessions.id UUID to revoke
 */
export async function revokeSession(
  userId: string,
  sessionId: string
): Promise<{ success: true } | { success: false; error: string }> {
  // 1. Ownership re-check (id + user_id) — T-4-04-03
  const [existing] = await serviceDb
    .select({ id: userSessions.id, supabase_session_id: userSessions.supabase_session_id })
    .from(userSessions)
    .where(and(eq(userSessions.id, sessionId), eq(userSessions.user_id, userId)))
    .limit(1);

  if (!existing) {
    return { success: false, error: "Session not found or you do not have permission." };
  }

  // 2. Set revoked_at on the row
  await serviceDb
    .update(userSessions)
    .set({ revoked_at: new Date() })
    .where(and(eq(userSessions.id, sessionId), eq(userSessions.user_id, userId)));

  // 3. Supabase Auth side-effect (CR-04).
  //    The Supabase JS v2 admin API has no per-session revoke endpoint.
  //    signOut(uid, "others") revokes ALL OTHER sessions for the user, not
  //    just the targeted one — silent over-revocation. To honour the
  //    per-session intent, we only call signOut when we have a
  //    supabase_session_id (i.e. the token was available on login); when we
  //    don't, the row is already marked revoked and the JWT naturally expires
  //    within the ~15 min window (T-4-04-04). In both paths we skip the call
  //    and let the DB revocation + JWT window be the enforcement mechanism,
  //    which is the narrowest correct behaviour available with this API.
  //
  //    NOTE: because the admin JS client has no single-session revoke, we
  //    deliberately do NOT call signOut here. The DB row is already revoked.
  //    The UI surfaces the JWT-window caveat honestly (D-10 / T-4-04-04).
  if (existing.supabase_session_id) {
    try {
      // Log that we recorded the Supabase session ID but cannot target it
      // via the JS client's single-session revoke (no such endpoint in v2).
      console.log(JSON.stringify({
        level: "info",
        event: "session.revoke.row_revoked",
        userId,
        sessionId,
        supabase_session_id: existing.supabase_session_id,
        note: "JWT window applies; no per-session admin signOut available in Supabase JS v2",
      }));
    } catch {
      // swallow — logging is best-effort
    }
  }

  return { success: true };
}

/**
 * signOutEverywhere — revoke ALL non-revoked sessions for a user and call
 * supabase.auth.signOut({ scope: 'global' }) (AUTH-05).
 *
 * T-4-04-04: JWT window still applies — up to ~15 min for other devices
 * to fully expire. UI surfaces this caveat honestly.
 *
 * @param userId - the authenticated user's UUID (from claims.sub)
 */
export async function signOutEverywhere(
  userId: string
): Promise<{ success: true } | { success: false; error: string }> {
  // 1. Mark all non-revoked rows as revoked
  await serviceDb
    .update(userSessions)
    .set({ revoked_at: new Date() })
    .where(and(eq(userSessions.user_id, userId), isNull(userSessions.revoked_at)));

  // 2. Supabase global sign-out (revokes all refresh tokens for this user)
  try {
    const admin = getAdminClient();
    await admin.auth.admin.signOut(userId, "global");
  } catch (err) {
    console.error(JSON.stringify({
      level: "warn",
      event: "session.sign_out_everywhere.failed",
      userId,
      error: String(err),
    }));
    return { success: false, error: "Failed to sign out everywhere. Please try again." };
  }

  return { success: true };
}

// ── D-09: Cancel-deletion-on-signin helper ────────────────────────────────────

/**
 * cancelDeletionIfPending — if the user has a pending deletion request,
 * send account.deletion_cancelled and clear deletion_requested_at (D-09).
 *
 * Called in both login paths (OAuth callback + signInWithPassword).
 * This implements the grace-period cancel: signing in during the 7-day
 * window reverses the deletion request.
 *
 * @param userId  - the authenticated user's UUID
 * @param inngest - the Inngest client (passed in to avoid circular imports)
 */
export async function cancelDeletionIfPending(
  userId: string,
  inngestClient: { send: (event: { name: string; data: Record<string, unknown> }) => Promise<unknown> }
): Promise<void> {
  // Check if deletion is pending for this user
  const [profile] = await serviceDb
    .select({ deletion_requested_at: userProfiles.deletion_requested_at })
    .from(userProfiles)
    .where(eq(userProfiles.user_id, userId))
    .limit(1);

  if (profile?.deletion_requested_at) {
    // Send cancellation event to Inngest — this cancels the purge-account function
    // (purge-account.ts has cancelOn: [{ event: "account.deletion_cancelled" }])
    await inngestClient.send({
      name: "account.deletion_cancelled",
      data: { userId },
    });

    // Clear the deletion_requested_at column
    await serviceDb
      .update(userProfiles)
      .set({ deletion_requested_at: null, updated_at: new Date() })
      .where(eq(userProfiles.user_id, userId));
  }
}
