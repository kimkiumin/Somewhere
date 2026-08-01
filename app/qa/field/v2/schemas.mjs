import { z } from "zod";

export const hex40 = z.string().regex(/^[a-f0-9]{40}$/);
export const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
export const sha256Digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const isoDateTime = z.iso.datetime({ offset: true });

const releaseCandidateSchema = z
  .object({
    buildSha: hex40,
    sourceTree: hex40,
    buildDigest: sha256Digest,
    builtAt: isoDateTime,
    deployedUrl: z.url({ protocol: /^https$/ }),
    navigationPolicyVersion: z.literal("navigation-v2-rc-1"),
    navigationPolicySha256: hex64,
    promotionReceiptSha256: hex64,
    routeId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    routeVersion: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    routeDigest: hex64,
    routeReviewedAt: isoDateTime,
    routeExpiresAt: isoDateTime,
    providerId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    providerVersion: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    providerRightsDigest: hex64,
    providerExpiresAt: isoDateTime,
  })
  .strict();

export const evidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceOrigin: z.enum(["synthetic", "physical"]),
    releaseCandidate: releaseCandidateSchema,
    runDirectories: z.array(z.string()).max(4),
  })
  .strict();

const fieldGateSchema = z
  .object({
    status: z.literal("PASS"),
    observedAt: isoDateTime,
    notes: z.string().min(1).max(500),
  })
  .strict();

export const releaseRunSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceOrigin: z.enum(["synthetic", "physical"]),
    runId: z.string().regex(/^[A-D]$/),
    buildSha: hex40,
    navigationPolicyVersion: z.literal("navigation-v2-rc-1"),
    navigationPolicySha256: hex64,
    deployedUrl: z.url({ protocol: /^https$/ }),
    deviceModel: z.literal("iPhone 15 Pro Max"),
    iosVersion: z.string().regex(/^(1[89]|[2-9][0-9])\.[0-9]+(?:\.[0-9]+)?$/),
    safariVersion: z.string().min(1).max(40),
    browserMode: z.enum(["safari", "home-screen"]),
    environment: z.enum(["open-sky", "building-dense"]),
    displayMode: z.enum(["browser", "standalone"]),
    wakeLockSupported: z.boolean(),
    wakeLockSustained: z.boolean(),
    startedAt: isoDateTime,
    endedAt: isoDateTime,
    durationSeconds: z.number().int().min(1200),
    routeId: z.string().min(3).max(64),
    routeVersion: z.string().min(3).max(64),
    routeDigest: hex64,
    routeExpiresAt: isoDateTime,
    providerId: z.string().min(3).max(64),
    providerVersion: z.string().min(3).max(64),
    providerRightsDigest: hex64,
    providerExpiresAt: isoDateTime,
    checklistSha256: hex64,
    screensSha256: z
      .record(z.string().regex(/^[A-Za-z0-9._-]+\.(?:png|txt)$/), hex64)
      .refine((screens) => Object.keys(screens).length > 0),
    traceSha256: hex64,
    traceStoredPrivately: z.literal(true),
    rawTraceDisposition: z.enum(["retained-private", "discarded"]),
    exactLocationPublished: z.literal(false),
    moderatorPresent: z.literal(true),
    gates: z
      .object({
        P1: fieldGateSchema,
        P2: fieldGateSchema,
        P3: fieldGateSchema,
        P4: fieldGateSchema,
        P5: fieldGateSchema,
        P6: fieldGateSchema,
        P7: fieldGateSchema,
      })
      .strict(),
    unsafeEvents: z.literal(0),
    criticalDefects: z.literal(0),
    testerAttestation: z
      .object({
        tester: z.string().min(1).max(100),
        moderator: z.string().min(1).max(100),
        signedAt: isoDateTime,
        signatureSha256: hex64,
        keyId: z
          .string()
          .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/)
          .optional(),
        signatureBase64: z.string().base64().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((run, context) => {
    if (
      run.evidenceOrigin === "physical" &&
      (run.testerAttestation.keyId === undefined ||
        run.testerAttestation.signatureBase64 === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "physical evidence requires a key ID and Ed25519 signature",
        path: ["testerAttestation"],
      });
    }
  });

