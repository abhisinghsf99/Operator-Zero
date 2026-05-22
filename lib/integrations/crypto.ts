/**
 * lib/integrations/crypto.ts
 * Encrypted-token helpers for OAuth token storage.
 *
 * Uses libsodium crypto_secretbox_easy (XSalsa20-Poly1305 authenticated encryption).
 * Plaintext tokens NEVER reach the database — only ciphertext is stored.
 *
 * Storage format: base64(nonce || ciphertext)
 *   - nonce: 24 bytes (crypto_secretbox_NONCEBYTES), random per call
 *   - ciphertext: plaintext.length + 16 bytes (Poly1305 MAC overhead)
 *
 * Key source: process.env.ENCRYPTION_KEY (base64-encoded 32 bytes)
 * Generate: openssl rand -base64 32
 * Store in: .env.local, Vercel env, Supabase project secrets (server-only, NO NEXT_PUBLIC_)
 *
 * THREAT MODEL:
 *   T-1-02-02: OAuth token at rest — only ciphertext in integrations.access_token_encrypted
 *   T-1-02-04: ENCRYPTION_KEY management — throws on missing/wrong-length key; key never committed
 */
import sodium from "libsodium-wrappers";

/**
 * Validate and return the 32-byte encryption key from env.
 * Throws if ENCRYPTION_KEY is absent or not exactly 32 bytes after base64 decode.
 */
function getKey(): Uint8Array {
  const raw = process.env["ENCRYPTION_KEY"];
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is missing. " +
        "Generate with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}. ` +
        "Regenerate with: openssl rand -base64 32"
    );
  }
  return new Uint8Array(key);
}

/**
 * Encrypts a plaintext string and returns base64(nonce || ciphertext).
 * Each call generates a fresh random nonce — identical plaintexts produce
 * different ciphertexts (random nonce guarantees this).
 *
 * @throws if ENCRYPTION_KEY is absent or wrong length
 */
export async function encryptToken(plaintext: string): Promise<string> {
  await sodium.ready;

  const key = getKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    key
  );

  // Combine nonce + ciphertext into a single buffer, then base64-encode
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  return Buffer.from(combined).toString("base64");
}

/**
 * Decrypts a base64(nonce || ciphertext) string and returns the original plaintext.
 *
 * @throws if ENCRYPTION_KEY is absent or wrong length
 * @throws if the ciphertext has been tampered with (authentication failure)
 * @throws if the input is truncated or malformed
 */
export async function decryptToken(encrypted: string): Promise<string> {
  await sodium.ready;

  const key = getKey();
  const combined = Buffer.from(encrypted, "base64");

  if (combined.length < sodium.crypto_secretbox_NONCEBYTES + 16) {
    throw new Error(
      "Decryption failed: ciphertext is too short to be valid"
    );
  }

  const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES);

  const plaintext = sodium.crypto_secretbox_open_easy(
    new Uint8Array(ciphertext),
    new Uint8Array(nonce),
    key
  );

  if (!plaintext) {
    throw new Error(
      "Decryption failed: authentication tag mismatch — ciphertext may have been tampered with"
    );
  }

  return sodium.to_string(plaintext);
}
