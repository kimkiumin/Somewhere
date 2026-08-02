import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../../app/qa/field/v2/canonical-json.mjs";

const hex64 = /^[a-f0-9]{64}$/;
const identifier = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const categories = ["restaurant", "cafe"];
const orders = ["somewhere-first", "baseline-first"];
const familiarity = ["none", "area-only", "venue-known"];
const externalInterruptions = [
  "none",
  "route-failure",
  "sensor-failure",
  "safety",
  "closed-venue",
  "schedule-change",
  "other-external",
];
const reactions = ["dislike", "like", "love", "did-not-visit", "missing"];
const arrivalOutcomes = ["confirmed", "not-confirmed", "not-attempted"];
const forbiddenCoordinateKeys = /^(?:lat|lng|latitude|longitude|coordinates?|rawCoordinates)$/i;
const forbiddenIdentityKeys = /(?:name|email|phone|contact|address|venueId|placeId|destinationId)/i;

function fail(reason) {
  throw new TypeError(reason);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys, reason) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(reason);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(reason);
  }
}

function scanForbidden(value) {
  if (Array.isArray(value)) {
    for (const entry of value) scanForbidden(entry);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenCoordinateKeys.test(key)) fail("RAW_COORDINATES_FORBIDDEN");
    if (forbiddenIdentityKeys.test(key)) fail("DIRECT_OR_VENUE_IDENTIFIER_FORBIDDEN");
    scanForbidden(entry);
  }
}

function assertIdentifier(value, reason) {
  if (typeof value !== "string" || !identifier.test(value)) fail(reason);
}

function assertCount(value, reason) {
  if (!Number.isInteger(value) || value < 0) fail(reason);
}

function validateContract(contract, contractSha256) {
  exactKeys(
    contract,
    [
      "schemaVersion",
      "status",
      "protocolVersion",
      "frozenAt",
      "primaryAnalysisUnit",
      "primaryEndpoint",
      "differenceDirection",
      "practicalDifferenceThresholdSeconds",
      "decisionRule",
      "strata",
      "minimumDyads",
      "maximumDyads",
      "conclusionScope",
    ],
    "ANALYSIS_CONTRACT_SCHEMA_INVALID",
  );
  if (contract.status !== "FROZEN") fail("ANALYSIS_CONTRACT_NOT_FROZEN");
  if (
    contract.schemaVersion !== 1 ||
    contract.protocolVersion !== "study-b-protocol-v1" ||
    typeof contract.frozenAt !== "string" ||
    !isoDate.test(contract.frozenAt) ||
    contract.primaryAnalysisUnit !== "dyad" ||
    contract.primaryEndpoint !== "paired-dyad-selection-time-difference-seconds" ||
    contract.differenceDirection !== "baseline-minus-somewhere" ||
    !Number.isInteger(contract.practicalDifferenceThresholdSeconds) ||
    contract.practicalDifferenceThresholdSeconds <= 0 ||
    contract.decisionRule !== "MEAN_AT_OR_ABOVE_THRESHOLD_AND_CI_EXCLUDES_ZERO" ||
    JSON.stringify(contract.strata) !== JSON.stringify(categories) ||
    contract.minimumDyads !== 10 ||
    contract.maximumDyads !== 15 ||
    contract.conclusionScope !== "stratified-bundle-only"
  ) {
    fail("ANALYSIS_CONTRACT_SCHEMA_INVALID");
  }
  if (sha256(canonicalJson(contract)) !== contractSha256) {
    fail("ANALYSIS_CONTRACT_DIGEST_MISMATCH");
  }
}

