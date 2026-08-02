import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { canonicalJson } from "../../app/qa/field/v2/canonical-json.mjs";
import { validateStudyA } from "./validate-study-a.mjs";

const hex = (character) => character.repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const thresholds = {
  comprehensionPassRateMin: 0.8,
  movementStartRateMin: 0.8,
  trustedStopOrRevealRateMin: 0.8,
  maxRouteSensorFailures: 0,
  maxFalseArrivals: 0,
  maxMissedArrivals: 0,
  physicalPassRateMin: 0.8,
};

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = {
    schemaVersion: 1,
    purpose: "somewhere-v2-study-a-supervision",
    signers: [
      {
        keyId: "study-a-lead-1",
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2027-01-01T00:00:00.000Z",
      },
    ],
  };
  const bindings = {
    nativeBuildReceiptSha256: hex("1"),
    pwaBuildReceiptSha256: hex("2"),
    routeContractSha256: hex("3"),
    providerConfigSha256: hex("4"),
    navigationPolicySha256: hex("5"),
    calibrationEvidenceSha256: hex("8"),
    sessionSchemaSha256: hex("6"),
    aggregateSchemaSha256: hex("7"),
    physicalMockupVersion: "somewhere-physical-v1",
  };
  const attest = (value) => {
    const payload = { ...value, supervisorKeyId: "study-a-lead-1" };
    const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey);
    return {
      ...payload,
      supervisorAttestationSha256: sha256(signature),
      supervisorSignatureBase64: signature.toString("base64"),
    };
  };
  const sessions = Array.from({ length: 5 }, (_, index) => {
    const buildTarget = index % 2 === 0 ? "native-ios" : "pwa-ios";
    const individual = index >= 3;
    return attest({
      schemaVersion: 1,
      sessionId: `study-a-session-${index + 1}`,
      sessionType: individual ? "individual-handling" : "dyad-shared-selection",
      participantCodes: individual
        ? [`participant-${index + 1}`]
        : [`pair-${index + 1}-a`, `pair-${index + 1}-b`],
      evidenceOrigin: "physical",
      supervised: true,
      consentVersion: "study-a-consent-v1",
      startedAt: `2026-07-2${index + 1}T10:00:00.000Z`,
      endedAt: `2026-07-2${index + 1}T10:30:00.000Z`,
      buildTarget,
      buildCompletedAt: "2026-07-20T00:00:00.000Z",
      buildReceiptSha256:
        buildTarget === "native-ios"
          ? bindings.nativeBuildReceiptSha256
          : bindings.pwaBuildReceiptSha256,
      routeContractSha256: bindings.routeContractSha256,
      providerConfigSha256: bindings.providerConfigSha256,
      navigationPolicySha256: bindings.navigationPolicySha256,
      sessionSchemaSha256: bindings.sessionSchemaSha256,
      physicalMockupVersion: bindings.physicalMockupVersion,
      physicalMethod: "embodied-wizard-of-oz",
      claimsEmbodiedPointing: true,
      measures: {
        comprehension: "pass",
        selectionTimeSeconds: 90,
        comparisonReopeningCount: 1,
        movementStarted: true,
        routeSensorFailureCount: 0,
        stopTrust: "trusted",
        revealTrust: "trusted",
        falseArrivalCount: 0,
        missedArrivalCount: 0,
        displayReadability: "pass",
        oneHandUse: "pass",
        accidentalStopCount: 0,
        carryComfort: "pass",
        stateDistinction: "pass",
      },
      stop: { triggered: false, reason: null },
      safety: { openCriticalIssueCount: 0, issueCodes: [] },
      privacy: {
        rawCoordinatesCollected: false,
        directIdentifiersCollected: false,
        venueIdentityFreeTextCollected: false,
        traceStoredPrivately: true,
      },
    });
  });
  const makeAggregate = (sourceSessions = sessions, overrides = {}) => {
    const base = {
      schemaVersion: 1,
      studyId: "study-a-native-physical-v1",
      protocolVersion: "study-a-protocol-v1",
      generatedAt: "2026-07-31T00:00:00.000Z",
      bindings,
      acceptedThresholds: { ...thresholds },
      sessionReceipts: sourceSessions.map((session) => ({
        sessionId: session.sessionId,
        sessionSha256: sha256(canonicalJson(session)),
      })),
      openCriticalSafetyIssueCount: 0,
      navigationDecision: "PASS",
      physicalDecision: "PASS",
      ...overrides,
    };
    return attest(base);
  };
  const resign = (value) => {
    const {
      supervisorKeyId: _keyId,
      supervisorAttestationSha256: _digest,
      supervisorSignatureBase64: _signature,
      ...unsigned
    } = value;
    return attest(unsigned);
  };
  return { attest, bindings, makeAggregate, registry, resign, sessions };
}

