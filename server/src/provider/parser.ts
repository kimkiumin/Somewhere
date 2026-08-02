import { z } from "zod";

const DateTimeSchema = z.string().datetime({ offset: true });
const IdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9:._-]{1,127}$/);
const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const PointSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict()
  .readonly();

const VenueBaseSchema = z
  .object({
    candidateId: IdentifierSchema,
    providerPlaceId: IdentifierSchema,
    branchName: z.string().min(1).max(160),
    normalizedBranchName: z.string().min(1).max(160),
    address: z.string().min(1).max(300),
    coordinates: PointSchema,
    priceBand: z.number().int().min(1).max(4),
    broadMenuCategory: z.string().min(1).max(100),
    safetyStatus: z.enum(["reviewed", "unsafe"]),
    sourceIds: z.array(IdentifierSchema).min(1),
    reviewedAt: DateTimeSchema,
    expiresAt: DateTimeSchema,
  })
  .strict();

export const VenueDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureVersion: z.string().min(1).max(128),
    canonicalizationVersion: z.string().min(1).max(64),
    fieldAreaId: IdentifierSchema,
    provider: z
      .object({
        id: IdentifierSchema,
        capabilityVersion: z.string().min(1).max(64),
        queryVersion: z.string().min(1).max(64),
        paginationVersion: z.string().min(1).max(64),
        coverageVersion: z.string().min(1).max(64),
        retrievedAt: DateTimeSchema,
      })
      .strict()
      .readonly(),
    restaurants: z.array(VenueBaseSchema.extend({ category: z.literal("restaurant") })).min(1),
    cafes: z.array(VenueBaseSchema.extend({ category: z.literal("cafe") })).min(1),
  })
  .strict()
  .readonly();

const EvidenceStatusSchema = z.enum(["supported", "unknown", "conflicting"]);

export const EvidenceDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureVersion: z.string().min(1).max(128),
    policyVersion: z.string().min(1).max(64),
    entries: z
      .array(
        z
          .object({
            candidateId: IdentifierSchema,
            snapshotVersion: z.string().min(1).max(160),
            sourceId: IdentifierSchema,
            sourceUrl: z.url().regex(/^https:\/\//),
            sourceRightNote: z.string().min(1).max(500),
            reviewer: z.string().min(1).max(128),
            observedAt: DateTimeSchema,
            expiresAt: DateTimeSchema,
            facts: z
              .object({
                category: EvidenceStatusSchema,
                price: EvidenceStatusSchema,
                safety: EvidenceStatusSchema,
                route: EvidenceStatusSchema,
                merit: EvidenceStatusSchema,
              })
              .strict()
              .readonly(),
            merit: z
              .object({
                type: z.enum(["menu", "taste", "atmosphere", "distinctiveness"]),
                claim: z.string().min(1).max(160),
                confidence: z.enum(["high", "medium", "low"]),
                evidenceIds: z.array(IdentifierSchema).min(1),
              })
              .strict()
              .readonly(),
            criticalWeaknesses: z.array(z.string().min(1).max(300)),
          })
          .strict()
          .readonly(),
      )
      .min(1),
  })
  .strict()
  .readonly();

export const RightsDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureVersion: z.string().min(1).max(128),
    providerId: IdentifierSchema,
    adapterVersion: z.string().min(1).max(64),
    reviewStatus: z.enum(["approved", "blocked"]),
    reviewedAt: DateTimeSchema,
    expiresAt: DateTimeSchema,
    reviewer: z.string().min(1).max(128),
    attribution: z.string().min(1).max(500),
    sourceRightNote: z.string().min(1).max(500),
    permitted: z
      .object({
        search: z.literal(true),
        routing: z.literal(true),
        storeDerived: z.literal(true),
        displayAfterReveal: z.literal(true),
        commercialApiDataCopied: z.literal(false),
      })
      .strict()
      .readonly(),
    quota: z
      .object({
        enabled: z.boolean(),
        hardDailyCap: z.number().int().positive(),
        billableFallback: z.literal(false),
        reservationOwner: z.string().min(1).max(128),
        checkedAt: DateTimeSchema,
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

const RouteSchema = z
  .object({
    routeId: IdentifierSchema,
    candidateId: IdentifierSchema,
    approvedOriginZoneIds: z.array(IdentifierSchema).min(1),
    capturedAt: DateTimeSchema,
    independentlyReviewedAt: DateTimeSchema,
    expiresAt: DateTimeSchema,
    sourceRightNote: z.string().min(1).max(500),
    geometry: z.array(PointSchema).min(2),
    lengthM: z.number().int().positive(),
    expectedDurationSeconds: z.number().int().positive(),
    corridorWidthM: z.number().positive().max(100),
    endpointDigest: DigestSchema,
    observedObstructions: z.string().min(1).max(500),
    accessibilityNote: z.string().min(1).max(500),
    fieldValidation: z.enum(["reviewed", "blocked"]),
    verifier: z.string().min(1).max(128),
    materialChangeReported: z.boolean(),
  })
  .strict()
  .readonly();

export const RouteDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureVersion: z.string().min(1).max(128),
    providerId: IdentifierSchema,
    capabilityVersion: z.string().min(1).max(64),
    fieldAreaId: IdentifierSchema,
    originZones: z
      .array(
        z
          .object({
            zoneId: IdentifierSchema,
            polygon: z.array(PointSchema).min(3),
            startAnchor: PointSchema,
            maximumOriginOffsetM: z.number().positive().max(100),
          })
          .strict()
          .readonly(),
      )
      .min(1),
    routes: z.array(RouteSchema).min(1),
  })
  .strict()
  .readonly();

export type VenueDocument = z.infer<typeof VenueDocumentSchema>;
export type Venue = VenueDocument["restaurants"][number] | VenueDocument["cafes"][number];
export type EvidenceDocument = z.infer<typeof EvidenceDocumentSchema>;
export type RightsDocument = z.infer<typeof RightsDocumentSchema>;
export type RouteDocument = z.infer<typeof RouteDocumentSchema>;
export type Point = z.infer<typeof PointSchema>;

export type ProviderFixtureBundle = Readonly<{
  venues: VenueDocument;
  evidence: EvidenceDocument;
  routes: RouteDocument;
  rights: RightsDocument;
}>;

export function parseProviderFixtureBundle(input: {
  readonly venues: unknown;
  readonly evidence: unknown;
  readonly routes: unknown;
  readonly rights: unknown;
}): ProviderFixtureBundle {
  return Object.freeze({
    venues: VenueDocumentSchema.parse(input.venues),
    evidence: EvidenceDocumentSchema.parse(input.evidence),
    routes: RouteDocumentSchema.parse(input.routes),
    rights: RightsDocumentSchema.parse(input.rights),
  });
}
