import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyEd25519Attestation } from "../../app/qa/field/v2/attestation.mjs";
import { canonicalJson } from "../../app/qa/field/v2/canonical-json.mjs";
import { resolvePinnedRegistry } from "../../app/qa/field/v2/trusted-authority.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const hex64 = /^[a-f0-9]{64}$/;
const identifier = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const sessionId = /^study-a-[a-z0-9-]{8,64}$/;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const STUDY_A_THRESHOLDS = Object.freeze({
  comprehensionPassRateMin: 0.8,
  movementStartRateMin: 0.8,
  trustedStopOrRevealRateMin: 0.8,
  maxRouteSensorFailures: 0,
  maxFalseArrivals: 0,
  maxMissedArrivals: 0,
  physicalPassRateMin: 0.8,
});

const forbiddenCoordinateKeys = /^(?:lat|lng|latitude|longitude|coordinates?|rawCoordinates)$/i;
const forbiddenIdentityKeys = /(?:name|email|phone|contact|address)/i;
const forbiddenVenueKeys = /^(?:venue|place|destination)(?:Name|Identity|Address|Description)$/i;
const stopReasons = new Set([
  "safety-concern",
  "consent-withdrawal",
  "unreliable-route",
  "data-boundary-breach",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(reason) {
  throw new TypeError(reason);
}

function scanForbidden(value) {
  if (Array.isArray(value)) {
    for (const entry of value) scanForbidden(entry);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenCoordinateKeys.test(key)) fail("RAW_COORDINATES_FORBIDDEN");
    if (forbiddenVenueKeys.test(key)) fail("VENUE_IDENTITY_FORBIDDEN");
    if (forbiddenIdentityKeys.test(key)) fail("DIRECT_IDENTIFIER_FORBIDDEN");
    scanForbidden(entry);
  }
}

function exactKeys(value, keys, reason) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(reason);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(reason);
  }
}

function assertString(value, pattern, reason) {
  if (typeof value !== "string" || !pattern.test(value)) fail(reason);
}

function assertCount(value, reason) {
  if (!Number.isInteger(value) || value < 0) fail(reason);
}

function assertRate(value, reason) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) fail(reason);
}

function validateBindings(bindings) {
  exactKeys(
    bindings,
    [
      "nativeBuildReceiptSha256",
      "pwaBuildReceiptSha256",
      "routeContractSha256",
      "providerConfigSha256",
      "navigationPolicySha256",
      "calibrationEvidenceSha256",
      "sessionSchemaSha256",
      "aggregateSchemaSha256",
      "physicalMockupVersion",
    ],
    "STUDY_A_BINDINGS_INVALID",
  );
  for (const [key, value] of Object.entries(bindings)) {
    if (key !== "physicalMockupVersion") assertString(value, hex64, "STUDY_A_BINDINGS_INVALID");
  }
  assertString(bindings.physicalMockupVersion, identifier, "STUDY_A_BINDINGS_INVALID");
}

