/**
 * lib/integrations/gmail/client.ts
 * Gmail integration adapter — Phase 2 real implementation.
 *
 * Provides:
 *   - GmailAdapter: implements IntegrationAdapter (isHealthy, refreshToken, getAccessToken)
 *   - buildGmailAuthUrl: builds Google OAuth2 consent URL (access_type=offline, prompt=consent)
 *   - exchangeGmailCode: exchanges OAuth code for tokens, encrypts and stores both
 *   - createGmailClient: creates an authenticated googleapis gmail client for a user
 *
 * SECURITY:
 *   T-2-04-01: state nonce passed through and verified in callback route
 *   T-2-04-02: both access + refresh tokens encrypted at rest via encryptToken
 *   T-2-04-04: all DB queries filter by user_id
 */
import type { IntegrationAdapter } from "../adapter";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { encryptToken, decryptToken } from "@/lib/integrations/crypto";
import { serviceDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";

/** Gmail scope required for reading + modifying messages */
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

/** Build a new Google OAuth2 client using env credentials. */
function buildOAuth2Client(redirectUri?: string): OAuth2Client {
  return new OAuth2Client(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"],
    redirectUri
  );
}

/**
 * Build the Google OAuth2 consent URL.
 * Requests access_type=offline (refresh token) and prompt=consent (forces refresh token issuance).
 *
 * @param nonce  State value to embed in the URL for CSRF protection (T-2-04-01).
 * @param redirectUri  The callback URI — must match the registered URI in Google Cloud.
 */
export function buildGmailAuthUrl(nonce: string, redirectUri?: string): string {
  const client = buildOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SCOPE],
    state: nonce,
    redirect_uri: redirectUri,
  });
}

/**
 * Exchange an authorization code for Gmail tokens.
 * Encrypts both access_token and refresh_token and upserts the integrations row.
 * Fires the 'gmail.connected' Inngest event to trigger initial sync.
 *
 * @param userId      Authenticated user's ID
 * @param code        OAuth authorization code from the callback
 * @param redirectUri The redirect URI used in the initial auth request
 */
export async function exchangeGmailCode(
  userId: string,
  code: string,
  redirectUri: string
): Promise<void> {
  const client = buildOAuth2Client(redirectUri);

  // Exchange code for tokens
  const { tokens } = await client.getToken(code);

  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;

  if (!accessToken) {
    throw new Error("Google did not return an access token.");
  }

  // T-2-04-02: encrypt both tokens before storing
  const encryptedAccess = await encryptToken(accessToken);
  const encryptedRefresh = refreshToken
    ? await encryptToken(refreshToken)
    : null;

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : null;

  const scopes = (tokens.scope ?? GMAIL_SCOPE).split(" ").filter(Boolean);

  // UPSERT the integrations row
  await serviceDb
    .insert(integrations)
    .values({
      user_id: userId,
      provider: "gmail",
      provider_account_id: userId, // Gmail uses the user's email — userId as placeholder until profile lookup
      status: "active",
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh,
      scopes,
      last_error: null,
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    })
    .onConflictDoUpdate({
      target: [integrations.user_id, integrations.provider],
      set: {
        status: "active",
        access_token_encrypted: encryptedAccess,
        ...(encryptedRefresh ? { refresh_token_encrypted: encryptedRefresh } : {}),
        scopes,
        last_error: null,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      },
    });

  // Fire event to trigger initial 30-day sync
  await inngest.send({
    name: "gmail.connected",
    data: { userId },
  });

  console.log(
    JSON.stringify({
      level: "info",
      event: "gmail.oauth.callback.success",
      userId,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * GmailAdapter — Phase 2 real implementation.
 *
 * isHealthy(): verifies the access token is valid and not expired.
 * refreshToken(): implements IntegrationAdapter.refreshToken() — delegates to getAccessToken().
 * getAccessToken(): loads the token, refreshes if expired, returns plaintext for in-memory use.
 */
export class GmailAdapter implements IntegrationAdapter {
  constructor(private readonly userId: string) {}

  /**
   * Check whether the stored Gmail integration is valid (status='active' and token not expired).
   * Does NOT make a live API call — checks the DB row only.
   */
  async isHealthy(): Promise<boolean> {
    const [row] = await serviceDb
      .select({
        status: integrations.status,
        expires_at: integrations.expires_at,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.user_id, this.userId),
          eq(integrations.provider, "gmail")
        )
      )
      .limit(1);

    if (!row || row.status !== "active") return false;
    if (row.expires_at && row.expires_at < new Date()) return false;
    return true;
  }

  /**
   * Refreshes the stored access token using the refresh token.
   * Implements IntegrationAdapter.refreshToken().
   */
  async refreshToken(): Promise<void> {
    await this.getAccessToken();
  }

  /**
   * Returns a valid plaintext access token for this user.
   * Automatically refreshes the token if expires_at is in the past.
   *
   * SECURITY: The plaintext token is ONLY returned in memory — never stored plaintext.
   *
   * @throws if no integration row exists, or if there is no refresh token available.
   */
  async getAccessToken(): Promise<string> {
    const [row] = await serviceDb
      .select({
        id: integrations.id,
        status: integrations.status,
        access_token_encrypted: integrations.access_token_encrypted,
        refresh_token_encrypted: integrations.refresh_token_encrypted,
        expires_at: integrations.expires_at,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.user_id, this.userId),
          eq(integrations.provider, "gmail")
        )
      )
      .limit(1);

    if (!row) {
      throw new Error("No Gmail integration found for this user.");
    }

    const isExpired =
      row.expires_at && row.expires_at < new Date();

    if (!isExpired) {
      // Token is still valid — decrypt and return
      return decryptToken(row.access_token_encrypted);
    }

    // Token expired — refresh using the refresh token
    if (!row.refresh_token_encrypted) {
      throw new Error(
        "Gmail access token is expired and no refresh token is available. Please reconnect Gmail."
      );
    }

    const refreshToken = await decryptToken(row.refresh_token_encrypted);

    const client = buildOAuth2Client();
    client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await client.refreshAccessToken();
    const newAccessToken = credentials.access_token;

    if (!newAccessToken) {
      throw new Error("Google token refresh did not return a new access token.");
    }

    const newEncryptedAccess = await encryptToken(newAccessToken);
    const newExpiresAt = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : null;

    // Re-encrypt and update the row
    await serviceDb
      .update(integrations)
      .set({
        access_token_encrypted: newEncryptedAccess,
        ...(newExpiresAt ? { expires_at: newExpiresAt } : {}),
        last_error: null,
      })
      .where(
        and(
          eq(integrations.user_id, this.userId),
          eq(integrations.provider, "gmail")
        )
      );

    return newAccessToken;
  }
}

/**
 * Create an authenticated googleapis gmail client for a given user.
 * Automatically handles token refresh via GmailAdapter.getAccessToken().
 *
 * @param userId  The authenticated user ID
 */
export async function createGmailClient(userId: string) {
  const adapter = new GmailAdapter(userId);
  const accessToken = await adapter.getAccessToken();

  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });

  return google.gmail({ version: "v1", auth });
}
