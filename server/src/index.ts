import { AsyncD1Repository } from "./async/repository";
import { consumeQueueBatch, reconcileScheduledWork } from "./async/worker";
import { parseDeploymentEnvironment } from "./environment";
import { handleRequest } from "./http";

export { JourneyDurableObject } from "./journey/durable-object";

const worker = {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    parseDeploymentEnvironment(env);
    return handleRequest(request, env);
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    parseDeploymentEnvironment(env);
    await consumeQueueBatch({
      batch,
      dlq: env.EVENTS_DLQ,
      now: Date.now(),
      repository: new AsyncD1Repository(env.DB),
    });
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    parseDeploymentEnvironment(env);
    ctx.waitUntil(
      reconcileScheduledWork({
        now: Date.now(),
        queue: env.EVENTS_QUEUE,
        repository: new AsyncD1Repository(env.DB),
      }),
    );
  },
} satisfies ExportedHandler<Env>;

export default worker;
