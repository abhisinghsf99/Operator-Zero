// lib/inngest/functions/hello-world.ts
// Source: https://www.inngest.com/docs/getting-started/nextjs-quick-start
// Pattern 5 (RESEARCH.md): Durable function with two sequential step.run checkpoints
// and a per-user concurrency key so multiple triggers for the same user are serialized.
//
// Inngest 4.x API: createFunction takes 2 args — (options, handler).
// The event trigger is specified via `triggers` inside the options object.
import { inngest } from "../client";

export const helloWorld = inngest.createFunction(
  {
    id: "hello-world",
    triggers: [{ event: "dev/hello.world" }],
    concurrency: {
      limit: 1,
      // Serializes durable runs per user — satisfies INFRA-05 + AUTH-06 (T-1-03-03).
      key: "event.data.userId",
    },
    retries: 3,
  },
  async ({ event, step }) => {
    // checkpoint-1: emit a checkpointed marker with the userId from the event.
    const r1 = await step.run("checkpoint-1", async () => ({
      checkpointed: true,
      userId: event.data.userId as string,
    }));

    // checkpoint-2: chain r1 into r2, proving step-to-step state passing works.
    const r2 = await step.run("checkpoint-2", async () => ({
      finished: true,
      from: r1,
    }));

    return r2;
  }
);
