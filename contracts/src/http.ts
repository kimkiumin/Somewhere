import { z } from "zod";
import { FeedbackIdSchema, RequestIdSchema } from "./journey";

export const PUBLIC_ERROR_ROWS = [
  [400, "invalid_request", false],
  [401, "session_expired", false],
  [403, "request_forbidden", false],
  [403, "consent_required", false],
  [404, "not_found", false],
  [404, "capability_invalid", false],
  [405, "method_not_allowed", false],
  [409, "invalid_transition", false],
  [409, "sequence_conflict", true],
  [409, "idempotency_conflict", false],
  [409, "recovery_review_required", false],
  [409, "recovery_not_allowed", false],
  [410, "journey_expired", false],
  [410, "capability_expired", false],
  [413, "payload_too_large", false],
  [415, "unsupported_media_type", false],
  [422, "schema_invalid", false],
  [422, "unsupported_constraint", false],
  [422, "no_fit", false],
  [422, "policy_updated", false],
  [422, "invalid_arrival_evidence", false],
  [429, "rate_limited", true],
  [503, "provider_unavailable", true],
  [503, "route_unavailable", true],
  [503, "service_unavailable", true],
] as const;

export const PublicErrorCodeSchema = z.enum(PUBLIC_ERROR_ROWS.map((row) => row[1]));
const ErrorBaseSchema = z.object({
  code: PublicErrorCodeSchema,
  message: z.string().min(1).max(160),
  requestId: RequestIdSchema,
  retryable: z.boolean(),
}).strict();
const ErrorWithRetrySchema = ErrorBaseSchema.extend({
  retryable: z.literal(true),
  retryAfterSeconds: z.number().int().min(1).max(300),
}).strict();
const ErrorWithoutRetrySchema = ErrorBaseSchema.extend({
  retryAfterSeconds: z.never().optional(),
}).strict();
export const ErrorResponseV1Schema = z.object({
  contractVersion: z.literal(1),
  error: z.union([ErrorWithRetrySchema, ErrorWithoutRetrySchema]),
}).strict().readonly();

export const ENDPOINT_ROWS = [
  ["GET", "/health", [200, 429, 503], 0],
  ["GET", "/session", [200, 429, 503], 0],
  ["POST", "/journeys", [201, 202, 400, 401, 403, 409, 413, 415, 422, 429, 503], 4096],
  ["GET", "/journeys/:journeyId", [200, 401, 404, 410, 429, 503], 0],
  ["DELETE", "/journeys/:journeyId", [204, 400, 401, 403, 404, 409, 410, 415, 503], 0],
  ["POST", "/journeys/:journeyId/commit", [200, 400, 401, 403, 404, 409, 410, 413, 415, 422, 503], 1024],
  ["POST", "/journeys/:journeyId/reveal", [200, 400, 401, 403, 404, 409, 410, 413, 415, 503], 1024],
  ["POST", "/journeys/:journeyId/stop/request", [200, 400, 401, 403, 404, 409, 410, 413, 415, 503], 1024],
  ["POST", "/journeys/:journeyId/stop/cancel", [200, 400, 401, 403, 404, 409, 410, 413, 415, 503], 1024],
  ["POST", "/journeys/:journeyId/stop/confirm", [200, 400, 401, 403, 404, 409, 410, 413, 415, 503], 1024],
  ["POST", "/journeys/:journeyId/stop/reason", [200, 400, 401, 403, 404, 409, 410, 413, 415, 422, 503], 1024],
  ["POST", "/journeys/:journeyId/route/recover", [200, 400, 401, 403, 404, 409, 410, 413, 415, 429, 503], 2048],
  ["POST", "/journeys/:journeyId/arrival", [200, 400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503], 2048],
  ["POST", "/journeys/:journeyId/recovery", [201, 400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503], 1024],
  ["POST", "/journeys/:journeyId/recovery/confirm", [201, 400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503], 1024],
  ["GET", "/feedback/eligible", [200, 204, 404, 410, 429, 503], 0],
  ["POST", "/feedback/:feedbackId/reaction", [200, 400, 403, 404, 409, 410, 413, 415, 429, 503], 1024],
] as const;

export const EndpointContractV1Schema = z.object({
  method: z.enum(["GET", "POST", "DELETE"]),
  path: z.string().regex(/^\/[A-Za-z0-9:/-]+$/),
  statuses: z.array(z.number().int().min(100).max(599)).min(1),
  bodyLimitBytes: z.union([z.literal(0), z.literal(1024), z.literal(2048), z.literal(4096)]),
}).strict().readonly();

export const HealthV1Schema = z.object({ contractVersion: z.literal(1), status: z.literal("ok") }).strict().readonly();
export const FeedbackPromptV1Schema = z.object({
  contractVersion: z.literal(1),
  feedbackId: FeedbackIdSchema,
  promptVersion: z.string().min(1),
  dueAt: z.number().int().safe().nonnegative(),
  expiresAt: z.number().int().safe().nonnegative(),
  actions: z.tuple([z.literal("dislike"), z.literal("like"), z.literal("love"), z.literal("did_not_visit")]),
}).strict().readonly();
