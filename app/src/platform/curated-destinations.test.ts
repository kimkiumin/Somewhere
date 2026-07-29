import { describe, expect, test } from "vitest";
import bundledDestinations from "../data/curated-destinations.json";
import {
  parseDestinationBundle,
  resolveDeclination,
  selectDestination,
} from "./curated-destinations";

function validBundleInput() {
  return {
    schemaVersion: 1,
    fieldArea: {
      id: "seoul-forest",
      center: { latitude: 37.544_644_3, longitude: 127.037_376_9 },
      validRadiusM: 2_000,
      startZoneNote: "Personal field-test area",
      declination: {
        degreesEast: -9.011_45,
        model: "WMM2025",
        calculatedAt: "2026-07-28",
        reviewAfter: "2027-07-28",
        source: "NOAA NCEI",
      },
    },
    destinations: [
      {
        id: "family-yard",
        coordinates: { latitude: 37.545_033_8, longitude: 127.039_617_2 },
        hint: "An open place where the park breathes.",
        estimatedMinutes: 5,
        reveal: {
          name: "가족마당",
          language: "ko",
          category: "Open lawn",
          description: "A broad lawn inside Seoul Forest.",
        },
        curation: {
          note: "Public outdoor landmark; verify crossings during the walk.",
          reviewedAt: "2026-07-28",
          safeForPersonalFieldTest: true,
        },
      },
      {
        id: "mirror-pond",
        coordinates: { latitude: 37.544_255, longitude: 127.041_037_4 },
        hint: "Still water holds the sky.",
        estimatedMinutes: 7,
        reveal: {
          name: "거울연못",
          language: "ko",
          category: "Pond",
          description: "A reflective pond in Seoul Forest.",
        },
        curation: {
          note: "Public outdoor landmark; remain on paths.",
          reviewedAt: "2026-07-28",
          safeForPersonalFieldTest: true,
        },
      },
    ],
  };
}

describe("curated destination boundary", () => {
  test("parses the shipped seven-destination Seoul Forest bundle", () => {
    const result = parseDestinationBundle(bundledDestinations);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.destinations).toHaveLength(7);
    }
  });

  test("accepts a complete bundle and retains declination provenance", () => {
    const result = parseDestinationBundle(validBundleInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fieldArea.declination).toMatchObject({
        degreesEast: -9.011_45,
        model: "WMM2025",
        source: "NOAA NCEI",
      });
    }
  });

  test("rejects the entire bundle for malformed coordinates or duplicate ids", () => {
    const malformed = validBundleInput();
    const malformedFirst = malformed.destinations[0];
    if (malformedFirst === undefined) {
      throw new Error("Fixture requires a first destination.");
    }
    malformed.destinations[0] = {
      ...malformedFirst,
      coordinates: { latitude: 137, longitude: 127.039_617_2 },
    };
    expect(parseDestinationBundle(malformed).ok).toBe(false);

    const duplicate = validBundleInput();
    const first = duplicate.destinations[0];
    const second = duplicate.destinations[1];
    if (first !== undefined && second !== undefined) {
      duplicate.destinations = [first, { ...second, id: first.id }];
    }
    expect(parseDestinationBundle(duplicate).ok).toBe(false);
  });

  test("rejects destinations outside the declared field area", () => {
    const outside = validBundleInput();
    const first = outside.destinations[0];
    if (first === undefined) {
      throw new Error("Fixture requires a first destination.");
    }
    outside.destinations[0] = {
      ...first,
      coordinates: { latitude: 37.7, longitude: 127.2 },
    };

    expect(parseDestinationBundle(outside).ok).toBe(false);
  });

  test("rejects missing or unsupported revealed-name language metadata", () => {
    const missing = validBundleInput();
    const missingReveal = missing.destinations[0]?.reveal;
    if (missingReveal === undefined) {
      throw new Error("Fixture requires a revealed destination.");
    }
    Reflect.deleteProperty(missingReveal, "language");
    expect(parseDestinationBundle(missing).ok).toBe(false);

    const unsupported = validBundleInput();
    const unsupportedReveal = unsupported.destinations[0]?.reveal;
    if (unsupportedReveal === undefined) {
      throw new Error("Fixture requires a revealed destination.");
    }
    Reflect.set(unsupportedReveal, "language", "fr");
    expect(parseDestinationBundle(unsupported).ok).toBe(false);
  });

  test("reroll excludes the current destination deterministically", () => {
    const result = parseDestinationBundle(validBundleInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(selectDestination(result.value.destinations, "family-yard", 0)?.id).toBe(
        "mirror-pond",
      );
      expect(selectDestination(result.value.destinations, "mirror-pond", 0)?.id).toBe(
        "family-yard",
      );
    }
  });

  test("uses stored declination only inside its area and review window", () => {
    const result = parseDestinationBundle(validBundleInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        resolveDeclination(
          result.value.fieldArea,
          { latitude: 37.544_7, longitude: 127.037_4 },
          "2027-07-28",
        ),
      ).toBe(-9.011_45);
      expect(
        resolveDeclination(
          result.value.fieldArea,
          { latitude: 37.7, longitude: 127.2 },
          "2027-07-28",
        ),
      ).toBeNull();
      expect(
        resolveDeclination(
          result.value.fieldArea,
          { latitude: 37.544_7, longitude: 127.037_4 },
          "2027-07-29",
        ),
      ).toBeNull();
    }
  });
});
