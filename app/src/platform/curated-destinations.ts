import { z } from "zod";
import { distanceMeters } from "../domain/geo";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict()
  .readonly();
const declinationSchema = z
  .object({
    degreesEast: z.number().finite().min(-30).max(30),
    model: z.literal("WMM2025"),
    calculatedAt: isoDate,
    reviewAfter: isoDate,
    source: z.string().trim().min(1),
  })
  .strict()
  .readonly();
const fieldAreaSchema = z
  .object({
    id: z.string().trim().min(1),
    center: coordinatesSchema,
    validRadiusM: z.number().finite().positive().max(10_000),
    startZoneNote: z.string().trim().min(1),
    declination: declinationSchema,
  })
  .strict()
  .readonly();
const destinationSchema = z
  .object({
    id: z.string().trim().min(1),
    coordinates: coordinatesSchema,
    hint: z.string().trim().min(1),
    estimatedMinutes: z.number().int().positive().max(60),
    reveal: z
      .object({
        name: z.string().trim().min(1),
        category: z.string().trim().min(1),
        description: z.string().trim().min(1),
      })
      .strict()
      .readonly(),
    curation: z
      .object({
        note: z.string().trim().min(1),
        reviewedAt: isoDate,
        safeForPersonalFieldTest: z.literal(true),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();
const destinationBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    fieldArea: fieldAreaSchema,
    destinations: z.array(destinationSchema).min(2).max(10).readonly(),
  })
  .strict()
  .readonly();

export type CuratedDestination = z.infer<typeof destinationSchema>;
export type FieldArea = z.infer<typeof fieldAreaSchema>;
export type DestinationBundle = z.infer<typeof destinationBundleSchema>;

export type DestinationBundleResult =
  | { readonly ok: true; readonly value: DestinationBundle }
  | { readonly ok: false; readonly issues: readonly string[] };

export function parseDestinationBundle(input: unknown): DestinationBundleResult {
  const parsed = destinationBundleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const ids = new Set<string>();
  const issues: string[] = [];
  for (const destination of parsed.data.destinations) {
    if (ids.has(destination.id)) {
      issues.push(`Duplicate destination id: ${destination.id}`);
    }
    ids.add(destination.id);

    const distance = distanceMeters(parsed.data.fieldArea.center, destination.coordinates);
    if (distance === null || distance > parsed.data.fieldArea.validRadiusM) {
      issues.push(`Destination outside field area: ${destination.id}`);
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: parsed.data };
}

export function selectDestination(
  destinations: readonly CuratedDestination[],
  excludedId: string | null,
  randomUnit: number,
): CuratedDestination | null {
  if (!Number.isFinite(randomUnit) || randomUnit < 0 || randomUnit >= 1) {
    return null;
  }

  const candidates = destinations.filter((destination) => destination.id !== excludedId);
  if (candidates.length === 0) {
    return null;
  }

  const index = Math.floor(randomUnit * candidates.length);
  return candidates[index] ?? null;
}

export function resolveDeclination(
  fieldArea: FieldArea,
  coordinates: z.infer<typeof coordinatesSchema>,
  todayIsoDate: string,
): number | null {
  if (!isoDate.safeParse(todayIsoDate).success) {
    return null;
  }
  if (
    todayIsoDate < fieldArea.declination.calculatedAt ||
    todayIsoDate > fieldArea.declination.reviewAfter
  ) {
    return null;
  }

  const distance = distanceMeters(fieldArea.center, coordinates);
  if (distance === null || distance > fieldArea.validRadiusM) {
    return null;
  }

  return fieldArea.declination.degreesEast;
}
