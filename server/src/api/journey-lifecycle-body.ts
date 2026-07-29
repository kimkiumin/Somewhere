import { z } from "zod";

import { ArrivalBodyV1Schema } from "../../../contracts/src/journey";
import type { StopReason } from "../journey/types";
import { randomBase64Url } from "../security/tokens";
import type { JourneySnapshot } from "./journey-request";

const VERSION_KEYS = new Set(["contractVersion"]);
const STOP_CONFIRM_KEYS = new Set(["contractVersion", "stopConfirmationId"]);
const STOP_REASON_KEYS = new Set(["contractVersion", "reason", "reasonPolicyVersion"]);
const ROUTE_RECOVERY_KEYS = new Set(["contractVersion", "choice"]);
const ARRIVAL_KEYS = new Set([
  "contractVersion",
  "endpointDistanceBand",
  "accuracyBand",
  "consecutiveSamples",
  "dwellMs",
  "routeConsistency",
]);

export type LifecycleMutationAction =
  | "commit"
  | "reveal"
  | "stop-request"
  | "continue"
  | "confirm-stop"
  | "stop-reason"
  | "route-recover"
  | "arrival";

export type LifecycleBody =
  | Readonly<{ contractVersion: 1 }>
  | Readonly<{ contractVersion: 1; stopConfirmationId: string }>
  | Readonly<{ contractVersion: 1; reason: StopReason; reasonPolicyVersion: "stop-reasons-v1" }>
  | Readonly<{
      choice: "recalibrate" | "reroute" | "cached-route" | "external-map";
      contractVersion: 1;
    }>
  | z.infer<typeof ArrivalBodyV1Schema>;

export type JourneyCommandDetails =
  | Readonly<{ type: "commit" | "reveal" }>
  | Readonly<{ stopConfirmationId: string; type: "stop-request" | "continue" | "confirm-stop" }>
  | Readonly<{ reason: StopReason; type: "stop-reason" }>
  | Readonly<{
      choice: "recalibrate" | "reroute" | "cached-route" | "external-map";
      routeVersion?: string | undefined;
      type: "route-recover";
    }>
  | Readonly<{
      accuracyBand: "poor" | "acceptable" | "good";
      consecutiveSamples: number;
      dwellMs: number;
      endpointDistanceBand: "outside" | "near" | "within-arrival-threshold";
      routeConsistency: "unknown" | "inconsistent" | "consistent";
      type: "arrival";
    }>;

const versionSchema = z
  .object({ contractVersion: z.literal(1) })
  .strict()
  .readonly();
const stopConfirmationSchema = z
  .object({
    contractVersion: z.literal(1),
    stopConfirmationId: z.string().regex(/^sc_v1\.[A-Za-z0-9_-]{22}$/),
  })
  .strict()
  .readonly();
const stopReasonSchema = z
  .object({
    contractVersion: z.literal(1),
    reason: z.enum([
      "safety-concern",
      "route-or-sensor",
      "hard-condition",
      "venue-situation",
      "changed-mind",
      "schedule-changed",
      "skip",
    ]),
    reasonPolicyVersion: z.literal("stop-reasons-v1"),
  })
  .strict()
  .readonly();
const routeRecoverySchema = z
  .object({
    choice: z.enum(["recalibrate", "reroute", "cached-route", "external-map"]),
    contractVersion: z.literal(1),
  })
  .strict()
  .readonly();

export function parseLifecycleBody(
  action: LifecycleMutationAction,
  value: Readonly<Record<string, unknown>>,
): LifecycleBody | undefined {
  const schema =
    action === "stop-request" || action === "commit" || action === "reveal"
      ? versionSchema
      : action === "continue" || action === "confirm-stop"
        ? stopConfirmationSchema
        : action === "stop-reason"
          ? stopReasonSchema
          : action === "route-recover"
            ? routeRecoverySchema
            : ArrivalBodyV1Schema;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function keysFor(action: LifecycleMutationAction): ReadonlySet<string> {
  switch (action) {
    case "commit":
    case "reveal":
    case "stop-request":
      return VERSION_KEYS;
    case "continue":
    case "confirm-stop":
      return STOP_CONFIRM_KEYS;
    case "stop-reason":
      return STOP_REASON_KEYS;
    case "route-recover":
      return ROUTE_RECOVERY_KEYS;
    case "arrival":
      return ARRIVAL_KEYS;
    default:
      return assertNever(action);
  }
}

export function commandFor(
  action: LifecycleMutationAction,
  body: LifecycleBody,
  snapshot: JourneySnapshot,
): JourneyCommandDetails {
  switch (action) {
    case "commit":
    case "reveal":
      return { type: action };
    case "stop-request":
      return { stopConfirmationId: `sc_v1.${randomBase64Url(16)}`, type: "stop-request" };
    case "continue":
    case "confirm-stop":
      if (!("stopConfirmationId" in body)) {
        throw new TypeError("validated Stop body is missing confirmation ID");
      }
      return { stopConfirmationId: body.stopConfirmationId, type: action };
    case "stop-reason":
      if (!("reason" in body)) {
        throw new TypeError("validated Stop reason body is missing reason");
      }
      return { reason: body.reason, type: "stop-reason" };
    case "route-recover":
      if (!("choice" in body)) {
        throw new TypeError("validated route recovery body is missing choice");
      }
      return {
        choice: body.choice,
        routeVersion:
          body.choice === "external-map" ? undefined : `repair-${snapshot.sequence + 1}`,
        type: "route-recover",
      };
    case "arrival":
      if (!("endpointDistanceBand" in body)) {
        throw new TypeError("validated arrival body is missing evidence");
      }
      return {
        accuracyBand: body.accuracyBand,
        consecutiveSamples: body.consecutiveSamples,
        dwellMs: body.dwellMs,
        endpointDistanceBand: body.endpointDistanceBand,
        routeConsistency: body.routeConsistency,
        type: "arrival",
      };
    default:
      return assertNever(action);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`unhandled lifecycle action: ${String(value)}`);
}
