import { createHash } from "node:crypto";

import type { Venue, VenueDocument } from "./parser";

export type CanonicalCandidate = Readonly<{
  canonicalId: string;
  canonicalizationVersion: string;
  venue: Venue;
}>;

function canonicalId(providerId: string, providerPlaceId: string): string {
  const digest = createHash("sha256")
    .update(`${providerId}\0${providerPlaceId}`, "utf8")
    .digest("hex");
  return `canonical:${digest}`;
}

export function canonicalizeVenues(document: VenueDocument): readonly CanonicalCandidate[] {
  const candidates = [...document.restaurants, ...document.cafes];
  const seenProviderPlaces = new Set<string>();
  const canonical: CanonicalCandidate[] = [];
  for (const venue of candidates) {
    const providerKey = `${document.provider.id}\0${venue.providerPlaceId}`;
    if (seenProviderPlaces.has(providerKey)) {
      continue;
    }
    seenProviderPlaces.add(providerKey);
    canonical.push(
      Object.freeze({
        canonicalId: canonicalId(document.provider.id, venue.providerPlaceId),
        canonicalizationVersion: document.canonicalizationVersion,
        venue,
      }),
    );
  }
  return Object.freeze(canonical);
}
