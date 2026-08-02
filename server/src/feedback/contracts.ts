import { z } from "zod";

export const feedbackRowSchema = z
  .object({
    capability_digest: z.string().length(64),
    consent_binding_digest: z.string().length(64).nullable(),
    consent_granted: z.union([z.literal(0), z.literal(1)]),
    consumed_at: z.number().nullable(),
    consumption_digest: z.string().length(64).nullable(),
    due_at: z.number().int().positive(),
    eligibility_state: z.enum(["eligible", "consumed", "revoked", "expired"]),
    expires_at: z.number().int().positive(),
    feedback_id: z.string(),
    journey_hmac_digest: z.string().length(64),
    prompt_version: z.string(),
    write_epoch: z.number().int().positive(),
  })
  .strict()
  .readonly();

export const outcomeSchema = z
  .object({
    feedback_id: z.string(),
    idempotency_digest: z.string().length(64),
    request_digest: z.string().length(64),
    write_epoch: z.number().int().positive(),
  })
  .strict()
  .readonly();

export type FeedbackEligibility = z.infer<typeof feedbackRowSchema>;
export type FeedbackReaction =
  | Readonly<{ kind: "recorded"; feedbackId: string }>
  | Readonly<{ kind: "replay"; feedbackId: string }>
  | Readonly<{
      kind:
        | "capability_invalid"
        | "capability_expired"
        | "consent_required"
        | "idempotency_conflict"
        | "not_due";
    }>;

export type FeedbackConsumeInput = Readonly<{
  capabilityDigest: string;
  feedbackId: string;
  idempotencyDigest: string;
  now: number;
  reaction: "dislike" | "like" | "love" | "did_not_visit";
  requestDigest?: string;
}>;

export type FeedbackIssueInput = Readonly<{
  capabilityDigest: string;
  bindingDigest?: string;
  consentGranted: boolean;
  dueAt: number;
  expiresAt: number;
  feedbackId: string;
  journeyDigest: string;
}>;
