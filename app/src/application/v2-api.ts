import {
  type ArrivalBodyV1Schema,
  type ArrivalMutationResponseV1,
  CsrfTokenSchema,
  ErrorResponseV1Schema,
  type FeedbackPromptV1Schema,
  type JourneyCreateBodyV1Schema,
  type JourneyProjectionV1,
  type ReactionBodyV1Schema,
  type ReactionRecordedV1,
  RecoveryCapabilitySchema,
  RecoveryIntentIdSchema,
} from "@somewhere/contracts";
import { z } from "zod";

export type JourneyCreateBody = z.infer<typeof JourneyCreateBodyV1Schema>;
export type ArrivalBody = z.infer<typeof ArrivalBodyV1Schema>;
export type ReactionBody = z.infer<typeof ReactionBodyV1Schema>;
export type FeedbackPrompt = z.infer<typeof FeedbackPromptV1Schema>;

export const V2SessionSchema = z
  .object({
    contractVersion: z.literal(1),
    csrfToken: CsrfTokenSchema,
    csrfExpiresAt: z.number().int().safe().nonnegative(),
    sessionExpiresAt: z.number().int().safe().nonnegative(),
  })
  .strict();
export const RecoveryIntentSchema = z
  .object({
    contractVersion: z.literal(1),
    expiresAt: z.number().int().safe().nonnegative(),
    recoveryIntentId: RecoveryIntentIdSchema,
    requiredReviewFields: z.array(z.string().min(1)).readonly(),
  })
  .strict();
export const RecoveryGrantSchema = z
  .object({
    contractVersion: z.literal(1),
    expiresAt: z.number().int().safe().nonnegative(),
    previousDestinationExcluded: z.literal(true),
    recoveryCapability: RecoveryCapabilitySchema,
  })
  .strict();

export type V2Session = Readonly<{
  csrfToken: string;
  csrfExpiresAt: number;
  sessionExpiresAt: number;
}>;

export type JourneyMutation =
  | Readonly<{ action: "commit" | "reveal" | "stop-request"; body: { contractVersion: 1 } }>
  | Readonly<{
      action: "continue" | "confirm-stop";
      body: { contractVersion: 1; stopConfirmationId: string };
    }>
  | Readonly<{
      action: "stop-reason";
      body: {
        contractVersion: 1;
        reason:
          | "safety-concern"
          | "route-or-sensor"
          | "hard-condition"
          | "venue-situation"
          | "changed-mind"
          | "schedule-changed"
          | "skip";
        reasonPolicyVersion: "stop-reasons-v1";
      };
    }>
  | Readonly<{
      action: "route-recover";
      body: {
        choice: "recalibrate" | "reroute" | "cached-route" | "external-map";
        contractVersion: 1;
      };
    }>
  | Readonly<{ action: "arrival"; body: ArrivalBody }>;

export type JourneyMutationResult =
  | Readonly<{ kind: "projection"; projection: JourneyProjectionV1 }>
  | Readonly<{ kind: "arrival"; response: ArrivalMutationResponseV1 }>;

export type RecoveryIntent = Readonly<{
  contractVersion: 1;
  expiresAt: number;
  recoveryIntentId: string;
  requiredReviewFields: readonly string[];
}>;

export type RecoveryGrant = Readonly<{
  contractVersion: 1;
  expiresAt: number;
  previousDestinationExcluded: true;
  recoveryCapability: string;
}>;

export interface V2Api {
  bootstrapSession(): Promise<V2Session>;
  clearVolatile(): void;
  createJourney(body: JourneyCreateBody, idempotencyKey: string): Promise<JourneyProjectionV1>;
  getJourney(journeyId: string): Promise<JourneyProjectionV1>;
  mutateJourney(
    journeyId: string,
    expectedSequence: number,
    idempotencyKey: string,
    mutation: JourneyMutation,
  ): Promise<JourneyMutationResult>;
  deleteJourney(journeyId: string, expectedSequence: number, idempotencyKey: string): Promise<void>;
  requestRecovery(
    journeyId: string,
    expectedSequence: number,
    idempotencyKey: string,
  ): Promise<RecoveryIntent>;
  confirmRecovery(
    journeyId: string,
    expectedSequence: number,
    idempotencyKey: string,
    input: Readonly<{
      constraints: JourneyCreateBody["constraints"];
      recoveryIntentId: string;
      reviewedFields: readonly string[];
    }>,
  ): Promise<RecoveryGrant>;
  eligibleFeedback(feedbackCapability: string): Promise<FeedbackPrompt | null>;
  recordReaction(
    feedbackCapability: string,
    feedbackId: string,
    idempotencyKey: string,
    body: ReactionBody,
  ): Promise<ReactionRecordedV1>;
}

export class V2ApiError extends Error {
  readonly name = "V2ApiError";
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: number,
    code: string,
    requestId: string,
    retryable: boolean,
    retryAfterSeconds?: number,
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class V2ProtocolError extends Error {
  readonly name = "V2ProtocolError";
}

export function apiErrorFrom(status: number, value: unknown): V2ApiError {
  const parsed = ErrorResponseV1Schema.safeParse(value);
  if (!parsed.success) {
    throw new V2ProtocolError("API returned an invalid error contract");
  }
  return new V2ApiError(
    status,
    parsed.data.error.code,
    parsed.data.error.requestId,
    parsed.data.error.retryable,
    parsed.data.error.retryAfterSeconds,
  );
}

export interface IdempotencyKeySource {
  next(): string;
}

export function createIdempotencyKeySource(
  randomBytes: () => Uint8Array<ArrayBuffer>,
): IdempotencyKeySource {
  return {
    next() {
      let binary = "";
      for (const byte of randomBytes()) {
        binary += String.fromCharCode(byte);
      }
      const encoded = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
      return `ik_v1.${encoded}`;
    },
  };
}

export function mutationPath(action: JourneyMutation["action"]): string {
  switch (action) {
    case "arrival":
    case "commit":
    case "reveal":
      return action;
    case "confirm-stop":
      return "stop/confirm";
    case "continue":
      return "stop/cancel";
    case "route-recover":
      return "route/recover";
    case "stop-reason":
      return "stop/reason";
    case "stop-request":
      return "stop/request";
    default:
      return assertNever(action);
  }
}

function assertNever(value: never): never {
  throw new V2ProtocolError(`Unknown mutation action: ${String(value)}`);
}
