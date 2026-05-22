/**
 * tests/unit/callback.test.ts
 * Unit tests for validateNextParam from app/auth/callback/route.ts
 *
 * Covers the open-redirect guard (T-1-04-04), including:
 *   - null / empty input fallback
 *   - absolute URL rejection
 *   - protocol-relative URL rejection (//)
 *   - backslash-prefixed path rejection (/\, /%5C, /%5c)
 *   - valid relative paths pass through
 */
import { describe, it, expect } from "vitest";
import { validateNextParam } from "@/app/auth/callback/route";

const DEFAULT = "/app/home";

describe("validateNextParam — open-redirect guard", () => {
  // Null / missing input
  it("returns default for null", () => {
    expect(validateNextParam(null)).toBe(DEFAULT);
  });

  it("returns default for empty string", () => {
    expect(validateNextParam("")).toBe(DEFAULT);
  });

  // Absolute URL rejection
  it("rejects http:// URLs", () => {
    expect(validateNextParam("http://evil.example.com")).toBe(DEFAULT);
  });

  it("rejects https:// URLs", () => {
    expect(validateNextParam("https://evil.example.com/path")).toBe(DEFAULT);
  });

  it("rejects javascript: URLs", () => {
    expect(validateNextParam("javascript:alert(1)")).toBe(DEFAULT);
  });

  // Protocol-relative URL rejection
  it("rejects // prefix (protocol-relative)", () => {
    expect(validateNextParam("//evil.example.com")).toBe(DEFAULT);
  });

  it("rejects //evil.example.com/path", () => {
    expect(validateNextParam("//evil.example.com/path")).toBe(DEFAULT);
  });

  // Backslash-prefixed path rejection (WR-01)
  it("rejects /\\ prefix (backslash after leading slash)", () => {
    expect(validateNextParam("/\\evil.example.com")).toBe(DEFAULT);
  });

  it("rejects /%5C (uppercase percent-encoded backslash)", () => {
    expect(validateNextParam("/%5Cevil.example.com")).toBe(DEFAULT);
  });

  it("rejects /%5c (lowercase percent-encoded backslash)", () => {
    expect(validateNextParam("/%5cevil.example.com")).toBe(DEFAULT);
  });

  // Non-slash prefix rejection
  it("rejects paths not starting with /", () => {
    expect(validateNextParam("evil.example.com")).toBe(DEFAULT);
  });

  it("rejects paths starting with a letter", () => {
    expect(validateNextParam("app/home")).toBe(DEFAULT);
  });

  // Valid relative paths
  it("accepts /app/home", () => {
    expect(validateNextParam("/app/home")).toBe("/app/home");
  });

  it("accepts /app/workflows", () => {
    expect(validateNextParam("/app/workflows")).toBe("/app/workflows");
  });

  it("accepts /login", () => {
    expect(validateNextParam("/login")).toBe("/login");
  });

  it("accepts paths with query strings", () => {
    expect(validateNextParam("/app/home?tab=overview")).toBe(
      "/app/home?tab=overview"
    );
  });
});
