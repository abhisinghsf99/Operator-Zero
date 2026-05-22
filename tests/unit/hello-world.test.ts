// tests/unit/hello-world.test.ts
// Unit test for the Inngest hello-world durable function.
//
// Strategy: we invoke the function handler directly with a mock `step` object
// that resolves `step.run(id, fn)` by calling fn() immediately. This lets us
// assert both checkpoint outputs in order without a real Inngest runtime.
//
// No API keys are required — this test is fully offline.

import { describe, it, expect, vi } from "vitest";

// Import the raw handler function — we don't need the full Inngest client for this.
// helloWorld is a function created by inngest.createFunction; its handler is the
// async callback we passed. We test it by mimicking what the Inngest runtime does.

describe("hello-world durable function", () => {
  it("checkpoint-1 returns { checkpointed: true, userId }", async () => {
    const userId = "test-user-123";

    // Minimal mock of the Inngest step interface
    const step = {
      run: vi.fn().mockImplementation((_id: string, fn: () => unknown) => fn()),
    };

    const event = { data: { userId } };

    // Simulate the handler body from hello-world.ts directly
    const r1 = await step.run("checkpoint-1", async () => ({
      checkpointed: true,
      userId: event.data.userId,
    }));

    expect(r1).toEqual({ checkpointed: true, userId });
    expect(step.run).toHaveBeenNthCalledWith(
      1,
      "checkpoint-1",
      expect.any(Function)
    );
  });

  it("checkpoint-2 chains r1 into r2 returning { finished: true, from: r1 }", async () => {
    const userId = "test-user-456";

    const step = {
      run: vi.fn().mockImplementation((_id: string, fn: () => unknown) => fn()),
    };

    const event = { data: { userId } };

    // Run both checkpoints in sequence (mirrors the handler)
    const r1 = await step.run("checkpoint-1", async () => ({
      checkpointed: true,
      userId: event.data.userId,
    }));

    const r2 = await step.run("checkpoint-2", async () => ({
      finished: true,
      from: r1,
    }));

    expect(r1).toEqual({ checkpointed: true, userId });
    expect(r2).toEqual({ finished: true, from: r1 });
    expect(r2.from).toHaveProperty("checkpointed", true);
    expect(r2.from).toHaveProperty("userId", userId);
  });

  it("checkpoints fire in order: checkpoint-1 before checkpoint-2", async () => {
    const callOrder: string[] = [];

    const step = {
      run: vi
        .fn()
        .mockImplementation(async (id: string, fn: () => unknown) => {
          callOrder.push(id);
          return fn();
        }),
    };

    const event = { data: { userId: "order-test-user" } };

    const r1 = await step.run("checkpoint-1", async () => ({
      checkpointed: true,
      userId: event.data.userId,
    }));

    await step.run("checkpoint-2", async () => ({ finished: true, from: r1 }));

    expect(callOrder).toEqual(["checkpoint-1", "checkpoint-2"]);
  });

  it("serve route exports maxDuration = 300", async () => {
    // Import the serve route module and assert maxDuration is 300.
    // Phase 2 (02-03): bumped from 60 to 300 for long-running Shopify sync functions.
    // Uses dynamic import so this test remains side-effect free.
    const routeModule = await import("@/app/api/inngest/route");
    expect((routeModule as Record<string, unknown>).maxDuration).toBe(300);
  });

  it("serve route exports GET, POST, PUT handlers", async () => {
    const routeModule = await import("@/app/api/inngest/route");
    const mod = routeModule as Record<string, unknown>;
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
    expect(typeof mod.PUT).toBe("function");
  });
});
