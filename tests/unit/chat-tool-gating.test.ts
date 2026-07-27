/**
 * tests/unit/chat-tool-gating.test.ts
 * Unit tests for the WS7.13/D-1 + WS12/D-2 chat tool-gating options on
 * getAiSdkTools(includeWriteTools, ctx, opts).
 *
 * Runs against the REAL tool registry (getToolDefinitions is a pure in-memory
 * build) — no LLM, no DB. Verifies:
 *   - writeTools "all" (default) keeps every read/meta/write tool — the
 *     workflow engine's existing call sites are byte-for-byte unchanged.
 *   - writeTools "propose-safe" returns exactly the three proposeSafe write
 *     tools and no other write tool.
 *   - excludeTools removes named tools (ask_user_clarification) regardless of
 *     group.
 */
import { describe, it, expect } from "vitest";
import { getAiSdkTools } from "@/lib/agent/llm/tools";
import {
  getToolDefinitions,
  READ_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  META_TOOL_NAMES,
  type AgentContext,
} from "@/lib/agent/tools/index";

const ctx: AgentContext = {
  userId: "00000000-0000-0000-0000-000000000001",
  automationLevel: "L2",
};

describe("getAiSdkTools — writeTools default ('all')", () => {
  it("returns every read, meta and write tool when includeWriteTools=true", () => {
    const tools = getAiSdkTools(true, ctx);
    const names = Object.keys(tools);

    for (const n of [...READ_TOOL_NAMES, ...META_TOOL_NAMES, ...WRITE_TOOL_NAMES]) {
      expect(names).toContain(n);
    }
    expect(names.length).toBe(
      READ_TOOL_NAMES.length + META_TOOL_NAMES.length + WRITE_TOOL_NAMES.length
    );
  });

  it("strips all write tools when includeWriteTools=false", () => {
    const tools = getAiSdkTools(false, ctx);
    const names = Object.keys(tools);

    for (const n of WRITE_TOOL_NAMES) {
      expect(names).not.toContain(n);
    }
    for (const n of [...READ_TOOL_NAMES, ...META_TOOL_NAMES]) {
      expect(names).toContain(n);
    }
  });
});

describe("getAiSdkTools — writeTools 'propose-safe' (D-1, WS7.13)", () => {
  it("returns exactly the proposeSafe write tools and no other write tool", () => {
    const registry = getToolDefinitions();
    const expectedProposeSafe = WRITE_TOOL_NAMES.filter(
      (n) => registry[n]?.proposeSafe === true
    );
    // Sanity: the three known propose-safe tools must be present in the registry.
    expect(expectedProposeSafe).toEqual(
      expect.arrayContaining([
        "shopify_optimize_product_description",
        "shopify_optimize_meta",
        "shopify_propose_restock",
      ])
    );
    expect(expectedProposeSafe).toHaveLength(3);

    const tools = getAiSdkTools(true, ctx, { writeTools: "propose-safe" });
    const names = Object.keys(tools);
    const writeNamesReturned = names.filter((n) => WRITE_TOOL_NAMES.includes(n));

    expect(writeNamesReturned.sort()).toEqual(expectedProposeSafe.sort());
    for (const n of [...READ_TOOL_NAMES, ...META_TOOL_NAMES]) {
      expect(names).toContain(n);
    }
  });

  it("returns no write tools when includeWriteTools=false, even with propose-safe requested", () => {
    const tools = getAiSdkTools(false, ctx, { writeTools: "propose-safe" });
    const names = Object.keys(tools);
    for (const n of WRITE_TOOL_NAMES) {
      expect(names).not.toContain(n);
    }
  });
});

describe("getAiSdkTools — excludeTools (D-2, WS12)", () => {
  it("removes ask_user_clarification when excluded, keeps every other meta tool", () => {
    expect(META_TOOL_NAMES).toContain("ask_user_clarification");

    const tools = getAiSdkTools(true, ctx, {
      writeTools: "propose-safe",
      excludeTools: ["ask_user_clarification"],
    });
    const names = Object.keys(tools);

    expect(names).not.toContain("ask_user_clarification");
    for (const n of META_TOOL_NAMES.filter((m) => m !== "ask_user_clarification")) {
      expect(names).toContain(n);
    }
  });

  it("excludeTools with no matches is a no-op", () => {
    const tools = getAiSdkTools(true, ctx, { excludeTools: ["not_a_real_tool"] });
    expect(Object.keys(tools).length).toBe(
      READ_TOOL_NAMES.length + META_TOOL_NAMES.length + WRITE_TOOL_NAMES.length
    );
  });
});
