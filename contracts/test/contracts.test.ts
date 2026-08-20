import { describe, expect, test } from "bun:test";
import {
  ArrivalBodyV1Schema,
  EndpointContractV1Schema,
  ErrorResponseV1Schema,
  JourneyCreateBodyV1Schema,
  JourneyProjectionV1Schema,
  contractDocumentV1,
  IdempotencyKeySchema,
  NavigationPolicyV1Schema,
  OperationsPolicyV1Schema,
  ProviderRightsRecordV1Schema,
} from "../src/index";

const base = {
  contractVersion: 1,
  journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
  sequence: 1,
} as const;

const disclosure = {
  routeDistanceM: 700,
  routeDurationMinutes: 10,
  representativeCategories: ["cafe"],
  priceBand: "medium",
  policyVersion: "policy-v1",
} as const;

describe("phase-exact journey projections", () => {
  test("accepts every frozen phase/action tuple", () => {
    const fixtures = contractDocumentV1.projectionExamples;
    expect(fixtures.length).toBe(22);
    for (const fixture of fixtures) {
      expect(JourneyProjectionV1Schema.safeParse(fixture).success).toBe(true);
    }
  });

  test("rejects an action legal only in another phase", () => {
    const result = JourneyProjectionV1Schema.safeParse({
      ...base,
      phase: "arrived",
      revealed: false,
      disclosure,
      feedbackDueAt: 1000,
      actions: ["reveal", "finish"],
    });
    expect(result.success).toBe(false);
  });

  test("keeps identity paired with revealed true", () => {
    expect(
      JourneyProjectionV1Schema.safeParse({
        ...base,
        phase: "ready",
        revealed: false,
        disclosure,
        reveal: { name: "leak", address: "leak" },
        actions: ["commit", "reveal", "stop"],
      }).success,
    ).toBe(false);
    expect(
      JourneyProjectionV1Schema.safeParse({
        ...base,
        phase: "ready",
        revealed: true,
        disclosure,
        actions: ["commit", "stop"],
      }).success,
    ).toBe(false);
  });

  test("rejects unknown projection keys", () => {
    expect(
      JourneyProjectionV1Schema.safeParse({
        ...base,
        phase: "finding",
        pollAfterSeconds: 2,
        actions: ["poll", "cancel"],
        destinationName: "leak",
      }).success,
    ).toBe(false);
  });
});

describe("HTTP and primitive contracts", () => {
  test("materializes every endpoint, status, and error", () => {
    expect(contractDocumentV1.endpoints.every((row) => EndpointContractV1Schema.safeParse(row).success)).toBe(true);
    expect(contractDocumentV1.endpoints.length).toBe(17);
    expect(contractDocumentV1.publicErrors.length).toBe(25);
  });

  test("rejects invalid version, key, header, and old arrival example", () => {
    expect(ArrivalBodyV1Schema.safeParse({
      endpointDistanceBand: "within-arrival-threshold",
      accuracyBand: "good",
      consecutiveSamples: 4,
      dwellMs: 12000,
      routeConsistency: "consistent",
    }).success).toBe(false);
    expect(ArrivalBodyV1Schema.safeParse({
      contractVersion: 2,
      endpointDistanceBand: "within-arrival-threshold",
      accuracyBand: "good",
      consecutiveSamples: 4,
      dwellMs: 12000,
      routeConsistency: "consistent",
    }).success).toBe(false);
    expect(IdempotencyKeySchema.safeParse("ik_v1.short").success).toBe(false);
    expect(IdempotencyKeySchema.safeParse(`ik_v1.${"A".repeat(43)}=`).success).toBe(false);
  });

  test("parses canonical branded tokens without the Node Buffer global", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
    Object.defineProperty(globalThis, "Buffer", { configurable: true, value: undefined });
    try {
      expect(IdempotencyKeySchema.safeParse(`ik_v1.${"A".repeat(43)}`).success).toBe(true);
      expect(JourneyProjectionV1Schema.safeParse(contractDocumentV1.projectionExamples[0]).success).toBe(
        true,
      );
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, "Buffer");
      } else {
        Object.defineProperty(globalThis, "Buffer", descriptor);
      }
    }
  });

  test("rejects raw arrival traces and forbidden error details", () => {
    expect(ArrivalBodyV1Schema.safeParse({
      contractVersion: 1,
      endpointDistanceBand: "within-arrival-threshold",
      accuracyBand: "good",
      consecutiveSamples: 4,
      dwellMs: 12000,
      routeConsistency: "consistent",
      latitude: 37,
    }).success).toBe(false);
    expect(ErrorResponseV1Schema.safeParse({
      contractVersion: 1,
      error: {
        code: "not_found",
        message: "missing",
        requestId: "req_v1.AAAAAAAAAAAAAAAAAAAAAA",
        retryable: false,
        details: { venueId: "leak" },
      },
    }).success).toBe(false);
  });

  test("accepts allergy constraints as a separate hard-filter input", () => {
    const result = JourneyCreateBodyV1Schema.safeParse({
      contractVersion: 1,
      constraints: {
        category: "restaurant",
        maxWalkMinutes: 25,
        budgetBand: "medium",
        dietary: ["lacto_ovo"],
        allergies: ["peanut"],
        accessibility: [],
      },
      origin: {
        latitude: 37.54385,
        longitude: 127.03695,
        accuracyM: 5,
        capturedAt: 1_785_283_200_000,
      },
      disclosureLevel: "standard",
      recoveryCapability: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraints.allergies).toEqual(["peanut"]);
    }
  });
});

describe("operations, provider, and navigation policies", () => {
  test("validates canonical policy objects", () => {
    expect(OperationsPolicyV1Schema.safeParse(contractDocumentV1.operationsPolicy).success).toBe(true);
    expect(NavigationPolicyV1Schema.safeParse(contractDocumentV1.navigationPolicy).success).toBe(true);
  });

  test("blocks incomplete provider rights evidence", () => {
    expect(ProviderRightsRecordV1Schema.safeParse({ schemaVersion: 1, decision: "PASS" }).success).toBe(false);
  });
});