function validateCondition(condition, kind) {
  exactKeys(
    condition,
    [
      "category",
      "areaCode",
      "budgetBand",
      "timeWindowCode",
      "pairCompositionCode",
      "eligiblePoolSha256",
      "priorFamiliarity",
      "selectionTimeSeconds",
      "comparisonCount",
      "destinationCommitted",
      "movementStarted",
      "selectionReopenedForPreference",
      "externalInterruption",
      "recommendationOutcome",
      "arrivalOutcome",
      "destinationReaction",
    ],
    "STUDY_B_CONDITION_SCHEMA_INVALID",
  );
  if (!categories.includes(condition.category)) fail("STUDY_B_CONDITION_SCHEMA_INVALID");
  for (const key of ["areaCode", "budgetBand", "timeWindowCode", "pairCompositionCode"]) {
    assertIdentifier(condition[key], "STUDY_B_CONDITION_SCHEMA_INVALID");
  }
  if (typeof condition.eligiblePoolSha256 !== "string" || !hex64.test(condition.eligiblePoolSha256)) {
    fail("STUDY_B_CONDITION_SCHEMA_INVALID");
  }
  if (!familiarity.includes(condition.priorFamiliarity)) fail("STUDY_B_CONDITION_SCHEMA_INVALID");
  for (const key of ["selectionTimeSeconds", "comparisonCount"]) {
    assertCount(condition[key], "STUDY_B_CONDITION_SCHEMA_INVALID");
  }
  for (const key of ["destinationCommitted", "movementStarted", "selectionReopenedForPreference"]) {
    if (typeof condition[key] !== "boolean") fail("STUDY_B_CONDITION_SCHEMA_INVALID");
  }
  if (
    !externalInterruptions.includes(condition.externalInterruption) ||
    !arrivalOutcomes.includes(condition.arrivalOutcome) ||
    !reactions.includes(condition.destinationReaction)
  ) {
    fail("STUDY_B_CONDITION_SCHEMA_INVALID");
  }
  if (
    (kind === "baseline" && condition.recommendationOutcome !== "not-applicable") ||
    (kind === "somewhere" && !["ready", "no-fit"].includes(condition.recommendationOutcome))
  ) {
    fail("STUDY_B_RECOMMENDATION_OUTCOME_INVALID");
  }
  if (
    condition.externalInterruption !== "none" &&
    (condition.selectionReopenedForPreference || condition.recommendationOutcome === "no-fit")
  ) {
    fail("FAILURE_CAUSES_CONFLATED");
  }
  if (
    condition.recommendationOutcome === "no-fit" &&
    (condition.destinationCommitted ||
      condition.movementStarted ||
      condition.arrivalOutcome !== "not-attempted" ||
      condition.destinationReaction !== "did-not-visit")
  ) {
    fail("RECOMMENDATION_FAILURE_OUTCOME_INVALID");
  }
  if (!condition.destinationCommitted && condition.movementStarted) {
    fail("MOVEMENT_WITHOUT_COMMITMENT");
  }
}

function validateDyad(dyad) {
  exactKeys(
    dyad,
    ["dyadCode", "participantCount", "order", "carryover", "baseline", "somewhere"],
    "STUDY_B_DYAD_SCHEMA_INVALID",
  );
  assertIdentifier(dyad.dyadCode, "STUDY_B_DYAD_SCHEMA_INVALID");
  if (dyad.participantCount !== 2 || !orders.includes(dyad.order)) {
    fail("STUDY_B_DYAD_SCHEMA_INVALID");
  }
  exactKeys(
    dyad.carryover,
    ["strategy", "firstPoolSha256", "secondPoolSha256", "contaminationObserved"],
    "CARRYOVER_CONTROL_INVALID",
  );
  if (
    dyad.carryover.strategy !== "non-overlapping-pools" ||
    typeof dyad.carryover.firstPoolSha256 !== "string" ||
    !hex64.test(dyad.carryover.firstPoolSha256) ||
    typeof dyad.carryover.secondPoolSha256 !== "string" ||
    !hex64.test(dyad.carryover.secondPoolSha256) ||
    dyad.carryover.firstPoolSha256 === dyad.carryover.secondPoolSha256 ||
    dyad.carryover.contaminationObserved !== false
  ) {
    fail("CARRYOVER_CONTROL_INVALID");
  }
  validateCondition(dyad.baseline, "baseline");
  validateCondition(dyad.somewhere, "somewhere");
  const matchingKeys = [
    "category",
    "areaCode",
    "budgetBand",
    "timeWindowCode",
    "pairCompositionCode",
  ];
  if (matchingKeys.some((key) => dyad.baseline[key] !== dyad.somewhere[key])) {
    fail("UNMATCHED_DYAD_CONDITIONS");
  }
  if (dyad.baseline.eligiblePoolSha256 === dyad.somewhere.eligiblePoolSha256) {
    fail("CARRYOVER_CONTROL_INVALID");
  }
  const expectedFirst =
    dyad.order === "somewhere-first"
      ? dyad.somewhere.eligiblePoolSha256
      : dyad.baseline.eligiblePoolSha256;
  const expectedSecond =
    dyad.order === "somewhere-first"
      ? dyad.baseline.eligiblePoolSha256
      : dyad.somewhere.eligiblePoolSha256;
  if (
    dyad.carryover.firstPoolSha256 !== expectedFirst ||
    dyad.carryover.secondPoolSha256 !== expectedSecond
  ) {
    fail("CARRYOVER_CONTROL_INVALID");
  }
}

