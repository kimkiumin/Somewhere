import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { canonicalJson } from "../../app/qa/field/v2/canonical-json.mjs";
import { analyzeStudyB } from "./analyze-study-b.mjs";

const hex = (character) => character.repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function frozenContract(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "FROZEN",
    protocolVersion: "study-b-protocol-v1",
    frozenAt: "2026-08-01T00:00:00.000Z",
    primaryAnalysisUnit: "dyad",
    primaryEndpoint: "paired-dyad-selection-time-difference-seconds",
    differenceDirection: "baseline-minus-somewhere",
    practicalDifferenceThresholdSeconds: 60,
    decisionRule: "MEAN_AT_OR_ABOVE_THRESHOLD_AND_CI_EXCLUDES_ZERO",
    strata: ["restaurant", "cafe"],
    minimumDyads: 10,
    maximumDyads: 15,
    conclusionScope: "stratified-bundle-only",
    ...overrides,
  };
}

function condition(index, category, kind) {
  const baseline = kind === "baseline";
  return {
    category,
    areaCode: `area-${Math.floor(index / 2) + 1}`,
    budgetBand: "budget-mid",
    timeWindowCode: "evening-window",
    pairCompositionCode: `pair-composition-${index + 1}`,
    eligiblePoolSha256: baseline ? hex("a") : hex("b"),
    priorFamiliarity: "none",
    selectionTimeSeconds: baseline ? 240 : 120,
    comparisonCount: baseline ? 4 : 1,
    destinationCommitted: true,
    movementStarted: true,
    selectionReopenedForPreference: false,
    externalInterruption: "none",
    recommendationOutcome: baseline ? "not-applicable" : "ready",
    arrivalOutcome: "confirmed",
    destinationReaction: index % 3 === 0 ? "love" : "like",
  };
}

function fixture(contract = frozenContract()) {
  const contractSha256 = sha256(canonicalJson(contract));
  const dyads = Array.from({ length: 10 }, (_, index) => {
    const category = index < 5 ? "restaurant" : "cafe";
    return {
      dyadCode: `study-b-dyad-${index + 1}`,
      participantCount: 2,
      order: index % 2 === 0 ? "somewhere-first" : "baseline-first",
      carryover: {
        strategy: "non-overlapping-pools",
        firstPoolSha256: index % 2 === 0 ? hex("b") : hex("a"),
        secondPoolSha256: index % 2 === 0 ? hex("a") : hex("b"),
        contaminationObserved: false,
      },
      baseline: condition(index, category, "baseline"),
      somewhere: condition(index, category, "somewhere"),
    };
  });
  return {
    contract,
    contractSha256,
    dataset: {
      schemaVersion: 1,
      studyId: "study-b-comparison-v1",
      protocolVersion: "study-b-protocol-v1",
      analysisContractSha256: contractSha256,
      enrollmentOpenedAt: "2026-08-02T00:00:00.000Z",
      collectionClosedAt: "2026-08-20T00:00:00.000Z",
      primaryAnalysisUnit: "dyad",
      primaryEndpoint: "paired-dyad-selection-time-difference-seconds",
      dyads,
    },
  };
}

function analyze(data) {
  return analyzeStudyB({
    dataset: data.dataset,
    contract: data.contract,
    contractSha256: data.contractSha256,
  });
}

