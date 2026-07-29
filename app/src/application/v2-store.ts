import type { JourneyProjectionV1 } from "@somewhere/contracts";
import type {
  FeedbackCapabilityRecord,
  FeedbackCapabilityStore,
} from "../platform/feedback-capability-store";
import type {
  FeedbackPrompt,
  IdempotencyKeySource,
  JourneyCreateBody,
  JourneyMutation,
  ReactionBody,
  RecoveryGrant,
  RecoveryIntent,
  V2Api,
} from "./v2-api";
import { V2ApiError } from "./v2-api";

const FEEDBACK_AFTER_DUE_MS = 6 * 24 * 60 * 60 * 1_000 + 23 * 60 * 60 * 1_000;
const MAX_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export type V2StoreFailure = Readonly<{
  code: string;
  requestId?: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}>;

export type V2StoreSnapshot =
  | Readonly<{ status: "idle"; projection: null; failure: null }>
  | Readonly<{
      status: "busy" | "ready";
      projection: JourneyProjectionV1 | null;
      failure: null;
    }>
  | Readonly<{
      status: "conflict" | "failed";
      projection: JourneyProjectionV1 | null;
      failure: V2StoreFailure;
    }>;

export interface V2Store {
  snapshot(): V2StoreSnapshot;
  subscribe(listener: (snapshot: V2StoreSnapshot) => void): () => void;
  create(body: JourneyCreateBody): Promise<void>;
  refresh(): Promise<void>;
  mutate(mutation: JourneyMutation): Promise<void>;
  retry(): Promise<void>;
  deleteJourney(): Promise<void>;
  reset(): Promise<void>;
  requestRecovery(): Promise<RecoveryIntent>;
  confirmRecovery(
    intent: RecoveryIntent,
    constraints: JourneyCreateBody["constraints"],
    reviewedFields: readonly string[],
  ): Promise<RecoveryGrant>;
  eligibleFeedback(): Promise<FeedbackPrompt | null>;
  recordReaction(feedbackId: string, body: ReactionBody): Promise<void>;
}

export type V2StoreOptions = Readonly<{
  api: V2Api;
  feedbackCapabilities: FeedbackCapabilityStore;
  idempotencyKeys: IdempotencyKeySource;
  now?: () => number;
}>;

