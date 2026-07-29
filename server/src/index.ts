import { AsyncD1Repository } from "./async/repository";
import { consumeQueueBatch, reconcileScheduledWork } from "./async/worker";
import { parseDeploymentEnvironment } from "./environment";
import { handleRequest } from "./http";
import { enqueueLocalQueueProbes, recordLocalDlqDelivery } from "./operations/local-runtime-probe";
import {
  type OperationsAuthorityBindings,
  runOperationsAuthorityCycle,
} from "./operations/production-authority";
import { authorizeBackgroundWork } from "./operations/runtime-state-repository";

export { JourneyDurableObject } from "./journey/durable-object";

const worker = {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    parseDeploymentEnvironment(env);
    return handleRequest(request, env);
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    parseDeploymentEnvironment(env);
    if (env.ENVIRONMENT === "local" && batch.queue === "somewhere-events-dlq-local") {
      await recordLocalDlqDelivery(batch, env.DB, Date.now());
      return;
    }
    const authorization = await authorizeBackgroundWork(env.DB, env.ENVIRONMENT, "drain");
    if (!authorization.allowed) {
      throw new BackgroundWriteFencedError();
    }
    await consumeQueueBatch({
      batch,
      dlq: env.EVENTS_DLQ,
      now: Date.now(),
      repository: new AsyncD1Repository(env.DB, authorization.writeEpoch),
      ...(env.ENVIRONMENT === "local" ? { retryDelaySeconds: 1 } : {}),
    });
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    parseDeploymentEnvironment(env);
    ctx.waitUntil(
      (async () => {
        const now = Date.now();
        if (env.ENVIRONMENT === "local") {
          await enqueueLocalQueueProbes(env.EVENTS_QUEUE, now);
        } else {
          const authorityReady = await runOperationsAuthorityCycle(
            env as unknown as OperationsAuthorityBindings,
            now,
          );
          if (!authorityReady) {
            return;
          }
        }
        const authorization = await authorizeBackgroundWork(env.DB, env.ENVIRONMENT, "producer");
        if (!authorization.allowed) {
          return;
        }
        await reconcileScheduledWork({
          now,
          queue: env.EVENTS_QUEUE,
          repository: new AsyncD1Repository(env.DB, authorization.writeEpoch),
        });
      })(),
    );
  },
} satisfies ExportedHandler<Env>;

export default worker;

class BackgroundWriteFencedError extends Error {
  override readonly name = "BackgroundWriteFencedError";

  constructor() {
    super("Background queue drain is fenced");
  }
}
