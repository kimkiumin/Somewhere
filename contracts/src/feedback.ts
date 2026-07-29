import { z } from "zod";
import {
  FeedbackCapabilitySchema,
  FeedbackIdSchema,
  JourneyProjectionV1Schema,
  RequestIdSchema,
} from "./journey";

const ArrivedProjectionV1Schema = JourneyProjectionV1Schema.refine(
  (projection) => projection.phase === "arrived",
);

export const ArrivalMutationResponseV1Schema = z
  .object({
    contractVersion: z.literal(1),
    feedbackCapability: FeedbackCapabilitySchema,
    requestId: RequestIdSchema,
    result: ArrivedProjectionV1Schema,
  })
  .strict()
  .readonly();

export const ReactionBodyV1Schema = z
  .object({
    contractVersion: z.literal(1),
    reaction: z.enum(["dislike", "like", "love", "did_not_visit"]),
  })
  .strict()
  .readonly();

export const ReactionRecordedV1Schema = z
  .object({
    contractVersion: z.literal(1),
    feedbackId: FeedbackIdSchema,
    recorded: z.literal(true),
  })
  .strict()
  .readonly();

export type ArrivalMutationResponseV1 = z.infer<typeof ArrivalMutationResponseV1Schema>;
export type ReactionBodyV1 = z.infer<typeof ReactionBodyV1Schema>;
export type ReactionRecordedV1 = z.infer<typeof ReactionRecordedV1Schema>;
