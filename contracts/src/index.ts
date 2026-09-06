import { z } from "zod";
import { ENDPOINT_ROWS, PUBLIC_ERROR_ROWS } from "./http";
import {
  JourneyProjectionV1Schema,
  type JourneyProjectionV1,
} from "./journey";
import {
  NAVIGATION_POLICY_V1,
  OPERATIONS_POLICY_V1,
} from "./policy";

export * from "./http";
export * from "./feedback";
export * from "./journey";
export * from "./policy";
export * from "./provider";

const journeyId = "j_v1.AAAAAAAAAAAAAAAAAAAAAA";
const disclosure = {
  routeDistanceM: 700,
  routeDurationMinutes: 10,
  representativeCategories: ["cafe"],
  priceBand: "medium",
  policyVersion: "policy-v1",
} as const;
const reveal = { name: "Revealed venue", address: "Revealed address" } as const;
const route = {
  kind: "route",
  encodedPolyline: "synthetic-polyline",
  routeDigest: `sha256:${"a".repeat(64)}`,
  routeVersion: "route-v1",
  expiresAt: 1_800_000,
} as const;
const unavailable = { kind: "unavailable", reason: "provider" } as const;
const base = { contractVersion: 1, journeyId, sequence: 1 } as const;

const projectionExamplesInput = [
  { ...base, phase: "finding", pollAfterSeconds: 2, actions: ["poll", "cancel"] },
  { ...base, phase: "ready", revealed: false, disclosure, actions: ["commit", "stop"] },
  { ...base, phase: "ready", revealed: true, disclosure, reveal, actions: ["commit", "stop"] },
  { ...base, phase: "committed", revealed: false, disclosure, pollAfterSeconds: 2, guidance: { kind: "unavailable", reason: "route-pending" }, actions: ["poll", "stop"] },
  { ...base, phase: "committed", revealed: true, disclosure, reveal, pollAfterSeconds: 2, guidance: { kind: "unavailable", reason: "route-pending" }, actions: ["poll", "stop"] },
  { ...base, phase: "following", revealed: false, disclosure, guidance: route, actions: ["stop", "route-recover", "arrival"] },
  { ...base, phase: "following", revealed: true, disclosure, reveal, guidance: route, actions: ["stop", "route-recover", "arrival"] },
  { ...base, phase: "route-recovery", revealed: false, disclosure, guidance: unavailable, actions: ["stop", "route-recover"] },
  { ...base, phase: "route-recovery", revealed: true, disclosure, reveal, guidance: unavailable, actions: ["stop", "route-recover"] },
  { ...base, phase: "near", revealed: false, disclosure, guidance: route, actions: ["stop", "route-recover", "arrival"] },
  { ...base, phase: "near", revealed: true, disclosure, reveal, guidance: route, actions: ["stop", "route-recover", "arrival"] },
  { ...base, phase: "paused", revealed: false, disclosure, phaseBeforePause: "following", stopConfirmationId: "sc_v1.AAAAAAAAAAAAAAAAAAAAAA", stopConfirmation: { copyVersion: "v1" }, routeRepair: { status: "idle" }, actions: ["continue", "route-recover", "confirm-stop", "reveal"] },
  { ...base, phase: "paused", revealed: true, disclosure, reveal, phaseBeforePause: "following", stopConfirmationId: "sc_v1.AAAAAAAAAAAAAAAAAAAAAA", stopConfirmation: { copyVersion: "v1" }, routeRepair: { status: "idle" }, actions: ["continue", "route-recover", "confirm-stop"] },
  { ...base, phase: "stopped", revealed: false, disclosure, stopReasonState: "required-or-skip", actions: ["record-reason", "skip-reason", "reveal"] },
  { ...base, phase: "stopped", revealed: true, disclosure, reveal, stopReasonState: "required-or-skip", actions: ["record-reason", "skip-reason"] },
  { ...base, phase: "completed", revealed: false, disclosure, stopReasonState: "recorded", recoveryExpiresAt: 1000, actions: ["reveal", "recovery"] },
  { ...base, phase: "completed", revealed: true, disclosure, reveal, stopReasonState: "recorded", recoveryExpiresAt: 1000, actions: ["recovery"] },
  { ...base, phase: "completed", revealed: false, disclosure, stopReasonState: "skipped", actions: ["reveal"] },
  { ...base, phase: "completed", revealed: true, disclosure, reveal, stopReasonState: "skipped", actions: [] },
  { ...base, phase: "arrived", revealed: true, disclosure, reveal, feedbackDueAt: 1000, actions: [] },
  { ...base, phase: "expired", actions: [] },
] as const;

