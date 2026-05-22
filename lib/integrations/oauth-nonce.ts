/**
 * lib/integrations/oauth-nonce.ts
 * Short-lived OAuth state nonce storage via Upstash Redis.
 *
 * CR-07 FIX: Store the OAuth state nonce in Redis (TTL=10min) rather than
 * clobbering access_token_encrypted in the integrations table with `nonce:<value>`.
 *
 * Clobbering access_token_encrypted destroys a live encrypted token when a user
 * restarts/abandons the connect flow, leaving the integration permanently broken.
 *
 * Redis key: `oz:oauth_nonce:{userId}:{provider}`
 * TTL: 10 minutes (OAuth handshake should complete within this window)
 *
 * SECURITY: Server-only module. No NEXT_PUBLIC_ env vars.
 */
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const NONCE_TTL_SECONDS = 10 * 60; // 10 minutes

function nonceKey(userId: string, provider: string): string {
  return `oz:oauth_nonce:${userId}:${provider}`;
}

/**
 * Store the OAuth state nonce for a user+provider pair.
 * TTL is 10 minutes — if the user hasn't completed the flow, the nonce expires.
 */
export async function storeOAuthNonce(
  userId: string,
  provider: string,
  nonce: string
): Promise<void> {
  await redis.set(nonceKey(userId, provider), nonce, { ex: NONCE_TTL_SECONDS });
}

/**
 * Retrieve and validate the stored nonce for a user+provider pair.
 * Returns the stored nonce string, or null if not found / expired.
 * Does NOT delete the nonce — call clearOAuthNonce after successful exchange.
 */
export async function getOAuthNonce(
  userId: string,
  provider: string
): Promise<string | null> {
  const stored = await redis.get<string>(nonceKey(userId, provider));
  return stored ?? null;
}

/**
 * Clear the OAuth nonce after successful token exchange (cleanup).
 */
export async function clearOAuthNonce(
  userId: string,
  provider: string
): Promise<void> {
  await redis.del(nonceKey(userId, provider));
}