describe("Study B counterbalanced dyad analysis", () => {
  test("keeps the repository contract blocked until Study A freezes the threshold", async () => {
    const contract = JSON.parse(
      await readFile(path.join(import.meta.dir, "analysis-contract-v1.json"), "utf8"),
    );
    const schema = JSON.parse(
      await readFile(path.join(import.meta.dir, "dataset-v1.schema.json"), "utf8"),
    );

    expect(contract).toMatchObject({
      status: "BLOCK",
      frozenAt: null,
      practicalDifferenceThresholdSeconds: null,
      decisionRule: "BLOCKED_PENDING_STUDY_A",
    });
    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
    });
  });

  test("CLI binds the canonical frozen contract rather than its formatting bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "somewhere-study-b-cli-"));
    try {
      const data = fixture();
      const contractPath = path.join(root, "contract.json");
      const datasetPath = path.join(root, "dataset.json");
      const outputPath = path.join(root, "result.json");
      await writeFile(contractPath, `${JSON.stringify(data.contract, null, 4)}\n`);
      await writeFile(datasetPath, `${JSON.stringify(data.dataset)}\n`);
      const result = spawnSync(
        "bun",
        [
          path.join(import.meta.dir, "analyze-study-b.mjs"),
          "--dataset",
          datasetPath,
          "--contract",
          contractPath,
          "--output",
          outputPath,
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
        studyGate: "PASS",
        dyadCount: 10,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reports deterministic paired results in separate restaurant and cafe strata", () => {
    const result = analyze(fixture());

    expect(result).toMatchObject({
      studyGate: "PASS",
      primaryAnalysisUnit: "dyad",
      endpoint: "paired-dyad-selection-time-difference-seconds",
      dyadCount: 10,
      attributionLimit: "SOMEWHERE_BUNDLE_ONLY_NO_COMPONENT_CAUSAL_CLAIM",
    });
    expect(result).not.toHaveProperty("overallDecision");
    expect(result.strata.restaurant).toMatchObject({
      dyadCount: 5,
      pairedSelectionTimeDifferenceSeconds: {
        direction: "baseline-minus-somewhere",
        mean: 120,
        median: 120,
        practicalDecision: "SUPPORT",
      },
      comparisonCount: { baselineMean: 4, somewhereMean: 1 },
      movementStarted: { baselineCount: 5, somewhereCount: 5 },
      selectionReopened: { baselineCount: 0, somewhereCount: 0 },
      arrivals: { baselineConfirmed: 5, somewhereConfirmed: 5 },
      externalInterruptions: { baselineCount: 0, somewhereCount: 0 },
    });
    expect(result.strata.cafe.pairedSelectionTimeDifferenceSeconds.practicalDecision).toBe(
      "SUPPORT",
    );
  });

  test.each([9, 16])("rejects a sample of %i dyads", (count) => {
    const data = fixture();
    data.dataset.dyads = Array.from({ length: count }, (_, index) =>
      structuredClone(data.dataset.dyads[index % 10]),
    );
    data.dataset.dyads.forEach((dyad, index) => {
      dyad.dyadCode = `study-b-resized-${index + 1}`;
    });
    expect(() => analyze(data)).toThrow("STUDY_B_DYAD_COUNT_INVALID");
  });

  test("rejects individual-level inference as the primary unit", () => {
    const data = fixture();
    data.dataset.primaryAnalysisUnit = "individual";
    expect(() => analyze(data)).toThrow("PRIMARY_ANALYSIS_UNIT_MUST_BE_DYAD");
  });

  test("requires exactly two people in every primary dyad", () => {
    const data = fixture();
    data.dataset.dyads[0].participantCount = 1;
    expect(() => analyze(data)).toThrow("STUDY_B_DYAD_SCHEMA_INVALID");
  });

  test.each([
    ["latitude", 37.5, "RAW_COORDINATES_FORBIDDEN"],
    ["participantName", "Kim", "DIRECT_OR_VENUE_IDENTIFIER_FORBIDDEN"],
    ["venueId", "secret-venue", "DIRECT_OR_VENUE_IDENTIFIER_FORBIDDEN"],
  ])("rejects prohibited governed field %s", (field, value, reason) => {
    const data = fixture();
    data.dataset.dyads[0].somewhere[field] = value;
    expect(() => analyze(data)).toThrow(reason);
  });

  test.each(["category", "areaCode", "budgetBand", "timeWindowCode", "pairCompositionCode"])(
    "rejects unmatched paired constraint %s",
    (field) => {
      const data = fixture();
      data.dataset.dyads[0].somewhere[field] =
        field === "category" ? "cafe" : `foreign-${field.toLowerCase()}`;
      expect(() => analyze(data)).toThrow("UNMATCHED_DYAD_CONDITIONS");
    },
  );

  test("requires counterbalanced order and explicit non-overlapping carryover control", () => {
    const missingOrder = fixture();
    delete missingOrder.dataset.dyads[0].order;
    expect(() => analyze(missingOrder)).toThrow("STUDY_B_DYAD_SCHEMA_INVALID");

    const missingCarryover = fixture();
    delete missingCarryover.dataset.dyads[0].carryover;
    expect(() => analyze(missingCarryover)).toThrow("STUDY_B_DYAD_SCHEMA_INVALID");

    const reusedPool = fixture();
    reusedPool.dataset.dyads[0].carryover.secondPoolSha256 =
      reusedPool.dataset.dyads[0].carryover.firstPoolSha256;
    expect(() => analyze(reusedPool)).toThrow("CARRYOVER_CONTROL_INVALID");

    const unbalanced = fixture();
    for (const dyad of unbalanced.dataset.dyads) {
      dyad.order = "somewhere-first";
      dyad.carryover.firstPoolSha256 = dyad.somewhere.eligiblePoolSha256;
      dyad.carryover.secondPoolSha256 = dyad.baseline.eligiblePoolSha256;
    }
    expect(() => analyze(unbalanced)).toThrow("COUNTERBALANCE_INVALID");
  });

  test("rejects an endpoint or decision contract changed after enrollment", () => {
    const changedEndpoint = fixture();
    changedEndpoint.dataset.primaryEndpoint = "person-level-preference";
    expect(() => analyze(changedEndpoint)).toThrow("PRIMARY_ENDPOINT_MISMATCH");

    const changedContract = fixture();
    changedContract.contract.practicalDifferenceThresholdSeconds = 1;
    expect(() => analyze(changedContract)).toThrow("ANALYSIS_CONTRACT_DIGEST_MISMATCH");

    const lateFreeze = fixture(
      frozenContract({ frozenAt: "2026-08-03T00:00:00.000Z" }),
    );
    expect(() => analyze(lateFreeze)).toThrow("ANALYSIS_CONTRACT_FROZEN_AFTER_ENROLLMENT");
  });

  test("requires restaurant and cafe conclusions to remain separately visible", () => {
    const data = fixture();
    for (const dyad of data.dataset.dyads) {
      dyad.baseline.category = "restaurant";
      dyad.somewhere.category = "restaurant";
    }
    expect(() => analyze(data)).toThrow("STUDY_B_STRATA_INCOMPLETE");
  });

  test("keeps preference reopening, external interruption, and recommendation failure distinct", () => {
    const conflatedPreference = fixture();
    conflatedPreference.dataset.dyads[0].somewhere.selectionReopenedForPreference = true;
    conflatedPreference.dataset.dyads[0].somewhere.externalInterruption = "route-failure";
    expect(() => analyze(conflatedPreference)).toThrow("FAILURE_CAUSES_CONFLATED");

    const conflatedRecommendation = fixture();
    conflatedRecommendation.dataset.dyads[0].somewhere.recommendationOutcome = "no-fit";
    conflatedRecommendation.dataset.dyads[0].somewhere.externalInterruption = "closed-venue";
    expect(() => analyze(conflatedRecommendation)).toThrow("FAILURE_CAUSES_CONFLATED");
  });

  test("blocks analysis when Study A has not authorized a frozen threshold", () => {
    const data = fixture(frozenContract({
      status: "BLOCK",
      frozenAt: null,
      practicalDifferenceThresholdSeconds: null,
      decisionRule: "BLOCKED_PENDING_STUDY_A",
    }));
    expect(() => analyze(data)).toThrow("ANALYSIS_CONTRACT_NOT_FROZEN");
  });
});
