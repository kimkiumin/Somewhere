import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { RouteDocumentSchema } from "../src/provider/parser";
import { getReviewedRoute } from "../src/provider/route";

const ROUTES_PATH = resolve(import.meta.dirname, "../fixtures/seoul-forest/routes.json");
const NOW = new Date("2026-07-29T00:00:00Z");

async function loadRoutes() {
  return RouteDocumentSchema.parse(JSON.parse(await readFile(ROUTES_PATH, "utf8")));
}

describe("Todo7 reviewed walking route adapter", () => {
  it("returns ordered reviewed geometry only from an approved origin zone", async () => {
    // Given: a current route fixture and an accurate origin at its reviewed anchor
    const fixture = await loadRoutes();

    // When: the manual adapter resolves the reviewed destination route
    const result = getReviewedRoute({
      fixture,
      candidateId: "manual:center-coffee-seoul-forest",
      origin: { latitude: 37.54385, longitude: 127.03695 },
      accuracyM: 10,
      now: NOW,
    });

    // Then: it returns nonempty ordered geometry and no direct-bearing field
    expect(result.kind).toBe("available");
    if (result.kind !== "available") {
      throw new TypeError("expected available route");
    }
    expect(result.route.geometry).toHaveLength(3);
    expect(result.route.geometry[0]).toEqual({ latitude: 37.54385, longitude: 127.03695 });
    expect(Object.keys(result.route)).not.toContain("bearing");
    expect(Object.isFrozen(result.route.geometry)).toBe(true);
  });

  it("returns unavailable for off-zone, stale, inaccurate, or changed routes", async () => {
    // Given: current geometry plus unsupported origin and route states
    const fixture = await loadRoutes();
    const expiredFixture = RouteDocumentSchema.parse({
      ...fixture,
      routes: fixture.routes.map((route) => ({
        ...route,
        expiresAt: "2026-07-28T00:00:00Z",
      })),
    });
    const changedFixture = RouteDocumentSchema.parse({
      ...fixture,
      routes: fixture.routes.map((route) => ({ ...route, materialChangeReported: true })),
    });
    const tamperedFixture = RouteDocumentSchema.parse({
      ...fixture,
      routes: fixture.routes.map((route) => ({
        ...route,
        endpointDigest: `sha256:${"0".repeat(64)}`,
      })),
    });

    // When: each unsafe route request reaches the manual adapter
    const offZone = getReviewedRoute({
      fixture,
      candidateId: "manual:center-coffee-seoul-forest",
      origin: { latitude: 37.55, longitude: 127.05 },
      accuracyM: 10,
      now: NOW,
    });
    const expired = getReviewedRoute({
      fixture: expiredFixture,
      candidateId: "manual:center-coffee-seoul-forest",
      origin: { latitude: 37.54385, longitude: 127.03695 },
      accuracyM: 10,
      now: NOW,
    });
    const inaccurate = getReviewedRoute({
      fixture,
      candidateId: "manual:center-coffee-seoul-forest",
      origin: { latitude: 37.54385, longitude: 127.03695 },
      accuracyM: 60,
      now: NOW,
    });
    const changed = getReviewedRoute({
      fixture: changedFixture,
      candidateId: "manual:center-coffee-seoul-forest",
      origin: { latitude: 37.54385, longitude: 127.03695 },
      accuracyM: 10,
      now: NOW,
    });
    const tampered = getReviewedRoute({
      fixture: tamperedFixture,
      candidateId: "manual:center-coffee-seoul-forest",
      origin: { latitude: 37.54385, longitude: 127.03695 },
      accuracyM: 10,
      now: NOW,
    });

    // Then: every case fails closed with no geometry or bearing fallback
    expect([offZone, expired, inaccurate, changed, tampered]).toEqual([
      { kind: "unavailable", code: "ORIGIN_ZONE_UNSUPPORTED" },
      { kind: "unavailable", code: "ROUTE_EXPIRED" },
      { kind: "unavailable", code: "ORIGIN_ACCURACY_UNSUPPORTED" },
      { kind: "unavailable", code: "ROUTE_MATERIAL_CHANGE" },
      { kind: "unavailable", code: "ROUTE_GEOMETRY_INVALID" },
    ]);
  });
});
