/**
 * tests/unit/seed-registry.test.ts
 * WS1 registry-conformance guard — the regression test the plan requires.
 *
 * Fails loudly if:
 *   - any seeded workflow step (lib/demo/seed.ts DEMO_WORKFLOW_DEFS) names a
 *     tool that is not in the live tool registry, or its params fail that
 *     tool's Zod schema;
 *   - the seeded chat workflow_plan block (DEMO_CHAT_PLAN_STEPS) does the same;
 *   - any onboarding starter workflow definition
 *     (app/onboarding/actions.ts STARTER_WORKFLOW_DEFINITIONS) does the same.
 *
 * Pure — imports the exported definition tables directly, no DB access.
 */
import { describe, it, expect } from "vitest";
import { getToolDefinitions } from "@/lib/agent/tools";
import { DEMO_WORKFLOW_DEFS, DEMO_CHAT_PLAN_STEPS } from "@/lib/demo/seed";
import { STARTER_WORKFLOW_DEFINITIONS } from "@/app/onboarding/actions";

const registry = getToolDefinitions();

/**
 * assertStepValid — fail with a message naming the offending workflow, step
 * id, and tool (per the plan's "failure messages must name..." requirement).
 */
function assertStepValid(label: string, tool: string, params: unknown): void {
  const toolDef = registry[tool];
  expect(
    toolDef,
    `${label}: tool "${tool}" is not in the live tool registry (lib/agent/tools).`
  ).toBeDefined();
  if (!toolDef) return;

  const parsed = toolDef.inputSchema.safeParse(params);
  expect(
    parsed.success,
    `${label}: params for tool "${tool}" failed schema validation — ${
      parsed.success ? "" : parsed.error.message
    }`
  ).toBe(true);
}

describe("WS1 — seeded demo workflows reference real tools with valid params", () => {
  it("every DEMO_WORKFLOW_DEFS step names a registry tool with schema-valid params", () => {
    expect(DEMO_WORKFLOW_DEFS.length).toBeGreaterThan(0);
    for (const wfDef of DEMO_WORKFLOW_DEFS) {
      const [name, , , , , , , steps] = wfDef;
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        const [stepId, , tool, params] = step;
        assertStepValid(`workflow "${name}" step "${stepId}"`, tool, params);
      }
    }
  });

  it("every DEMO_CHAT_PLAN_STEPS step names a registry tool with schema-valid params", () => {
    expect(DEMO_CHAT_PLAN_STEPS.length).toBeGreaterThan(0);
    for (const step of DEMO_CHAT_PLAN_STEPS) {
      assertStepValid(`chat workflow_plan step "${step.id}"`, step.tool, step.params);
    }
  });
});

describe("WS11 — onboarding starter workflows reference real tools with valid params", () => {
  it("every STARTER_WORKFLOW_DEFINITIONS step names a registry tool with schema-valid params", () => {
    const domains = Object.keys(STARTER_WORKFLOW_DEFINITIONS);
    expect(domains.length).toBeGreaterThan(0);
    for (const domain of domains) {
      const def =
        STARTER_WORKFLOW_DEFINITIONS[
          domain as keyof typeof STARTER_WORKFLOW_DEFINITIONS
        ];
      expect(def.steps.length).toBeGreaterThan(0);
      for (const step of def.steps) {
        assertStepValid(
          `onboarding starter "${domain}" step "${step.id}"`,
          step.tool,
          step.params
        );
      }
    }
  });

  it("no starter step references a concrete product/variant GID (real stores have different GIDs)", () => {
    for (const [domain, def] of Object.entries(STARTER_WORKFLOW_DEFINITIONS)) {
      for (const step of def.steps) {
        const paramsJson = JSON.stringify(step.params);
        expect(
          paramsJson,
          `onboarding starter "${domain}" step "${step.id}" references a concrete gid://shopify GID — starters must be GID-free.`
        ).not.toMatch(/gid:\/\/shopify\//);
      }
    }
  });
});