function validateDataset(dataset, contract, contractSha256) {
  scanForbidden(dataset);
  exactKeys(
    dataset,
    [
      "schemaVersion",
      "studyId",
      "protocolVersion",
      "analysisContractSha256",
      "enrollmentOpenedAt",
      "collectionClosedAt",
      "primaryAnalysisUnit",
      "primaryEndpoint",
      "dyads",
    ],
    "STUDY_B_DATASET_SCHEMA_INVALID",
  );
  if (
    dataset.schemaVersion !== 1 ||
    dataset.protocolVersion !== "study-b-protocol-v1" ||
    typeof dataset.studyId !== "string" ||
    !/^study-b-[a-z0-9-]{8,64}$/.test(dataset.studyId)
  ) {
    fail("STUDY_B_DATASET_SCHEMA_INVALID");
  }
  if (dataset.analysisContractSha256 !== contractSha256) {
    fail("ANALYSIS_CONTRACT_DIGEST_MISMATCH");
  }
  if (dataset.primaryAnalysisUnit !== "dyad") fail("PRIMARY_ANALYSIS_UNIT_MUST_BE_DYAD");
  if (
    dataset.primaryEndpoint !== contract.primaryEndpoint ||
    dataset.primaryEndpoint !== "paired-dyad-selection-time-difference-seconds"
  ) {
    fail("PRIMARY_ENDPOINT_MISMATCH");
  }
  if (
    typeof dataset.enrollmentOpenedAt !== "string" ||
    !isoDate.test(dataset.enrollmentOpenedAt) ||
    typeof dataset.collectionClosedAt !== "string" ||
    !isoDate.test(dataset.collectionClosedAt) ||
    Date.parse(dataset.collectionClosedAt) <= Date.parse(dataset.enrollmentOpenedAt)
  ) {
    fail("STUDY_B_COLLECTION_WINDOW_INVALID");
  }
  if (Date.parse(contract.frozenAt) >= Date.parse(dataset.enrollmentOpenedAt)) {
    fail("ANALYSIS_CONTRACT_FROZEN_AFTER_ENROLLMENT");
  }
  if (
    !Array.isArray(dataset.dyads) ||
    dataset.dyads.length < contract.minimumDyads ||
    dataset.dyads.length > contract.maximumDyads
  ) {
    fail("STUDY_B_DYAD_COUNT_INVALID");
  }
  const codes = new Set();
  for (const dyad of dataset.dyads) {
    validateDyad(dyad);
    if (codes.has(dyad.dyadCode)) fail("DUPLICATE_DYAD");
    codes.add(dyad.dyadCode);
  }
  const orderCounts = Object.fromEntries(orders.map((order) => [order, 0]));
  for (const dyad of dataset.dyads) orderCounts[dyad.order] += 1;
  if (Math.abs(orderCounts[orders[0]] - orderCounts[orders[1]]) > 1) {
    fail("COUNTERBALANCE_INVALID");
  }
  for (const category of categories) {
    const stratum = dataset.dyads.filter((dyad) => dyad.baseline.category === category);
    if (stratum.length === 0) fail("STUDY_B_STRATA_INCOMPLETE");
    const first = stratum.filter((dyad) => dyad.order === "somewhere-first").length;
    if (Math.abs(first - (stratum.length - first)) > 1) fail("COUNTERBALANCE_INVALID");
  }
}

function round(value) {
  return Number(value.toFixed(3));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

const tCritical95 = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
};

function pairedSummary(dyads, threshold) {
  const differences = dyads.map(
    (dyad) => dyad.baseline.selectionTimeSeconds - dyad.somewhere.selectionTimeSeconds,
  );
  const average = mean(differences);
  const variance =
    differences.length === 1
      ? 0
      : differences.reduce((sum, value) => sum + (value - average) ** 2, 0) /
        (differences.length - 1);
  const margin =
    (tCritical95[differences.length - 1] ?? 1.96) * Math.sqrt(variance / differences.length);
  const ci95 = [round(average - margin), round(average + margin)];
  let practicalDecision = "REJECT";
  if (average > 0) practicalDecision = "REVISE";
  if (average >= threshold && ci95[0] > 0) practicalDecision = "SUPPORT";
  return {
    direction: "baseline-minus-somewhere",
    values: differences,
    mean: round(average),
    median: round(median(differences)),
    minimum: Math.min(...differences),
    maximum: Math.max(...differences),
    ci95,
    practicalThresholdSeconds: threshold,
    practicalDecision,
  };
}

function countBy(values, keys) {
  return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length]));
}

