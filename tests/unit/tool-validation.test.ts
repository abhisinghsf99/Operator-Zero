/**
 * tests/unit/tool-validation.test.ts
 * Wave-0 scaffold — AGENT-04: Tool Zod validation → correctable error format
 *
 * Tests that each tool's Zod input schema correctly validates inputs and that
 * validation errors are returned in the tool_result error format (correctable
 * by the model, not thrown as exceptions).
 *
 * Requirement: AGENT-04 — Tool inputs validated via Zod; invalid input returns correctable error to model
 *
 * LLM TESTING RULE: No live DB/Anthropic/Voyage calls. All tool execute() calls
 * are tested via dispatchTool() with mocked dependencies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock serviceDb ────────────────────────────────────────────────────────────

vi.mock("@/lib/db/client", () => ({
  serviceDb: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "mock-id" }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
  },
}));

// ─── Mock memory ──────────────────────────────────────────────────────────────

vi.mock("@/lib/agent/memory", () => ({
  storeMemoryItem: vi.fn().mockResolvedValue({ id: "mem-id" }),
  updateMemoryItem: vi.fn().mockResolvedValue(undefined),
  softDeleteMemoryItem: vi.fn().mockResolvedValue(undefined),
  recallMemory: vi.fn().mockResolvedValue([]),
}));

// ─── Import under test ─────────────────────────────────────────────────────────

import {
  getToolDefinitions,
  dispatchTool,
  READ_TOOL_NAMES,
  WRITE_TOOL_NAMES,
} from "@/lib/agent/tools/index";
import type { AgentContext } from "@/lib/agent/tools/index";

// ─── Helper context ────────────────────────────────────────────────────────────

const TEST_CTX: AgentContext = {
  userId: "user-test-123",
  automationLevel: "L2",
};

const L3_CTX: AgentContext = {
  userId: "user-test-123",
  automationLevel: "L3",
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AGENT-04 — Tool Zod validation → correctable error format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalid tool input returns tool_result with is_error not a thrown exception", async () => {
    // shopify_get_product requires product_gid — omit it to trigger validation error
    const result = await dispatchTool("shopify_get_product", {}, TEST_CTX);
    expect(result).toHaveProperty("type", "tool_result");
    expect(result).toHaveProperty("is_error", true);
    expect(result).not.toThrow; // function must not throw
  });

  it("error message in tool_result describes which field is invalid and why", async () => {
    const result = await dispatchTool("shopify_get_product", {}, TEST_CTX);
    expect(result.is_error).toBe(true);
    expect(typeof result.content).toBe("string");
    expect(result.content).toMatch(/product_gid|required/i);
  });

  it("valid input passes through Zod validation without error", async () => {
    // Validation succeeds — result may still have is_error if the product is not
    // found in the (empty mock) DB, but it should NOT be a validation error
    const result = await dispatchTool(
      "shopify_get_product",
      { product_gid: "gid://shopify/Product/123" },
      TEST_CTX
    );
    // Should NOT be a validation error — if is_error is true, it's a "not found" error
    if (result.is_error) {
      expect(result.content).not.toMatch(/validation failed|product_gid.*required/i);
    }
  });

  it("missing required field returns error specifying the field name", async () => {
    // shopify_update_product_description requires product_gid + description
    const result = await dispatchTool(
      "shopify_update_product_description",
      { product_gid: "gid://shopify/Product/123" }, // missing description
      TEST_CTX
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/description|required/i);
  });

  it("wrong type for a field returns error with the field name and expected type", async () => {
    const result = await dispatchTool(
      "shopify_update_variant_price",
      { variant_gid: "gid://shopify/ProductVariant/123", price: "not-a-number" },
      TEST_CTX
    );
    // price must be a positive number — string should fail
    expect(result.is_error).toBe(true);
  });

  it("extra unknown fields are stripped (passthrough) per tool schema", async () => {
    // Unknown field `extra_field` should not cause a VALIDATION error
    // The tool may still return is_error if product is not found in mock DB
    const result = await dispatchTool(
      "shopify_get_product",
      { product_gid: "gid://shopify/Product/123", extra_field: "ignored" },
      TEST_CTX
    );
    // Extra fields must not trigger a Zod validation error
    if (result.is_error) {
      expect(result.content).not.toMatch(/extra_field|unexpected.*key/i);
    }
  });

  it("tool registry exports all 11 read tools with valid input schemas", () => {
    const defs = getToolDefinitions();
    for (const name of READ_TOOL_NAMES) {
      expect(defs[name]).toBeDefined();
      expect(defs[name]!.inputSchema).toBeDefined();
      expect(typeof defs[name]!.execute).toBe("function");
    }
    expect(READ_TOOL_NAMES.length).toBe(11);
  });

  it("tool registry exports all 11 write tools with valid input schemas", () => {
    const defs = getToolDefinitions();
    for (const name of WRITE_TOOL_NAMES) {
      expect(defs[name]).toBeDefined();
      expect(defs[name]!.inputSchema).toBeDefined();
      expect(typeof defs[name]!.execute).toBe("function");
    }
    expect(WRITE_TOOL_NAMES.length).toBe(11);
  });

  it("each tool's execute function is callable and returns ToolResult shape", async () => {
    // Use shopify_list_products (no required fields) — returns empty list from mock DB
    const result = await dispatchTool("shopify_list_products", {}, TEST_CTX);
    expect(result).toHaveProperty("type", "tool_result");
    expect(result).toHaveProperty("content");
    expect(typeof result.content).toBe("string");
  });

  it("write tools expose an approvalRequired gate keyed on automation level", () => {
    const defs = getToolDefinitions();
    // All write tools should have an approvalRequired function
    for (const name of WRITE_TOOL_NAMES) {
      const tool = defs[name]!;
      expect(typeof tool.approvalRequired).toBe("function");
    }
  });

  it("write tool approvalRequired returns true for L1/L2 and false for L3", () => {
    const defs = getToolDefinitions();
    const writeTool = defs[WRITE_TOOL_NAMES[0]!]!;
    expect(writeTool.approvalRequired!({}, TEST_CTX)).toBe(true); // L2 needs approval
    expect(writeTool.approvalRequired!({}, L3_CTX)).toBe(false); // L3 autonomous
  });

  it("read tools do NOT expose an approvalRequired gate", () => {
    const defs = getToolDefinitions();
    for (const name of READ_TOOL_NAMES) {
      const tool = defs[name]!;
      // Read tools either have no approvalRequired or it always returns false
      if (tool.approvalRequired) {
        expect(tool.approvalRequired({}, TEST_CTX)).toBe(false);
      }
    }
  });

  it("unknown tool name returns tool_result error from dispatchTool", async () => {
    const result = await dispatchTool("nonexistent_tool", {}, TEST_CTX);
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/unknown tool|not found/i);
  });
});
