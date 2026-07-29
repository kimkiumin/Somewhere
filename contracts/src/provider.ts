import { z } from "zod";

const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const DateTimeSchema = z.string().datetime({ offset: true });
const HttpsUrlSchema = z.url().regex(/^https:\/\//);
const AttestorSchema = z.object({
  name: z.string().min(1).max(128),
  role: z.string().min(1).max(128),
  organization: z.string().min(1).max(128),
  attestationDigest: DigestSchema,
}).strict().readonly();

export const ProviderRightsRecordV1Schema = z.object({
  schemaVersion: z.literal(1),
  providerId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
  adapterVersion: z.string().min(1).max(64),
  environment: z.enum(["staging", "production"]),
  reviewedReleaseDigest: DigestSchema,
  terms: z.object({
    documentUrl: HttpsUrlSchema,
    versionOrPublishedAt: z.string().min(1),
    reviewedAt: DateTimeSchema,
    expiresAt: DateTimeSchema,
  }).strict(),
  rights: z.object({
    search: z.literal(true),
    routing: z.literal(true),
    storeRaw: z.boolean(),
    storeDerived: z.literal(true),
    cacheTtlSeconds: z.number().int().min(0).max(2_592_000),
    display: z.literal(true),
    attribution: z.string().min(1).max(500),
    manualFixture: z.boolean(),
    commercialPilot: z.literal(true),
    geographies: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
    deletionMechanism: z.string().min(1).max(500),
  }).strict(),
  dataFlow: z.object({
    endpointOrigins: z.array(HttpsUrlSchema).min(1),
    methods: z.array(z.enum(["GET", "POST"])).min(1),
    sendsPreciseOrigin: z.boolean(),
    sendsDestination: z.boolean(),
    processingRegions: z.array(z.string().min(2).max(64)).min(1),
    providerRetentionDays: z.number().int().min(0).max(3650),
    subprocessorEvidenceDigest: DigestSchema,
  }).strict(),
  quota: z.object({
    unit: z.string().min(1).max(64),
    hardDailyCap: z.number().int().min(1),
    billableFallback: z.literal(false),
    payer: z.string().min(1).max(128),
    checkedAt: DateTimeSchema,
    reservationOwner: z.string().min(1).max(128),
  }).strict(),
  credential: z.object({
    bindingName: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    scopeDigest: DigestSchema,
    rotatedAt: DateTimeSchema,
    expiresAt: DateTimeSchema,
  }).strict(),
  evidence: z.object({
    owner: AttestorSchema,
    legalReviewer: AttestorSchema,
    securityReviewer: AttestorSchema,
    signedAt: DateTimeSchema,
    artifactDigest: DigestSchema,
  }).strict(),
  decision: z.enum(["PASS", "BLOCK"]),
}).strict().readonly();

export const KoreaReviewRecordV1Schema = z.object({
  schemaVersion: z.literal(1),
  environment: z.enum(["staging", "production"]),
  reviewedReleaseDigest: DigestSchema,
  reviewedDataFlowDigest: DigestSchema,
  reviewedRetentionPolicyDigest: DigestSchema,
  reviewedAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  reviewer: z.object({
    name: z.string().min(1).max(128),
    qualification: z.string().min(1).max(256),
    organization: z.string().min(1).max(128),
    independent: z.literal(true),
  }).strict(),
  classification: z.object({
    locationInformationBusiness: z.enum(["APPLIES", "DOES_NOT_APPLY", "COUNSEL_DETERMINATION_REQUIRED"]),
    locationBasedServiceBusiness: z.enum(["APPLIES", "DOES_NOT_APPLY", "COUNSEL_DETERMINATION_REQUIRED"]),
    registrationOrReportingRequired: z.enum(["REQUIRED_AND_COMPLETE", "NOT_REQUIRED", "UNRESOLVED"]),
    evidenceDigest: DigestSchema,
  }).strict(),
  crossBorder: z.object({
    preciseLocationLeavesKorea: z.boolean(),
    destinationLeavesKorea: z.boolean(),
    countriesOrRegions: z.array(z.string().min(2).max(64)).min(1),
    legalBasis: z.string().min(1).max(1000),
    noticeAndConsentMechanism: z.string().min(1).max(1000),
    processorInventoryDigest: DigestSchema,
  }).strict(),
  cloudflareFactsAcknowledged: z.object({
    d1HasNoKoreaJurisdiction: z.literal(true),
    d1ApacIsOnlyHint: z.literal(true),
    doHasNoKoreaJurisdiction: z.literal(true),
    doApacNeIsOnlyHint: z.literal(true),
    regionalServicesDoesNotProveD1OrDoKoreaResidency: z.literal(true),
    d1TimeTravelDays: z.literal(7),
    doPitrDays: z.literal(30),
  }).strict(),
  userRights: z.object({
    privacyNoticeDigest: DigestSchema,
    deletionRunbookDigest: DigestSchema,
    incidentContact: z.string().min(1).max(256),
    pitrDisclosureApproved: z.literal(true),
  }).strict(),
  openFindings: z.array(z.object({
    id: z.string().min(1).max(64),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    status: z.enum(["OPEN", "ACCEPTED", "CLOSED"]),
  }).strict()),
  conditions: z.array(z.string().min(1).max(1000)),
  decision: z.enum(["PASS", "BLOCK"]),
  attestationDigest: DigestSchema,
}).strict().readonly();

export const PROVIDER_ADAPTER_POLICY_V1 = {
  schemaVersion: 1,
  protocol: "https:",
  redirect: "manual",
  acceptedRedirects: 0,
  totalTimeoutMs: 3000,
  compressedResponseMaxBytes: 262144,
  decompressedResponseMaxBytes: 524288,
  jsonMaxDepth: 12,
  arrayMaxItems: 200,
  retryCount: 1,
  retryRequiresIdempotentReservation: true,
} as const;
