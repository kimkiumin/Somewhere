import {
  FeedbackCapabilitySchema,
  FeedbackIdSchema,
  type JourneyProjectionV1,
} from "@somewhere/contracts";
import type {
  FeedbackPrompt,
  JourneyCreateBody,
  JourneyMutation,
  JourneyMutationResult,
  ReactionBody,
  RecoveryGrant,
  RecoveryIntent,
  V2Api,
  V2Session,
} from "../application/v2-api";
import type {
  FeedbackCapabilityRecord,
  FeedbackCapabilityStore,
} from "../platform/feedback-capability-store";

export type V2ApiCall =
  | Readonly<{ kind: "create"; body: JourneyCreateBody; key: string }>
  | Readonly<{
      kind: "mutate";
      journeyId: string;
      expectedSequence: number;
      key: string;
      mutation: JourneyMutation;
    }>
  | Readonly<{ kind: "get"; journeyId: string }>
  | Readonly<{ kind: "delete"; journeyId: string; expectedSequence: number; key: string }>
  | Readonly<{ kind: "feedback"; capability: string }>
  | Readonly<{ kind: "reaction"; capability: string; feedbackId: string; key: string }>;

export class DeterministicV2Api implements V2Api {
  readonly calls: V2ApiCall[] = [];
  projection: JourneyProjectionV1;
  mutationResult: JourneyMutationResult | null = null;
  failure: Error | null = null;
  volatileClears = 0;

  constructor(projection: JourneyProjectionV1) {
    this.projection = projection;
  }

  async bootstrapSession(): Promise<V2Session> {
    return {
      csrfToken: `csrf_v1.${"A".repeat(43)}`,
      csrfExpiresAt: 2_000,
      sessionExpiresAt: 3_000,
    };
  }

  clearVolatile(): void {
    this.volatileClears += 1;
  }

  async createJourney(body: JourneyCreateBody, key: string): Promise<JourneyProjectionV1> {
    this.calls.push({ kind: "create", body, key });
    return this.respond(this.projection);
  }

  async getJourney(journeyId: string): Promise<JourneyProjectionV1> {
    this.calls.push({ kind: "get", journeyId });
    return this.projection;
  }

  async mutateJourney(
    journeyId: string,
    expectedSequence: number,
    key: string,
    mutation: JourneyMutation,
  ): Promise<JourneyMutationResult> {
    this.calls.push({ kind: "mutate", journeyId, expectedSequence, key, mutation });
    return this.respond(this.mutationResult ?? { kind: "projection", projection: this.projection });
  }

  async deleteJourney(journeyId: string, expectedSequence: number, key: string): Promise<void> {
    this.calls.push({ kind: "delete", journeyId, expectedSequence, key });
    this.respond(undefined);
  }

  async requestRecovery(): Promise<RecoveryIntent> {
    return {
      contractVersion: 1,
      expiresAt: 2_000,
      recoveryIntentId: `ri_v1.${"A".repeat(22)}`,
      requiredReviewFields: ["constraints"],
    };
  }

  async confirmRecovery(): Promise<RecoveryGrant> {
    return {
      contractVersion: 1,
      expiresAt: 2_000,
      previousDestinationExcluded: true,
      recoveryCapability: `rc_v1.${"A".repeat(43)}`,
    };
  }

  async eligibleFeedback(capability: string): Promise<FeedbackPrompt | null> {
    this.calls.push({ kind: "feedback", capability });
    this.respond(undefined);
    return {
      actions: ["dislike", "like", "love", "did_not_visit"],
      contractVersion: 1,
      dueAt: 1_000,
      expiresAt: 2_000,
      feedbackId: FeedbackIdSchema.parse(`fid_v1.${"A".repeat(22)}`),
      promptVersion: "feedback-v1",
    };
  }

  async recordReaction(capability: string, feedbackId: string, key: string, _body: ReactionBody) {
    this.calls.push({ kind: "reaction", capability, feedbackId, key });
    this.respond(undefined);
    return {
      contractVersion: 1 as const,
      feedbackId: FeedbackIdSchema.parse(feedbackId),
      recorded: true as const,
    };
  }

  private respond<T>(value: T): T {
    if (this.failure !== null) {
      const failure = this.failure;
      this.failure = null;
      throw failure;
    }
    return value;
  }
}

export class MemoryFeedbackCapabilityStore implements FeedbackCapabilityStore {
  record: FeedbackCapabilityRecord | null = null;
  clears = 0;

  async load(): Promise<FeedbackCapabilityRecord | null> {
    return this.record;
  }

  async save(value: FeedbackCapabilityRecord): Promise<void> {
    this.record = value;
  }

  async clear(): Promise<void> {
    this.record = null;
    this.clears += 1;
  }
}

export function feedbackRecord(dueAt = 1_000, expiresAt = 2_000): FeedbackCapabilityRecord {
  return {
    feedbackCapability: FeedbackCapabilitySchema.parse(`fb_v1.${"A".repeat(43)}`),
    dueAt,
    expiresAt,
  };
}