function resignSessions(source, mutate) {
  const next = structuredClone(source);
  mutate(next);
  return next;
}

describe("Study A native and embodied-product evidence", () => {
  test("accepts 5-8 signed sessions while keeping navigation and physical gates separate", () => {
    const data = fixture();
    const verdict = validateStudyA({
      sessions: data.sessions,
      aggregate: data.makeAggregate(),
      trustedSupervisors: data.registry,
      expectedBindings: data.bindings,
    });
    expect(verdict).toMatchObject({
      studyGate: "PASS",
      navigationGate: "PASS",
      physicalGate: "PASS",
      rcPromotionEligible: true,
      sessionCount: 5,
    });
  });

  test.each([
    ["latitude", 37.5, "RAW_COORDINATES_FORBIDDEN"],
    ["participantName", "Kim", "DIRECT_IDENTIFIER_FORBIDDEN"],
    ["contactEmail", "person@example.com", "DIRECT_IDENTIFIER_FORBIDDEN"],
    ["venueName", "secret place", "VENUE_IDENTITY_FORBIDDEN"],
  ])("rejects prohibited evidence field %s", (key, value, reason) => {
    const data = fixture();
    data.sessions[0].privacy[key] = value;
    expect(() =>
      validateStudyA({
        sessions: data.sessions,
        aggregate: data.makeAggregate(data.sessions),
        trustedSupervisors: data.registry,
        expectedBindings: data.bindings,
      }),
    ).toThrow(reason);
  });

  test("rejects missing consent and unsigned supervision", () => {
    const missingConsent = fixture();
    delete missingConsent.sessions[0].consentVersion;
    expect(() =>
      validateStudyA({
        sessions: missingConsent.sessions,
        aggregate: missingConsent.makeAggregate(missingConsent.sessions),
        trustedSupervisors: missingConsent.registry,
        expectedBindings: missingConsent.bindings,
      }),
    ).toThrow("CONSENT_VERSION_MISSING");

    const unsigned = fixture();
    delete unsigned.sessions[0].supervisorSignatureBase64;
    expect(() =>
      validateStudyA({
        sessions: unsigned.sessions,
        aggregate: unsigned.makeAggregate(unsigned.sessions),
        trustedSupervisors: unsigned.registry,
        expectedBindings: unsigned.bindings,
      }),
    ).toThrow("SUPERVISOR_ATTESTATION_MISSING");
  });

  test("rejects evidence captured before the bound build", () => {
    const data = fixture();
    data.sessions[0].buildCompletedAt = "2026-08-01T00:00:00.000Z";
    expect(() =>
      validateStudyA({
        sessions: data.sessions,
        aggregate: data.makeAggregate(data.sessions),
        trustedSupervisors: data.registry,
        expectedBindings: data.bindings,
      }),
    ).toThrow("PRE_BUILD_EVIDENCE");
  });

  test("rejects a visual animation that claims embodied pointing success", () => {
    const data = fixture();
    data.sessions[3].physicalMethod = "visual-only-animation";
    expect(() =>
      validateStudyA({
        sessions: data.sessions,
        aggregate: data.makeAggregate(data.sessions),
        trustedSupervisors: data.registry,
        expectedBindings: data.bindings,
      }),
    ).toThrow("VISUAL_ONLY_EMBODIED_CLAIM");
  });

  test("allows navigation promotion while honest visual-only physical evidence remains BLOCK", () => {
    const data = fixture();
    for (const session of data.sessions) {
      session.physicalMethod = "visual-only-animation";
      session.claimsEmbodiedPointing = false;
      session.measures.displayReadability = "not-observed";
      session.measures.oneHandUse = "not-observed";
      session.measures.carryComfort = "not-observed";
      session.measures.stateDistinction = "not-observed";
    }
    data.sessions = data.sessions.map(data.resign);
    const verdict = validateStudyA({
      sessions: data.sessions,
      aggregate: data.makeAggregate(data.sessions, { physicalDecision: "BLOCK" }),
      trustedSupervisors: data.registry,
      expectedBindings: data.bindings,
    });
    expect(verdict).toMatchObject({
      navigationGate: "PASS",
      physicalGate: "BLOCK",
      rcPromotionEligible: true,
    });
  });

  test("requires both dyad selection and individual handling sessions", () => {
    const data = fixture();
    data.sessions = data.sessions.map((session, index) =>
      data.resign({
        ...session,
        sessionType: "dyad-shared-selection",
        participantCodes: [`all-dyad-${index + 1}-a`, `all-dyad-${index + 1}-b`],
      }),
    );
    expect(() =>
      validateStudyA({
        sessions: data.sessions,
        aggregate: data.makeAggregate(data.sessions),
        trustedSupervisors: data.registry,
        expectedBindings: data.bindings,
      }),
    ).toThrow("STUDY_A_SESSION_TYPES_INCOMPLETE");
  });

  test("rejects changed thresholds and invalid binding, stop, or receipt evidence", () => {
    const changedThreshold = fixture();
    const aggregate = changedThreshold.makeAggregate(changedThreshold.sessions);
    aggregate.acceptedThresholds.maxFalseArrivals = 1;
    expect(() =>
      validateStudyA({
        sessions: changedThreshold.sessions,
        aggregate,
        trustedSupervisors: changedThreshold.registry,
        expectedBindings: changedThreshold.bindings,
      }),
    ).toThrow("ACCEPTED_THRESHOLDS_MISMATCH");

    const foreign = fixture();
    foreign.sessions[0].routeContractSha256 = hex("9");
    expect(() =>
      validateStudyA({
        sessions: foreign.sessions,
        aggregate: foreign.makeAggregate(foreign.sessions),
        trustedSupervisors: foreign.registry,
        expectedBindings: foreign.bindings,
      }),
    ).toThrow("EVIDENCE_BINDING_MISMATCH");

    const stopped = fixture();
    stopped.sessions[0].stop = { triggered: true, reason: "consent-withdrawal" };
    expect(() =>
      validateStudyA({
        sessions: stopped.sessions,
        aggregate: stopped.makeAggregate(stopped.sessions),
        trustedSupervisors: stopped.registry,
        expectedBindings: stopped.bindings,
      }),
    ).toThrow("INVALIDATED_SESSION_INCLUDED");

    const stale = fixture();
    const staleAggregate = stale.makeAggregate();
    const staleUnsigned = structuredClone(stale.sessions[0]);
    staleUnsigned.measures.falseArrivalCount = 1;
    stale.sessions[0] = stale.resign(staleUnsigned);
    expect(() =>
      validateStudyA({
        sessions: stale.sessions,
        aggregate: staleAggregate,
        trustedSupervisors: stale.registry,
        expectedBindings: stale.bindings,
      }),
    ).toThrow("SESSION_RECEIPT_MISMATCH");
  });
});
