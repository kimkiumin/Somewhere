"use strict";

function clean(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string" || value.trim() === "") return NaN;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeCandidate(raw) {
  return {
    provider: clean(raw.provider),
    providerPlaceId: clean(raw.providerPlaceId),
    name: clean(raw.name),
    branchName: clean(raw.branchName),
    address: clean(raw.address),
    latitude: finiteNumber(raw.latitude),
    longitude: finiteNumber(raw.longitude),
    category: clean(raw.category),
    priceBand: finiteNumber(raw.priceBand),
    sourceTimestamp: clean(raw.sourceTimestamp),
    evidence: { ...(raw.evidence || {}) },
  };
}

function roundedCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "unknown";
}

function canonicalKey(candidate) {
  return [
    clean(candidate.name).toLowerCase(),
    clean(candidate.branchName).toLowerCase(),
    clean(candidate.address).toLowerCase(),
    roundedCoordinate(candidate.latitude),
    roundedCoordinate(candidate.longitude),
  ].join("|");
}

function hasCompleteBranchIdentity(candidate) {
  return (
    Boolean(candidate.name) &&
    Boolean(candidate.branchName) &&
    Boolean(candidate.address) &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude)
  );
}

function dedupeKey(candidate, index) {
  if (hasCompleteBranchIdentity(candidate)) return canonicalKey(candidate);
  if (candidate.provider && candidate.providerPlaceId) {
    return `provider:${candidate.provider}|${candidate.providerPlaceId}`;
  }
  return `unresolved:${index}`;
}

function mergeEvidence(currentEvidence, incomingEvidence) {
  const merged = { ...currentEvidence };

  for (const [key, value] of Object.entries(incomingEvidence)) {
    if (value == null) continue;
    if (!Object.hasOwn(merged, key)) {
      merged[key] = value;
      continue;
    }
    if (merged[key] === null || !Object.is(merged[key], value)) {
      merged[key] = null;
    }
  }

  return merged;
}

function dedupeCandidates(candidates) {
  const byKey = new Map();
  const mergedRecords = [];

  for (const [index, candidate] of candidates.entries()) {
    const key = dedupeKey(candidate, index);
    if (!byKey.has(key)) {
      byKey.set(key, {
        ...candidate,
        canonicalVenueId: key,
        sources: [candidate.provider],
      });
      continue;
    }

    const current = byKey.get(key);
    current.sources = [...new Set([...current.sources, candidate.provider])].sort();
    current.evidence = mergeEvidence(current.evidence, candidate.evidence);
    mergedRecords.push({
      key,
      provider: candidate.provider,
      providerPlaceId: candidate.providerPlaceId,
    });
  }

  return { candidates: [...byKey.values()], mergedRecords };
}

function evaluateHardFilters(candidate, request, routeFacts) {
  const reasons = [];
  const unknowns = [];

  if (candidate.category !== request.category) reasons.push("category-mismatch");
  if (
    !Number.isFinite(candidate.priceBand) ||
    candidate.priceBand > request.maxPriceBand
  ) {
    reasons.push("price-mismatch");
  }

  if (
    !Number.isFinite(routeFacts.walkingDistanceM) ||
    !Number.isFinite(routeFacts.walkingDurationS)
  ) {
    reasons.push("walking-route-unknown");
  } else {
    if (routeFacts.walkingDistanceM > request.maxWalkingDistanceM) {
      reasons.push("walking-distance-exceeded");
    }
    if (routeFacts.walkingDurationS > request.maxWalkingDurationS) {
      reasons.push("walking-duration-exceeded");
    }
  }

  if (routeFacts.openAtEtaWithBuffer !== true) {
    reasons.push("opening-at-eta-not-proven");
  }

  const evidence = mergeEvidence(candidate.evidence, routeFacts.evidence || {});
  for (const key of request.requiredEvidence || []) {
    if (evidence[key] !== true) unknowns.push(key);
  }

  return {
    pass: reasons.length === 0 && unknowns.length === 0,
    reasons,
    unknowns,
  };
}

module.exports = {
  normalizeCandidate,
  canonicalKey,
  dedupeCandidates,
  evaluateHardFilters,
};
