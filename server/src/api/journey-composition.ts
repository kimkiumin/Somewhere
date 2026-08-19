import { z } from "zod";
import type { JourneyCreateBodyV1Schema } from "../../../contracts/src/journey";

import evidenceJson from "../../fixtures/seoul-forest/evidence.json";
import rightsJson from "../../fixtures/seoul-forest/rights.json";
import routesJson from "../../fixtures/seoul-forest/routes.json";
import venuesJson from "../../fixtures/seoul-forest/venues.json";
import { canonicalizeVenues } from "../provider/canonicalization";
import { qualifyCandidates } from "../provider/evidence";
import { parseProviderFixtureBundle } from "../provider/parser";
import { sealPool } from "../provider/pool";
import { getReviewedRoute } from "../provider/route";
import { type RandomUint32, selectDestination } from "../provider/selection";

type CreateBody = z.infer<typeof JourneyCreateBodyV1Schema>;

export const PreparedJourneySchema = z
  .object({
    disclosure: z
      .object({
        policyVersion: z.string(),
        priceBand: z.enum(["low", "medium", "high", "unknown"]),
        representativeCategories: z.union([
          z.tuple([z.string()]),
          z.tuple([z.string(), z.string()]),
        ]),
        routeDistanceM: z.number(),
        routeDurationMinutes: z.number(),
      })
      .strict()
      .readonly(),
    identity: z.object({ address: z.string(), name: z.string() }).strict().readonly(),
    journeyId: z.string(),
    kind: z.literal("ready"),
    receipt: z
      .object({
        poolDigest: z.string(),
        poolId: z.string(),
        receiptDigest: z.string(),
        receiptId: z.string(),
        selectedMemberDigest: z.string(),
      })
      .strict()
      .readonly(),
    route: z
      .object({
        encodedPolyline: z.string(),
        expiresAt: z.number(),
        geometry: z.array(z.tuple([z.number(), z.number()])),
        originZoneRef: z.string(),
        routeDigest: z.string(),
        routeVersion: z.string(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export type PreparedJourney = z.infer<typeof PreparedJourneySchema>;

export type JourneyPreparation =
  | PreparedJourney
  | Readonly<{ code: "no_fit" | "route_unavailable" | "provider_unavailable"; kind: "error" }>;

const FIXTURE = parseProviderFixtureBundle({
  evidence: evidenceJson,
  rights: rightsJson,
  routes: routesJson,
  venues: venuesJson,
});

function indexFirstByCandidate<T extends Readonly<{ candidateId: string }>>(
  values: readonly T[],
): ReadonlyMap<string, T> {
  const index = new Map<string, T>();
  for (const value of values) {
    if (!index.has(value.candidateId)) {
      index.set(value.candidateId, value);
    }
  }
  return index;
}

const CANDIDATES = canonicalizeVenues(FIXTURE.venues);
const ROUTES_BY_CANDIDATE = indexFirstByCandidate(FIXTURE.routes.routes);
const VENUES_BY_CANDIDATE = indexFirstByCandidate([
  ...FIXTURE.venues.restaurants,
  ...FIXTURE.venues.cafes,
]);

function priceBand(value: number): "low" | "medium" | "high" | "unknown" {
  if (value === 1) {
    return "low";
  }
  if (value === 2) {
    return "medium";
  }
  if (value >= 3) {
    return "high";
  }
  return "unknown";
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildJourneyPreparation(
  input: Readonly<{
    body: CreateBody;
    journeyId: string;
    now: Date;
    requestId: string;
    randomUint32?: RandomUint32;
  }>,
): Promise<JourneyPreparation> {
  const evidence = qualifyCandidates({ ...FIXTURE, candidates: CANDIDATES, now: input.now });
  const qualifiedSnapshotsByCandidate = new Map<string, Set<string>>();
  for (const candidate of evidence.qualified) {
    const snapshots = qualifiedSnapshotsByCandidate.get(candidate.candidateId) ?? new Set<string>();
    snapshots.add(candidate.snapshotVersion);
    qualifiedSnapshotsByCandidate.set(candidate.candidateId, snapshots);
  }
  const durationLimitSeconds = input.body.constraints.maxWalkMinutes * 60;
  const qualified = evidence.qualified.filter((candidate) => {
    if (candidate.category !== input.body.constraints.category) {
      return false;
    }
    const route = ROUTES_BY_CANDIDATE.get(candidate.candidateId);
    return route !== undefined && route.expectedDurationSeconds <= durationLimitSeconds;
  });
  if (qualified.length === 0) {
    return { code: "no_fit", kind: "error" };
  }
  const pool = sealPool({ bundle: FIXTURE, qualified });
  const selected = await selectDestination({
    pool,
    requestId: input.requestId,
    revalidate: async (member) => {
      const currentSnapshots = qualifiedSnapshotsByCandidate.get(member.candidateId);
      return currentSnapshots?.has(member.snapshotVersion) === true
        ? { verdict: "pass" }
        : { code: "POLICY_UPDATED", verdict: "reject" };
    },
    ...(input.randomUint32 === undefined ? {} : { randomUint32: input.randomUint32 }),
  });
  if (selected.kind === "no_fit") {
    return { code: "no_fit", kind: "error" };
  }
  const reviewedRoute = getReviewedRoute({
    accuracyM: input.body.origin.accuracyM,
    candidateId: selected.member.candidateId,
    fixture: FIXTURE.routes,
    now: input.now,
    origin: input.body.origin,
  });
  if (reviewedRoute.kind === "unavailable") {
    return { code: "route_unavailable", kind: "error" };
  }
  const venue = VENUES_BY_CANDIDATE.get(selected.member.candidateId);
  const originZoneRef = FIXTURE.routes.originZones.find((zone) =>
    reviewedRoute.route.routeId.includes(zone.zoneId.replace("seoul-forest-", "")),
  )?.zoneId;
  if (venue === undefined || originZoneRef === undefined) {
    return { code: "provider_unavailable", kind: "error" };
  }
  const geometry = reviewedRoute.route.geometry.map((point): [number, number] => [
    point.longitude,
    point.latitude,
  ]);
  const receiptJson = JSON.stringify(selected.receipt);
  const receiptDigest = await sha256(receiptJson);
  const selectedMemberDigest = await sha256(
    `${selected.member.canonicalId}\0${selected.member.candidateId}\0${selected.member.snapshotVersion}`,
  );
  return {
    disclosure: {
      policyVersion: pool.evidencePolicyVersion,
      priceBand: priceBand(selected.member.priceBand),
      representativeCategories: [selected.member.broadMenuCategory],
      routeDistanceM: reviewedRoute.route.lengthM,
      routeDurationMinutes: reviewedRoute.route.expectedDurationSeconds / 60,
    },
    identity: { address: venue.address, name: venue.branchName },
    journeyId: input.journeyId,
    kind: "ready",
    receipt: {
      poolDigest: pool.orderedMemberDigest.slice(7),
      poolId: pool.poolId,
      receiptDigest,
      receiptId: `receipt:${receiptDigest}`,
      selectedMemberDigest,
    },
    route: {
      encodedPolyline: Buffer.from(JSON.stringify(geometry)).toString("base64url"),
      expiresAt: Date.parse(reviewedRoute.route.expiresAt),
      geometry,
      originZoneRef,
      routeDigest: reviewedRoute.route.endpointDigest,
      routeVersion: reviewedRoute.route.capabilityVersion,
    },
  };
}

export function projectReadyJourney(prepared: PreparedJourney, sequence: number, revealed: false) {
  return {
    contractVersion: 1,
    journeyId: prepared.journeyId,
    sequence,
    disclosure: {
      routeDistanceM: prepared.disclosure.routeDistanceM,
      routeDurationMinutes: prepared.disclosure.routeDurationMinutes,
      representativeCategories: prepared.disclosure.representativeCategories,
      priceBand: prepared.disclosure.priceBand,
      policyVersion: prepared.disclosure.policyVersion,
    },
    phase: "ready",
    actions: ["commit", "reveal", "stop"],
    revealed,
  } as const;
}

export function projectCommittedJourney(
  prepared: PreparedJourney,
  sequence: number,
  revealed: false,
) {
  return {
    actions: ["reveal", "stop", "route-recover", "arrival"],
    contractVersion: 1,
    disclosure: prepared.disclosure,
    guidance: {
      encodedPolyline: prepared.route.encodedPolyline,
      expiresAt: prepared.route.expiresAt,
      kind: "route",
      routeDigest: prepared.route.routeDigest,
      routeVersion: prepared.route.routeVersion,
    },
    journeyId: prepared.journeyId,
    phase: "following",
    revealed,
    sequence,
  } as const;
}

export function projectRevealedJourney<
  T extends ReturnType<typeof projectReadyJourney> | ReturnType<typeof projectCommittedJourney>,
>(projection: T, identity: PreparedJourney["identity"], sequence: number) {
  const actions = projection.actions.filter((action) => action !== "reveal");
  return {
    ...projection,
    actions,
    reveal: identity,
    revealed: true,
    sequence,
  };
}
