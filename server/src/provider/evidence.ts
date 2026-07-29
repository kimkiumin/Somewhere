import type { CanonicalCandidate } from "./canonicalization";
import type {
  EvidenceDocument,
  ProviderFixtureBundle,
  RightsDocument,
  RouteDocument,
} from "./parser";

export type QualifiedCandidate = Readonly<{
  canonicalId: string;
  candidateId: string;
  snapshotVersion: string;
  category: "restaurant" | "cafe";
  priceBand: number;
  broadMenuCategory: string;
}>;

export type EvidenceRejectionCode =
  | "RIGHTS_BLOCKED"
  | "RIGHTS_EXPIRED"
  | "QUOTA_DISABLED"
  | "QUOTA_STALE"
  | "VENUE_UNSAFE"
  | "VENUE_EXPIRED"
  | "EVIDENCE_MISSING"
  | "EVIDENCE_EXPIRED"
  | "EVIDENCE_CONFLICTING"
  | "MERIT_UNSUPPORTED"
  | "ROUTE_UNAVAILABLE";

export type EvidenceRejection = Readonly<{
  candidateId: string;
  code: EvidenceRejectionCode;
}>;

function isCurrent(value: string, now: Date): boolean {
  return now.getTime() < new Date(value).getTime();
}

function rightsFailure(rights: RightsDocument, providerId: string, now: Date) {
  if (rights.reviewStatus !== "approved" || rights.providerId !== providerId) {
    return "RIGHTS_BLOCKED" as const;
  }
  if (!isCurrent(rights.expiresAt, now)) {
    return "RIGHTS_EXPIRED" as const;
  }
  if (!rights.quota.enabled) {
    return "QUOTA_DISABLED" as const;
  }
  const quotaAgeMs = now.getTime() - new Date(rights.quota.checkedAt).getTime();
  if (quotaAgeMs > 30 * 24 * 60 * 60 * 1000) {
    return "QUOTA_STALE" as const;
  }
  return undefined;
}

function routeIsCurrent(routes: RouteDocument, candidateId: string, now: Date): boolean {
  return routes.routes.some(
    (route) =>
      route.candidateId === candidateId &&
      route.fieldValidation === "reviewed" &&
      !route.materialChangeReported &&
      isCurrent(route.expiresAt, now),
  );
}

function evidenceFailure(
  candidate: CanonicalCandidate,
  evidence: EvidenceDocument,
  routes: RouteDocument,
  now: Date,
): EvidenceRejectionCode | undefined {
  if (candidate.venue.safetyStatus !== "reviewed") {
    return "VENUE_UNSAFE";
  }
  if (!isCurrent(candidate.venue.expiresAt, now)) {
    return "VENUE_EXPIRED";
  }
  const entry = evidence.entries.find((item) => item.candidateId === candidate.venue.candidateId);
  if (entry === undefined) {
    return "EVIDENCE_MISSING";
  }
  if (!isCurrent(entry.expiresAt, now)) {
    return "EVIDENCE_EXPIRED";
  }
  const factStatuses = Object.values(entry.facts);
  if (factStatuses.includes("conflicting") || factStatuses.includes("unknown")) {
    return "EVIDENCE_CONFLICTING";
  }
  if (entry.merit.confidence !== "high" || entry.criticalWeaknesses.length > 0) {
    return "MERIT_UNSUPPORTED";
  }
  if (!entry.merit.evidenceIds.includes(entry.sourceId)) {
    return "MERIT_UNSUPPORTED";
  }
  if (!routeIsCurrent(routes, candidate.venue.candidateId, now)) {
    return "ROUTE_UNAVAILABLE";
  }
  return undefined;
}

export function qualifyCandidates(
  input: ProviderFixtureBundle & {
    readonly candidates: readonly CanonicalCandidate[];
    readonly now: Date;
  },
): Readonly<{
  qualified: readonly QualifiedCandidate[];
  rejections: readonly EvidenceRejection[];
}> {
  const globalFailure = rightsFailure(input.rights, input.venues.provider.id, input.now);
  const qualified: QualifiedCandidate[] = [];
  const rejections: EvidenceRejection[] = [];
  for (const candidate of input.candidates) {
    const code =
      globalFailure ?? evidenceFailure(candidate, input.evidence, input.routes, input.now);
    if (code !== undefined) {
      rejections.push(Object.freeze({ candidateId: candidate.venue.candidateId, code }));
      continue;
    }
    const entry = input.evidence.entries.find(
      (item) => item.candidateId === candidate.venue.candidateId,
    );
    if (entry === undefined) {
      rejections.push(
        Object.freeze({ candidateId: candidate.venue.candidateId, code: "EVIDENCE_MISSING" }),
      );
      continue;
    }
    qualified.push(
      Object.freeze({
        canonicalId: candidate.canonicalId,
        candidateId: candidate.venue.candidateId,
        snapshotVersion: entry.snapshotVersion,
        category: candidate.venue.category,
        priceBand: candidate.venue.priceBand,
        broadMenuCategory: candidate.venue.broadMenuCategory,
      }),
    );
  }
  return Object.freeze({
    qualified: Object.freeze(qualified),
    rejections: Object.freeze(rejections),
  });
}
