import {
  FeedbackCapabilitySchema,
  FeedbackIdSchema,
  type JourneyProjectionV1,
  JourneyProjectionV1Schema,
  PROJECTION_EXAMPLES_V1,
  RecoveryCapabilitySchema,
  RequestIdSchema,
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
  | Readonly<{ kind: "reaction"; capability: string; feedbackId: string; key: string }>
  | Readonly<{ kind: "request-recovery"; journeyId: string; expectedSequence: number; key: string }>
  | Readonly<{
      kind: "confirm-recovery";
      journeyId: string;
      expectedSequence: number;
      key: string;
      reviewedFields: readonly string[];
    }>;

function example(phase: string, revealed: boolean): JourneyProjectionV1 {
  const found = PROJECTION_EXAMPLES_V1.find(
    (candidate) =>
      candidate.phase === phase &&
      candidate.phase !== "finding" &&
      candidate.phase !== "expired" &&
      candidate.revealed === revealed,
  );
  if (found === undefined) {
    throw new TypeError(`Missing deterministic ${phase} projection`);
  }
  if (found.phase === "finding" || found.phase === "expired") {
    throw new TypeError(`Deterministic ${phase} projection cannot be localized`);
  }
  const localized = JourneyProjectionV1Schema.parse({
    ...found,
    disclosure: {
      ...found.disclosure,
      representativeCategories: ["카페"],
    },
    ...(revealed
      ? {
          reveal: {
            name: "조용한 정원",
            address: "서울 성동구의 한 골목",
          },
        }
      : {}),
  });
  if (phase !== "following" && phase !== "near") {
    return localized;
  }
  return JourneyProjectionV1Schema.parse({
    ...localized,
    guidance: {
      kind: "route",
      encodedPolyline:
        "W1sxMjcuMDM5NjE3MiwzNy41NTQwMjcwMTYwNTkxOF0sWzEyNy4wMzk2MTcyLDM3LjU0NTAzMzhdXQ",
      routeDigest: "sha256:7236ff6f55811002732e754e977ca7b71f743af4382f57b53d753eb16c25bba8",
      routeVersion: "e2e-route-v1",
      expiresAt: 1_800_000,
    },
  });
}

export class DeterministicV2Api implements V2Api {
  readonly calls: V2ApiCall[] = [];
  projection: JourneyProjectionV1;
  mutationResult: JourneyMutationResult | null = null;
  failure: Error | null = null;
  volatileClears = 0;
  readonly autoTransition: boolean;

  constructor(projection: JourneyProjectionV1, autoTransition = false) {
    this.projection = projection;
    this.autoTransition = autoTransition;
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
    if (this.autoTransition) {
      this.projection = example("ready", false);
    }
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
    if (this.autoTransition) {
      const revealed =
        this.projection.phase !== "finding" &&
        this.projection.phase !== "expired" &&
        this.projection.revealed;
      switch (mutation.action) {
        case "arrival": {
          const arrived = JourneyProjectionV1Schema.parse({
            ...example("arrived", revealed),
            feedbackDueAt: Date.now() + 300,
          });
          if (arrived.phase !== "arrived") {
            throw new TypeError("Deterministic arrival projection is invalid");
          }
          this.projection = arrived;
          return {
            kind: "arrival",
            response: {
              contractVersion: 1,
              feedbackCapability: FeedbackCapabilitySchema.parse(`fb_v1.${"A".repeat(43)}`),
              requestId: RequestIdSchema.parse(`req_v1.${"A".repeat(22)}`),
              result: arrived,
            },
          };
        }
        case "commit":
        case "continue":
        case "route-recover":
          this.projection = example("following", revealed);
          break;
        case "reveal":
          this.projection = example(this.projection.phase, true);
          break;
        case "stop-request":
          this.projection = example("paused", revealed);
          break;
        case "confirm-stop":
          this.projection = example("stopped", revealed);
          break;
        case "stop-reason":
          this.projection = example("completed", revealed);
          break;
      }
    }
    return this.respond(this.mutationResult ?? { kind: "projection", projection: this.projection });
  }

  async deleteJourney(journeyId: string, expectedSequence: number, key: string): Promise<void> {
    this.calls.push({ kind: "delete", journeyId, expectedSequence, key });
    this.respond(undefined);
  }

  async requestRecovery(
    journeyId: string,
    expectedSequence: number,
    key: string,
  ): Promise<RecoveryIntent> {
    this.calls.push({ kind: "request-recovery", journeyId, expectedSequence, key });
    return {
      contractVersion: 1,
      expiresAt: 2_000,
      recoveryIntentId: `ri_v1.${"A".repeat(22)}`,
      requiredReviewFields: ["constraints"],
    };
  }

  async confirmRecovery(
    journeyId: string,
    expectedSequence: number,
    key: string,
    input: Readonly<{ reviewedFields: readonly string[] }>,
  ): Promise<RecoveryGrant> {
    this.calls.push({
      kind: "confirm-recovery",
      journeyId,
      expectedSequence,
      key,
      reviewedFields: input.reviewedFields,
    });
    return {
      contractVersion: 1,
      expiresAt: 2_000,
      previousDestinationExcluded: true,
      recoveryCapability: RecoveryCapabilitySchema.parse(`rc_v1.${"A".repeat(43)}`),
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