const parsedProjectionExamples = z.array(JourneyProjectionV1Schema).parse(projectionExamplesInput);
export const PROJECTION_EXAMPLES_V1: readonly JourneyProjectionV1[] = parsedProjectionExamples;

export const contractDocumentV1 = {
  contractVersion: 1,
  projectionExamples: PROJECTION_EXAMPLES_V1,
  endpoints: ENDPOINT_ROWS.map(([method, path, statuses, bodyLimitBytes]) => ({
    method,
    path,
    statuses: [...statuses],
    bodyLimitBytes,
  })),
  publicErrors: PUBLIC_ERROR_ROWS.map(([status, code, retryable]) => ({ status, code, retryable })),
  idempotency: {
    ttlHours: 24,
    replayExactBodyBytes: true,
    replayPrecedesSequenceCheck: true,
    fingerprintFields: ["contractVersion", "authorizationScopeDigest", "method", "routeTemplate", "objectId", "expectedSequence", "canonicalBody"],
  },
  sequence: {
    initial: 1,
    canonicalHeader: "Expected-Journey-Sequence",
    acceptedMutationIncrement: 1,
    replayIncrement: 0,
  },
  racePrecedence: OPERATIONS_POLICY_V1.racePrecedence,
  operationsPolicy: OPERATIONS_POLICY_V1,
  navigationPolicy: NAVIGATION_POLICY_V1,
} as const;

type StrictJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly code: "INVALID_JSON" | "DUPLICATE_KEY" };

class DuplicateJsonKeyError extends Error {
  readonly name = "DuplicateJsonKeyError";
}

function containsDuplicateObjectKey(source: string): boolean {
  const containers: Array<Set<string> | null> = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === "{") {
      containers.push(new Set<string>());
      index += 1;
      continue;
    }
    if (character === "[") {
      containers.push(null);
      index += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      containers.pop();
      index += 1;
      continue;
    }
    if (character !== '"') {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const stringCharacter = source[index];
      if (escaped) {
        escaped = false;
      } else if (stringCharacter === "\\") {
        escaped = true;
      } else if (stringCharacter === '"') {
        index += 1;
        break;
      }
      index += 1;
    }
    let following = index;
    while (following < source.length && /\s/.test(source[following] ?? "")) {
      following += 1;
    }
    const objectKeys = containers.at(-1);
    if (source[following] === ":" && objectKeys instanceof Set) {
      const parsedKey: unknown = JSON.parse(source.slice(start, index));
      if (typeof parsedKey !== "string") {
        throw new DuplicateJsonKeyError();
      }
      if (objectKeys.has(parsedKey)) {
        return true;
      }
      objectKeys.add(parsedKey);
    }
  }
  return false;
}

export function parseStrictJsonV1(source: string): StrictJsonResult {
  try {
    const value: unknown = JSON.parse(source, (key: string, parsedValue: unknown) => {
      if (key === "__proto__" || key === "constructor") {
        throw new DuplicateJsonKeyError();
      }
      return parsedValue;
    });
    if (containsDuplicateObjectKey(source)) {
      return { ok: false, code: "DUPLICATE_KEY" };
    }
    return { ok: true, value };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DuplicateJsonKeyError) {
      return { ok: false, code: "INVALID_JSON" };
    }
    throw error;
  }
}
