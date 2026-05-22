/**
 * crypto.test.ts — TDD RED: failing tests for encryptToken / decryptToken
 * Task 1: libsodium encrypted-token helpers + round-trip tests
 *
 * ENCRYPTION_KEY must be a 32-byte base64 string.
 * Generate: openssl rand -base64 32
 */
import { describe, it, expect, beforeAll } from "vitest";

// Set a fixed 32-byte test key (base64 of 32 bytes of zeros — test only)
const TEST_KEY = Buffer.alloc(32, 0xab).toString("base64"); // 32 bytes, 0xab fill

beforeAll(() => {
  process.env["ENCRYPTION_KEY"] = TEST_KEY;
});

describe("encryptToken / decryptToken", () => {
  it("decryptToken(encryptToken(x)) === x (round-trip exact)", async () => {
    const { encryptToken, decryptToken } = await import(
      "@/lib/integrations/crypto"
    );
    const plaintext = "shopify-access-token-abc123";
    const encrypted = await encryptToken(plaintext);
    const decrypted = await decryptToken(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypted output is NOT equal to plaintext", async () => {
    const { encryptToken } = await import("@/lib/integrations/crypto");
    const plaintext = "my-secret-oauth-token";
    const encrypted = await encryptToken(plaintext);
    expect(encrypted).not.toBe(plaintext);
    // Also check the ciphertext does not contain the raw token text
    expect(Buffer.from(encrypted, "base64").toString()).not.toContain(plaintext);
  });

  it("two encryptions of the same plaintext produce different ciphertext (random nonce)", async () => {
    const { encryptToken } = await import("@/lib/integrations/crypto");
    const plaintext = "same-token-twice";
    const enc1 = await encryptToken(plaintext);
    const enc2 = await encryptToken(plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it("decryptToken on tampered ciphertext throws", async () => {
    const { encryptToken, decryptToken } = await import(
      "@/lib/integrations/crypto"
    );
    const plaintext = "token-to-tamper";
    const encrypted = await encryptToken(plaintext);
    // Flip the last byte of the base64 payload
    const buf = Buffer.from(encrypted, "base64");
    const lastIdx = buf.length - 1;
    // noUncheckedIndexedAccess: guard before writing
    if (lastIdx >= 0) buf[lastIdx] = (buf[lastIdx] ?? 0) ^ 0xff;
    const tampered = buf.toString("base64");
    await expect(decryptToken(tampered)).rejects.toThrow();
  });

  it("missing ENCRYPTION_KEY throws a clear error", async () => {
    // Temporarily remove the env var
    const saved = process.env["ENCRYPTION_KEY"];
    delete process.env["ENCRYPTION_KEY"];
    try {
      // Re-import via dynamic import to get fresh module (vitest caches modules)
      // We call the function directly to trigger key validation
      const { encryptToken } = await import("@/lib/integrations/crypto");
      await expect(encryptToken("test")).rejects.toThrow(/ENCRYPTION_KEY/i);
    } finally {
      process.env["ENCRYPTION_KEY"] = saved;
    }
  });

  it("wrong-length ENCRYPTION_KEY throws a clear error", async () => {
    process.env["ENCRYPTION_KEY"] = Buffer.alloc(16).toString("base64"); // 16 bytes, not 32
    try {
      const { encryptToken } = await import("@/lib/integrations/crypto");
      await expect(encryptToken("test")).rejects.toThrow(
        /32 bytes|ENCRYPTION_KEY/i
      );
    } finally {
      process.env["ENCRYPTION_KEY"] = TEST_KEY;
    }
  });
});