export function createV2Store(options: V2StoreOptions): V2Store {
  const now = options.now ?? Date.now;
  const listeners = new Set<(snapshot: V2StoreSnapshot) => void>();
  let current: V2StoreSnapshot = { status: "idle", projection: null, failure: null };
  let retryOperation: (() => Promise<void>) | null = null;

  function publish(next: V2StoreSnapshot): void {
    current = next;
    for (const listener of listeners) {
      listener(next);
    }
  }

  function projection(): JourneyProjectionV1 {
    if (current.projection === null) {
      throw new TypeError("A journey projection is required");
    }
    return current.projection;
  }

  async function run(operation: () => Promise<JourneyProjectionV1 | null>): Promise<void> {
    publish({ status: "busy", projection: current.projection, failure: null });
    try {
      const nextProjection = await operation();
      retryOperation = null;
      publish(
        nextProjection === null
          ? { status: "idle", projection: null, failure: null }
          : { status: "ready", projection: nextProjection, failure: null },
      );
    } catch (error) {
      await handleFailure(error);
    }
  }

  async function handleFailure(error: unknown): Promise<void> {
    if (error instanceof V2ApiError) {
      if (error.code === "session_expired") {
        options.api.clearVolatile();
      }
      if (error.code === "sequence_conflict" && current.projection !== null) {
        retryOperation = null;
        publish({
          status: "conflict",
          projection: await options.api.getJourney(current.projection.journeyId),
          failure: apiFailure(error),
        });
        return;
      }
      publish({ status: "failed", projection: current.projection, failure: apiFailure(error) });
      return;
    }
    publish({
      status: "failed",
      projection: current.projection,
      failure: { code: "protocol_error", retryable: false },
    });
  }

  async function saveArrival(
    feedbackCapability: FeedbackCapabilityRecord["feedbackCapability"],
    dueAt: number,
  ): Promise<void> {
    const expiresAt = Math.min(dueAt + FEEDBACK_AFTER_DUE_MS, now() + MAX_RETENTION_MS);
    await options.feedbackCapabilities.save({ feedbackCapability, dueAt, expiresAt });
  }

  async function mutateWithKey(
    mutation: JourneyMutation,
    key: string,
  ): Promise<JourneyProjectionV1> {
    const before = projection();
    const result = await options.api.mutateJourney(
      before.journeyId,
      before.sequence,
      key,
      mutation,
    );
    if (result.kind === "arrival") {
      await saveArrival(result.response.feedbackCapability, result.response.result.feedbackDueAt);
      return result.response.result;
    }
    return result.projection;
  }

  async function withFeedback<T>(
    operation: (record: FeedbackCapabilityRecord) => Promise<T>,
  ): Promise<T | null> {
    const record = await options.feedbackCapabilities.load();
    if (record === null) {
      return null;
    }
    try {
      return await operation(record);
    } catch (error) {
      if (
        error instanceof V2ApiError &&
        (error.code === "capability_expired" || error.code === "capability_invalid")
      ) {
        await options.feedbackCapabilities.clear();
      }
      throw error;
    }
  }

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async create(body) {
      const key = options.idempotencyKeys.next();
      const operation = () => options.api.createJourney(body, key);
      retryOperation = () => run(operation);
      await run(operation);
    },
    async refresh() {
      const active = projection();
      await run(() => options.api.getJourney(active.journeyId));
    },
    async mutate(mutation) {
      const key = options.idempotencyKeys.next();
      const operation = () => mutateWithKey(mutation, key);
      retryOperation = () => run(operation);
      await run(operation);
    },
    async retry() {
      if (retryOperation === null) {
        throw new TypeError("There is no retryable operation");
      }
      await retryOperation();
    },
    async deleteJourney() {
      const active = projection();
      const key = options.idempotencyKeys.next();
      const operation = async () => {
        await options.api.deleteJourney(active.journeyId, active.sequence, key);
        await options.feedbackCapabilities.clear();
        options.api.clearVolatile();
        return null;
      };
      retryOperation = () => run(operation);
      await run(operation);
    },
    async reset() {
      await options.feedbackCapabilities.clear();
      options.api.clearVolatile();
      retryOperation = null;
      publish({ status: "idle", projection: null, failure: null });
    },
    async requestRecovery() {
      const active = projection();
      const result = await options.api.requestRecovery(
        active.journeyId,
        active.sequence,
        options.idempotencyKeys.next(),
      );
      return result;
    },
    async confirmRecovery(intent, constraints, reviewedFields) {
      const active = projection();
      const result = await options.api.confirmRecovery(
        active.journeyId,
        active.sequence,
        options.idempotencyKeys.next(),
        { constraints, recoveryIntentId: intent.recoveryIntentId, reviewedFields },
      );
      return result;
    },
    eligibleFeedback() {
      return withFeedback((record) => options.api.eligibleFeedback(record.feedbackCapability));
    },
    async recordReaction(feedbackId, body) {
      const recorded = await withFeedback((record) =>
        options.api.recordReaction(
          record.feedbackCapability,
          feedbackId,
          options.idempotencyKeys.next(),
          body,
        ),
      );
      if (recorded !== null) {
        await options.feedbackCapabilities.clear();
      }
    },
  };
}

function apiFailure(error: V2ApiError): V2StoreFailure {
  return {
    code: error.code,
    retryable: error.retryable,
    ...(error.requestId === "" ? {} : { requestId: error.requestId }),
    ...(error.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: error.retryAfterSeconds }),
  };
}
