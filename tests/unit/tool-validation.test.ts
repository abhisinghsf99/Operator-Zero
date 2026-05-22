/**
 * tests/unit/tool-validation.test.ts
 * Wave-0 scaffold — AGENT-04: Tool Zod validation → correctable error format
 *
 * Tests that each tool's Zod input schema correctly validates inputs and that
 * validation errors are returned in the tool_result error format (correctable
 * by the model, not thrown as exceptions).
 *
 * Requirement: AGENT-04 — Tool inputs validated via Zod; invalid input returns correctable error to model
 */
import { describe, it, expect } from "vitest";

describe("AGENT-04 — Tool Zod validation → correctable error format", () => {
  it.todo("invalid tool input returns tool_result with type='error' not a thrown exception");

  it.todo("error message in tool_result describes which field is invalid and why");

  it.todo("valid input passes through Zod validation without error");

  it.todo("missing required field returns error specifying the field name");

  it.todo("wrong type for a field returns error with the field name and expected type");

  it.todo("extra unknown fields are stripped (strict: false) or rejected (strict: true) per tool schema");

  it.todo("tool registry exports all 11 read tools with valid input schemas");

  it.todo("tool registry exports all 11 write tools with valid input schemas");

  it.todo("each tool's execute function is callable and returns ToolResult shape");
});