function stratumSummary(dyads, threshold) {
  const baseline = dyads.map((dyad) => dyad.baseline);
  const somewhere = dyads.map((dyad) => dyad.somewhere);
  return {
    dyadCount: dyads.length,
    pairedSelectionTimeDifferenceSeconds: pairedSummary(dyads, threshold),
    comparisonCount: {
      baselineMean: round(mean(baseline.map((entry) => entry.comparisonCount))),
      somewhereMean: round(mean(somewhere.map((entry) => entry.comparisonCount))),
    },
    movementStarted: {
      baselineCount: baseline.filter((entry) => entry.movementStarted).length,
      somewhereCount: somewhere.filter((entry) => entry.movementStarted).length,
    },
    selectionReopened: {
      baselineCount: baseline.filter((entry) => entry.selectionReopenedForPreference).length,
      somewhereCount: somewhere.filter((entry) => entry.selectionReopenedForPreference).length,
    },
    arrivals: {
      baselineConfirmed: baseline.filter((entry) => entry.arrivalOutcome === "confirmed").length,
      somewhereConfirmed: somewhere.filter((entry) => entry.arrivalOutcome === "confirmed").length,
    },
    externalInterruptions: {
      baselineCount: baseline.filter((entry) => entry.externalInterruption !== "none").length,
      somewhereCount: somewhere.filter((entry) => entry.externalInterruption !== "none").length,
    },
    recommendationFailures: {
      somewhereNoFitCount: somewhere.filter((entry) => entry.recommendationOutcome === "no-fit")
        .length,
    },
    destinationReaction: {
      baseline: countBy(
        baseline.map((entry) => entry.destinationReaction),
        reactions,
      ),
      somewhere: countBy(
        somewhere.map((entry) => entry.destinationReaction),
        reactions,
      ),
    },
  };
}

export function analyzeStudyB({ dataset, contract, contractSha256 }) {
  validateContract(contract, contractSha256);
  validateDataset(dataset, contract, contractSha256);
  const strata = Object.fromEntries(
    categories.map((category) => [
      category,
      stratumSummary(
        dataset.dyads.filter((dyad) => dyad.baseline.category === category),
        contract.practicalDifferenceThresholdSeconds,
      ),
    ]),
  );
  return {
    schemaVersion: 1,
    studyGate: "PASS",
    studyId: dataset.studyId,
    primaryAnalysisUnit: "dyad",
    endpoint: contract.primaryEndpoint,
    dyadCount: dataset.dyads.length,
    analysisContractSha256: contractSha256,
    strata,
    overallDescriptive: {
      pairedSelectionTimeDifferencesSeconds: dataset.dyads.map(
        (dyad) => dyad.baseline.selectionTimeSeconds - dyad.somewhere.selectionTimeSeconds,
      ),
    },
    attributionLimit: "SOMEWHERE_BUNDLE_ONLY_NO_COMPONENT_CAUSAL_CLAIM",
    populationClaim: "EXPLORATORY_NO_POPULATION_WIDE_VALIDATION_CLAIM",
  };
}

function argumentsMap(values) {
  if (values.includes("--help")) return new Map([["--help", "true"]]);
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      fail("arguments must be --name value pairs");
    }
    result.set(key, value);
  }
  return result;
}

async function writeJsonAtomic(output, value) {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, output);
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  if (options.has("--help")) {
    console.log(
      "Usage: bun research/study-b/analyze-study-b.mjs " +
        "--dataset FILE --contract FILE --output FILE",
    );
    return;
  }
  const datasetPath = options.get("--dataset");
  const contractPath = options.get("--contract");
  const outputPath = options.get("--output");
  if (datasetPath === undefined || contractPath === undefined || outputPath === undefined) {
    fail("required: --dataset --contract --output");
  }
  try {
    const contractBytes = await readFile(path.resolve(contractPath));
    const contract = JSON.parse(contractBytes.toString("utf8"));
    if (contract.status !== "FROZEN") {
      await writeJsonAtomic(path.resolve(outputPath), {
        schemaVersion: 1,
        studyGate: "BLOCK",
        reason: "ANALYSIS_CONTRACT_NOT_FROZEN",
      });
      process.exitCode = 2;
      return;
    }
    const dataset = JSON.parse(await readFile(path.resolve(datasetPath), "utf8"));
    const result = analyzeStudyB({
      dataset,
      contract,
      contractSha256: sha256(canonicalJson(contract)),
    });
    await writeJsonAtomic(path.resolve(outputPath), result);
  } catch (error) {
    await writeJsonAtomic(path.resolve(outputPath), {
      schemaVersion: 1,
      studyGate: "FAIL",
      reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