export const navigationPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    policyVersion: z.union([
      z.string().regex(/^navigation-v2-calibration-[1-9][0-9]*$/),
      z.literal("navigation-v2-rc-1"),
    ]),
    status: z.enum(["calibration-only", "release-candidate"]),
    routeCorridorEnterM: z.number().min(1).max(100),
    routeCorridorExitM: z.number().min(1).max(150),
    finalCorridorMaxDeviationM: z.number().min(1).max(75),
    forwardTargetLookaheadM: z.number().min(5).max(100),
    maxGuidanceAccuracyM: z.number().min(5).max(100),
    maxMeasuredHeadingAccuracyDeg: z.number().min(1).max(90),
    nearEnterM: z.number().min(20).max(250),
    nearExitM: z.number().min(20).max(300),
    arrivalEndpointM: z.number().min(5).max(75),
    maxArrivalAccuracyM: z.number().min(5).max(75),
    arrivalConsecutiveSamples: z.number().int().min(2).max(10),
    arrivalMinimumDwellMs: z.number().int().min(5000).max(60000),
    arrivalSampleWindowMs: z.number().int().min(5000).max(120000),
    locationMaxAgeMs: z.number().int().min(1000).max(30000),
    headingMaxAgeMs: z.number().int().min(1000).max(30000),
    routeRevalidateAfterMs: z.number().int().min(60000).max(900000),
    routeAbsoluteMaxAgeMs: z.number().int().min(300000).max(3600000),
    postVisibilityRequiresNewLocation: z.literal(true),
    postVisibilityRequiresNewHeading: z.literal(true),
    arrivedIsLatched: z.literal(true),
    parentPolicyVersion: z.literal("navigation-v2-calibration-1").optional(),
    parentPolicySha256: hex64.optional(),
    calibrationEvidenceSha256: hex64.optional(),
  })
  .strict();

export const calibrationSessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.string().regex(/^study-a-[a-z0-9-]{8,64}$/),
    evidenceOrigin: z.literal("physical"),
    supervised: z.literal(true),
    deviceModel: z.literal("iPhone 15 Pro Max"),
    iosVersion: z.string().min(3).max(20),
    browserMode: z.enum(["safari", "home-screen"]),
    startedAt: isoDateTime,
    endedAt: isoDateTime,
    environment: z.enum(["open-sky", "building-dense"]),
    routeId: z.string().min(3).max(64),
    parentPolicySha256: hex64,
    candidatePolicySha256: hex64,
    candidatePolicy: navigationPolicySchema,
    candidateInEnvelope: z.literal(true),
    unsafeEvents: z.literal(0),
    outcomes: z
      .object({
        falseArrivals: z.literal(0),
        directionOutsideExit: z.literal(0),
        staleBackgroundArrows: z.literal(0),
        directBearingFallbacks: z.literal(0),
        duplicateListeners: z.literal(0),
        newP0P1Defects: z.literal(0),
        missedArrivals: z.number().int().min(0),
        recoveries: z.number().int().min(0),
        missedArrivalsReviewed: z.literal(true),
        recoveriesReviewed: z.literal(true),
      })
      .strict(),
    traceSha256: hex64,
    traceStoredPrivately: z.literal(true),
    supervisor: z.string().min(1).max(100),
    supervisorAttestationSha256: hex64,
    supervisorKeyId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    supervisorSignatureBase64: z.string().base64(),
  })
  .strict();

export const calibrationStudySchema = z
  .object({
    schemaVersion: z.literal(1),
    studyId: z.string().regex(/^study-a-[a-z0-9-]{4,64}$/),
    sessions: z.array(calibrationSessionSchema).min(5).max(8),
  })
  .strict();

export const promotionReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    promotionGate: z.literal("PASS"),
    status: z.literal("FINAL"),
    rcCreated: z.literal(true),
    policyVersion: z.literal("navigation-v2-rc-1"),
    policySha256: hex64,
    parentPolicySha256: hex64,
    candidatePolicySha256: hex64,
    calibrationEvidenceSha256: hex64,
    expandedStudyAAggregateSha256: hex64,
    nativeBuildReceiptSha256: hex64,
    pwaBuildReceiptSha256: hex64,
    routeContractSha256: hex64,
    providerConfigSha256: hex64,
    sessionSchemaSha256: hex64,
    aggregateSchemaSha256: hex64,
    physicalGate: z.enum(["PASS", "FAIL", "BLOCK"]),
    sessionCount: z.number().int().min(5).max(8),
    unsafeEventCount: z.literal(0),
    supervisorRegistrySha256: hex64,
    introducedBySha: hex40,
    finalizedAt: isoDateTime,
  })
  .strict();

export const buildReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceSha: hex40,
    sourceTree: hex40,
    buildDigest: sha256Digest,
    builtAt: isoDateTime,
    command: z.string().min(1),
  })
  .strict();
