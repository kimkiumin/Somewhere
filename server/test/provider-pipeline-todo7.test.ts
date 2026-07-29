import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalizeVenues } from "../src/provider/canonicalization";
import { qualifyCandidates } from "../src/provider/evidence";
import {
  EvidenceDocumentSchema,
  parseProviderFixtureBundle,
  RightsDocumentSchema,
  RouteDocumentSchema,
  VenueDocumentSchema,
} from "../src/provider/parser";
import { sealPool } from "../src/provider/pool";

const FIXTURE_ROOT = resolve(import.meta.dirname, "../fixtures/seoul-forest");
const NOW = new Date("2026-07-29T00:00:00Z");

async function readJson(name: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(FIXTURE_ROOT, name), "utf8"));
}

async function loadBundle() {
  return parseProviderFixtureBundle({
    venues: await readJson("venues.json"),
    evidence: await readJson("evidence.json"),
    routes: await readJson("routes.json"),
    rights: await readJson("rights.json"),
  });
}

describe("Todo7 strict provider pipeline", () => {
  it("parses separate restaurant and cafe fixtures without unknown fields", async () => {
    // Given: the repository-reviewed Seoul Forest fixture
    const rawVenues = await readJson("venues.json");

    // When: the venue boundary parses it
    const parsed = VenueDocumentSchema.parse(rawVenues);

    // Then: restaurant and cafe records remain separate
    expect(parsed.restaurants).toHaveLength(1);
    expect(parsed.cafes).toHaveLength(1);
    expect(VenueDocumentSchema.safeParse({ ...parsed, leakedIdentity: true }).success).toBe(false);
  });

  it("rejects expired, ambiguous, unsafe, and rights-missing evidence", async () => {
    // Given: valid typed fixtures and their canonical candidates
    const bundle = await loadBundle();
    const candidates = canonicalizeVenues(bundle.venues);
    const expired = EvidenceDocumentSchema.parse({
      ...bundle.evidence,
      entries: bundle.evidence.entries.map((entry) => ({
        ...entry,
        expiresAt: "2026-07-28T00:00:00Z",
      })),
    });
    const ambiguous = EvidenceDocumentSchema.parse({
      ...bundle.evidence,
      entries: bundle.evidence.entries.map((entry, index) =>
        index === 0 ? { ...entry, facts: { ...entry.facts, merit: "conflicting" } } : entry,
      ),
    });
    const unsafeVenues = VenueDocumentSchema.parse({
      ...bundle.venues,
      restaurants: bundle.venues.restaurants.map((venue) => ({
        ...venue,
        safetyStatus: "unsafe",
      })),
    });
    const missingRights = RightsDocumentSchema.safeParse({
      ...bundle.rights,
      attribution: "",
    });
    const disabledQuota = RightsDocumentSchema.parse({
      ...bundle.rights,
      quota: { ...bundle.rights.quota, enabled: false },
    });

    // When: each negative fixture crosses the deterministic evidence gate
    const expiredResult = qualifyCandidates({ ...bundle, candidates, evidence: expired, now: NOW });
    const ambiguousResult = qualifyCandidates({
      ...bundle,
      candidates,
      evidence: ambiguous,
      now: NOW,
    });
    const unsafeResult = qualifyCandidates({
      ...bundle,
      candidates: canonicalizeVenues(unsafeVenues),
      now: NOW,
    });
    const quotaResult = qualifyCandidates({
      ...bundle,
      candidates,
      rights: disabledQuota,
      now: NOW,
    });

    // Then: no failing fact is relaxed into a qualified destination
    expect(expiredResult.qualified).toHaveLength(0);
    expect(ambiguousResult.rejections).toContainEqual(
      expect.objectContaining({ code: "EVIDENCE_CONFLICTING" }),
    );
    expect(unsafeResult.rejections).toContainEqual(
      expect.objectContaining({ code: "VENUE_UNSAFE" }),
    );
    expect(missingRights.success).toBe(false);
    expect(quotaResult.rejections).toContainEqual(
      expect.objectContaining({ code: "QUOTA_DISABLED" }),
    );
  });

  it("seals a reproducible ordered pool digest from current supported evidence", async () => {
    // Given: one typed fixture bundle at a fixed policy time
    const bundle = await loadBundle();
    const candidates = canonicalizeVenues(bundle.venues);
    const qualified = qualifyCandidates({ ...bundle, candidates, now: NOW });

    // When: the same ordered qualified set is sealed twice
    const first = sealPool({ bundle, qualified: qualified.qualified });
    const second = sealPool({ bundle, qualified: qualified.qualified });

    // Then: both categories are eligible and the immutable digest is reproducible
    expect(first.members).toHaveLength(2);
    expect(first.orderedMemberDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second).toEqual(first);
    expect(Object.isFrozen(first.members)).toBe(true);
  });

  it("strictly rejects malformed route and rights documents", async () => {
    // Given: documents with missing geometry and missing attribution
    const routes = RouteDocumentSchema.parse(await readJson("routes.json"));
    const rights = RightsDocumentSchema.parse(await readJson("rights.json"));
    const malformedRoute = {
      ...routes,
      routes: routes.routes.map((route) => ({ ...route, geometry: [] })),
    };
    const malformedRights = { ...rights, attribution: "" };

    // When: the strict schemas inspect the malformed inputs
    const routeResult = RouteDocumentSchema.safeParse(malformedRoute);
    const rightsResult = RightsDocumentSchema.safeParse(malformedRights);

    // Then: neither malformed document enters the trusted domain
    expect(routeResult.success).toBe(false);
    expect(rightsResult.success).toBe(false);
  });
});