function sameObject(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function verifySupervisor(value, trustedSupervisors, signedAt) {
  const {
    supervisorAttestationSha256,
    supervisorSignatureBase64,
    supervisorKeyId,
    ...unsigned
  } = value;
  if (
    typeof supervisorKeyId !== "string" ||
    typeof supervisorSignatureBase64 !== "string" ||
    typeof supervisorAttestationSha256 !== "string"
  ) {
    fail("SUPERVISOR_ATTESTATION_MISSING");
  }
  const error = verifyEd25519Attestation({
    trustedRegistry: trustedSupervisors,
    keyId: supervisorKeyId,
    signedAt,
    signatureBase64: supervisorSignatureBase64,
    signatureSha256: supervisorAttestationSha256,
    payload: { ...unsigned, supervisorKeyId },
    sha256,
  });
  if (error !== null) fail(`SUPERVISOR_${error}`);
}

function validateMeasures(measures) {
  exactKeys(
    measures,
    [
      "comprehension",
      "selectionTimeSeconds",
      "comparisonReopeningCount",
      "movementStarted",
      "routeSensorFailureCount",
      "stopTrust",
      "revealTrust",
      "falseArrivalCount",
      "missedArrivalCount",
      "displayReadability",
      "oneHandUse",
      "accidentalStopCount",
      "carryComfort",
      "stateDistinction",
    ],
    "STUDY_A_MEASURES_INVALID",
  );
  if (!["pass", "fail"].includes(measures.comprehension)) fail("STUDY_A_MEASURES_INVALID");
  if (!Number.isInteger(measures.selectionTimeSeconds) || measures.selectionTimeSeconds < 0) {
    fail("STUDY_A_MEASURES_INVALID");
  }
  for (const key of [
    "comparisonReopeningCount",
    "routeSensorFailureCount",
    "falseArrivalCount",
    "missedArrivalCount",
    "accidentalStopCount",
  ]) {
    assertCount(measures[key], "STUDY_A_MEASURES_INVALID");
  }
  if (typeof measures.movementStarted !== "boolean") fail("STUDY_A_MEASURES_INVALID");
  for (const key of ["stopTrust", "revealTrust"]) {
    if (!["trusted", "uncertain", "distrusted"].includes(measures[key])) {
      fail("STUDY_A_MEASURES_INVALID");
    }
  }
  for (const key of ["displayReadability", "oneHandUse", "carryComfort", "stateDistinction"]) {
    if (!["pass", "fail", "not-observed"].includes(measures[key])) {
      fail("STUDY_A_MEASURES_INVALID");
    }
  }
}

function validateSession(session, expectedBindings, trustedSupervisors) {
  scanForbidden(session);
  if (!("consentVersion" in session)) fail("CONSENT_VERSION_MISSING");
  if (!("supervisorSignatureBase64" in session)) fail("SUPERVISOR_ATTESTATION_MISSING");
  exactKeys(
    session,
    [
      "schemaVersion",
      "sessionId",
      "sessionType",
      "participantCodes",
      "evidenceOrigin",
      "supervised",
      "consentVersion",
      "startedAt",
      "endedAt",
      "buildTarget",
      "buildCompletedAt",
      "buildReceiptSha256",
      "routeContractSha256",
      "providerConfigSha256",
      "navigationPolicySha256",
      "sessionSchemaSha256",
      "physicalMockupVersion",
      "physicalMethod",
      "claimsEmbodiedPointing",
      "measures",
      "stop",
      "safety",
      "privacy",
      "supervisorKeyId",
      "supervisorAttestationSha256",
      "supervisorSignatureBase64",
    ],
    "STUDY_A_SESSION_SCHEMA_INVALID",
  );
  if (
    session.schemaVersion !== 1 ||
    session.evidenceOrigin !== "physical" ||
    session.supervised !== true
  ) {
    fail("STUDY_A_SESSION_SCHEMA_INVALID");
  }
  assertString(session.sessionId, sessionId, "STUDY_A_SESSION_SCHEMA_INVALID");
  if (!["dyad-shared-selection", "individual-handling"].includes(session.sessionType)) {
    fail("STUDY_A_SESSION_SCHEMA_INVALID");
  }
  if (!Array.isArray(session.participantCodes)) fail("STUDY_A_SESSION_SCHEMA_INVALID");
  const expectedParticipants = session.sessionType === "dyad-shared-selection" ? 2 : 1;
  if (
    session.participantCodes.length !== expectedParticipants ||
    new Set(session.participantCodes).size !== expectedParticipants ||
    session.participantCodes.some((code) => typeof code !== "string" || !identifier.test(code))
  ) {
    fail("STUDY_A_PARTICIPANT_CODES_INVALID");
  }
  assertString(session.consentVersion, identifier, "CONSENT_VERSION_MISSING");
  for (const value of [session.startedAt, session.endedAt, session.buildCompletedAt]) {
    assertString(value, isoDate, "STUDY_A_TIMESTAMP_INVALID");
  }
  if (
    Date.parse(session.startedAt) < Date.parse(session.buildCompletedAt) ||
    Date.parse(session.endedAt) <= Date.parse(session.startedAt)
  ) {
    fail("PRE_BUILD_EVIDENCE");
  }
  if (!["native-ios", "pwa-ios"].includes(session.buildTarget)) fail("STUDY_A_BUILD_INVALID");
  const expectedBuild =
    session.buildTarget === "native-ios"
      ? expectedBindings.nativeBuildReceiptSha256
      : expectedBindings.pwaBuildReceiptSha256;
  if (
    session.buildReceiptSha256 !== expectedBuild ||
    session.routeContractSha256 !== expectedBindings.routeContractSha256 ||
    session.providerConfigSha256 !== expectedBindings.providerConfigSha256 ||
    session.navigationPolicySha256 !== expectedBindings.navigationPolicySha256 ||
    session.sessionSchemaSha256 !== expectedBindings.sessionSchemaSha256 ||
    session.physicalMockupVersion !== expectedBindings.physicalMockupVersion
  ) {
    fail("EVIDENCE_BINDING_MISMATCH");
  }
  if (
    ![
      "embodied-wizard-of-oz",
      "wired-prototype",
      "ble-prototype",
      "visual-only-animation",
    ].includes(session.physicalMethod) ||
    typeof session.claimsEmbodiedPointing !== "boolean"
  ) {
    fail("STUDY_A_PHYSICAL_METHOD_INVALID");
  }
  if (session.physicalMethod === "visual-only-animation" && session.claimsEmbodiedPointing) {
    fail("VISUAL_ONLY_EMBODIED_CLAIM");
  }
  validateMeasures(session.measures);
  exactKeys(session.stop, ["triggered", "reason"], "STUDY_A_STOP_INVALID");
  if (
    typeof session.stop.triggered !== "boolean" ||
    (session.stop.triggered
      ? !stopReasons.has(session.stop.reason)
      : session.stop.reason !== null)
  ) {
    fail("STUDY_A_STOP_INVALID");
  }
  if (session.stop.triggered) fail("INVALIDATED_SESSION_INCLUDED");
  exactKeys(
    session.safety,
    ["openCriticalIssueCount", "issueCodes"],
    "STUDY_A_SAFETY_INVALID",
  );
  assertCount(session.safety.openCriticalIssueCount, "STUDY_A_SAFETY_INVALID");
  if (
    !Array.isArray(session.safety.issueCodes) ||
    session.safety.issueCodes.some((code) => typeof code !== "string" || !identifier.test(code))
  ) {
    fail("STUDY_A_SAFETY_INVALID");
  }
  exactKeys(
    session.privacy,
    [
      "rawCoordinatesCollected",
      "directIdentifiersCollected",
      "venueIdentityFreeTextCollected",
      "traceStoredPrivately",
    ],
    "STUDY_A_PRIVACY_INVALID",
  );
  if (
    session.privacy.rawCoordinatesCollected !== false ||
    session.privacy.directIdentifiersCollected !== false ||
    session.privacy.venueIdentityFreeTextCollected !== false ||
    session.privacy.traceStoredPrivately !== true
  ) {
    fail("DATA_BOUNDARY_BREACH");
  }
  verifySupervisor(session, trustedSupervisors, session.endedAt);
}

function computeDecisions(sessions) {
  const count = sessions.length;
  const rate = (predicate) => sessions.filter(predicate).length / count;
  const totals = (key) => sessions.reduce((sum, session) => sum + session.measures[key], 0);
  const openCritical = sessions.reduce(
    (sum, session) => sum + session.safety.openCriticalIssueCount,
    0,
  );
  const navigationPass =
    openCritical === 0 &&
    rate((session) => session.measures.comprehension === "pass") >=
      STUDY_A_THRESHOLDS.comprehensionPassRateMin &&
    rate((session) => session.measures.movementStarted) >=
      STUDY_A_THRESHOLDS.movementStartRateMin &&
    rate(
      (session) =>
        session.measures.stopTrust === "trusted" || session.measures.revealTrust === "trusted",
    ) >= STUDY_A_THRESHOLDS.trustedStopOrRevealRateMin &&
    totals("routeSensorFailureCount") <= STUDY_A_THRESHOLDS.maxRouteSensorFailures &&
    totals("falseArrivalCount") <= STUDY_A_THRESHOLDS.maxFalseArrivals &&
    totals("missedArrivalCount") <= STUDY_A_THRESHOLDS.maxMissedArrivals;

  const embodied = sessions.filter(
    (session) =>
      session.sessionType === "individual-handling" &&
      session.physicalMethod !== "visual-only-animation",
  );
  let physicalDecision = "BLOCK";
  if (embodied.length > 0) {
    const physicalMeasures = [
      "displayReadability",
      "oneHandUse",
      "carryComfort",
      "stateDistinction",
    ];
    physicalDecision = physicalMeasures.every(
      (key) =>
        embodied.filter((session) => session.measures[key] === "pass").length / embodied.length >=
        STUDY_A_THRESHOLDS.physicalPassRateMin,
    )
      ? "PASS"
      : "FAIL";
  }
  return { navigationDecision: navigationPass ? "PASS" : "FAIL", physicalDecision, openCritical };
}

function validateAggregate(aggregate, sessions, expectedBindings, trustedSupervisors, decisions) {
  scanForbidden(aggregate);
  if (!("supervisorSignatureBase64" in aggregate)) fail("SUPERVISOR_ATTESTATION_MISSING");
  exactKeys(
    aggregate,
    [
      "schemaVersion",
      "studyId",
      "protocolVersion",
      "generatedAt",
      "bindings",
      "acceptedThresholds",
      "sessionReceipts",
      "openCriticalSafetyIssueCount",
      "navigationDecision",
      "physicalDecision",
      "supervisorKeyId",
      "supervisorAttestationSha256",
      "supervisorSignatureBase64",
    ],
    "STUDY_A_AGGREGATE_SCHEMA_INVALID",
  );
  if (
    aggregate.schemaVersion !== 1 ||
    !sessionId.test(aggregate.studyId) ||
    aggregate.protocolVersion !== "study-a-protocol-v1" ||
    !isoDate.test(aggregate.generatedAt)
  ) {
    fail("STUDY_A_AGGREGATE_SCHEMA_INVALID");
  }
  validateBindings(aggregate.bindings);
  if (!sameObject(aggregate.bindings, expectedBindings)) fail("EVIDENCE_BINDING_MISMATCH");
  exactKeys(
    aggregate.acceptedThresholds,
    Object.keys(STUDY_A_THRESHOLDS),
    "ACCEPTED_THRESHOLDS_MISMATCH",
  );
  for (const key of [
    "comprehensionPassRateMin",
    "movementStartRateMin",
    "trustedStopOrRevealRateMin",
    "physicalPassRateMin",
  ]) {
    assertRate(aggregate.acceptedThresholds[key], "ACCEPTED_THRESHOLDS_MISMATCH");
  }
  if (!sameObject(aggregate.acceptedThresholds, STUDY_A_THRESHOLDS)) {
    fail("ACCEPTED_THRESHOLDS_MISMATCH");
  }
  if (
    !Array.isArray(aggregate.sessionReceipts) ||
    aggregate.sessionReceipts.length !== sessions.length
  ) {
    fail("SESSION_RECEIPT_MISMATCH");
  }
  const receiptMap = new Map();
  for (const receipt of aggregate.sessionReceipts) {
    exactKeys(receipt, ["sessionId", "sessionSha256"], "SESSION_RECEIPT_MISMATCH");
    if (receiptMap.has(receipt.sessionId) || !hex64.test(receipt.sessionSha256)) {
      fail("SESSION_RECEIPT_MISMATCH");
    }
    receiptMap.set(receipt.sessionId, receipt.sessionSha256);
  }
  for (const session of sessions) {
    if (receiptMap.get(session.sessionId) !== sha256(canonicalJson(session))) {
      fail("SESSION_RECEIPT_MISMATCH");
    }
  }
  if (
    aggregate.openCriticalSafetyIssueCount !== decisions.openCritical ||
    aggregate.navigationDecision !== decisions.navigationDecision ||
    aggregate.physicalDecision !== decisions.physicalDecision
  ) {
    fail("STUDY_A_DECLARED_DECISION_MISMATCH");
  }
  verifySupervisor(aggregate, trustedSupervisors, aggregate.generatedAt);
}

export function validateStudyA({ sessions, aggregate, trustedSupervisors, expectedBindings }) {
  if (!Array.isArray(sessions) || sessions.length < 5 || sessions.length > 8) {
    fail("STUDY_A_SESSION_COUNT_INVALID");
  }
  validateBindings(expectedBindings);
  const ids = new Set();
  for (const session of sessions) {
    validateSession(session, expectedBindings, trustedSupervisors);
    if (ids.has(session.sessionId)) fail("REUSED_STUDY_A_EVIDENCE");
    ids.add(session.sessionId);
  }
  if (
    new Set(sessions.map((session) => session.sessionType)).size !== 2 ||
    new Set(sessions.map((session) => session.buildTarget)).size !== 2
  ) {
    fail("STUDY_A_SESSION_TYPES_INCOMPLETE");
  }
  const decisions = computeDecisions(sessions);
  validateAggregate(aggregate, sessions, expectedBindings, trustedSupervisors, decisions);
  const aggregateSha256 = sha256(canonicalJson(aggregate));
  return {
    schemaVersion: 1,
    studyGate: "PASS",
    navigationGate: decisions.navigationDecision,
    physicalGate: decisions.physicalDecision,
    rcPromotionEligible: decisions.navigationDecision === "PASS" && decisions.openCritical === 0,
    sessionCount: sessions.length,
    aggregateSha256,
    bindings: expectedBindings,
    supervisorKeyId: aggregate.supervisorKeyId,
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

async function readEvidence(input) {
  const root = path.resolve(input);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("STUDY_A_PACKAGE_INVALID");
  const rootEntries = await readdir(root, { withFileTypes: true });
  const allowedRootEntries = new Set(["aggregate.json", "sessions", "study-a-evidence.json"]);
  if (
    rootEntries.some(
      (entry) =>
        !allowedRootEntries.has(entry.name) ||
        entry.isSymbolicLink() ||
        (entry.name === "sessions" ? !entry.isDirectory() : !entry.isFile()),
    ) ||
    !rootEntries.some((entry) => entry.name === "aggregate.json") ||
    !rootEntries.some((entry) => entry.name === "sessions")
  ) {
    fail("STUDY_A_PACKAGE_CONTENTS_INVALID");
  }
  const aggregate = JSON.parse(await readFile(path.join(root, "aggregate.json"), "utf8"));
  const sessionsRoot = path.join(root, "sessions");
  const sessionEntries = await readdir(sessionsRoot, { withFileTypes: true });
  if (
    sessionEntries.length < 5 ||
    sessionEntries.length > 8 ||
    sessionEntries.some(
      (entry) =>
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !/^study-a-[a-z0-9-]{8,64}\.json$/.test(entry.name),
    )
  ) {
    fail("STUDY_A_SESSION_FILES_INVALID");
  }
  const names = sessionEntries.map((entry) => entry.name).sort();
  const sessions = await Promise.all(
    names.map(async (name) => JSON.parse(await readFile(path.join(sessionsRoot, name), "utf8"))),
  );
  return { aggregate, sessions };
}

export async function validateStudyADirectory({ input, trustedSupervisors }) {
  const evidence = await readEvidence(input);
  const sessionSchemaBytes = await readFile(path.join(here, "session-v1.schema.json"));
  const aggregateSchemaBytes = await readFile(path.join(here, "aggregate-v1.schema.json"));
  const expectedBindings = {
    ...evidence.aggregate.bindings,
    sessionSchemaSha256: sha256(sessionSchemaBytes),
    aggregateSchemaSha256: sha256(aggregateSchemaBytes),
  };
  return validateStudyA({ ...evidence, trustedSupervisors, expectedBindings });
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  if (options.has("--help")) {
    console.log(
      "Usage: bun research/study-a/validate-study-a.mjs " +
        "--input DIR --trusted-supervisors FILE --output FILE",
    );
    return;
  }
  const input = options.get("--input");
  const output = options.get("--output");
  if (input === undefined || output === undefined) fail("required: --input --output");
  try {
    const authority = await resolvePinnedRegistry(
      options.get("--trusted-supervisors"),
      "somewhere-v2-study-a-supervision",
    );
    if (authority.state === "BLOCK") {
      await writeJsonAtomic(path.resolve(output), {
        schemaVersion: 1,
        studyGate: "BLOCK",
        navigationGate: "BLOCK",
        physicalGate: "BLOCK",
        rcPromotionEligible: false,
        reason: authority.reason,
      });
      process.exitCode = 2;
      return;
    }
    const verdict = await validateStudyADirectory({
      input,
      trustedSupervisors: authority.registry,
    });
    await writeJsonAtomic(path.resolve(output), {
      ...verdict,
      trustedSupervisorRegistrySha256: authority.registrySha256,
    });
    process.exitCode = verdict.navigationGate === "PASS" ? 0 : 1;
  } catch (error) {
    await writeJsonAtomic(path.resolve(output), {
      schemaVersion: 1,
      studyGate: "FAIL",
      navigationGate: "FAIL",
      physicalGate: "FAIL",
      rcPromotionEligible: false,
      reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
