export const CANARY_SURFACES = [
  "build",
  "http",
  "log",
  "d1",
  "do",
  "queue",
  "dlq",
  "test-artifact",
] as const;
export type CanarySurface = (typeof CANARY_SURFACES)[number];

export type CanaryFinding = Readonly<{
  detectorId: string;
  surface: CanarySurface;
}>;

const COMMON_DETECTORS = [
  ["canary-secret", /SOMEWHERE_CANARY_(?:SECRET|LOCATION|SESSION)/u],
] as const;

const PRIVATE_SURFACE_DETECTORS = [
  ["precise-coordinate", /(?:latitude|longitude|coordinate|polyline|raw[_-]?trace)/iu],
  ["credential", /(?:authorization|bearer|cookie|set-cookie|csrf[_-]?token|api[_-]?key)/iu],
] as const;

const LOG_DETECTORS = [
  ...PRIVATE_SURFACE_DETECTORS,
  ["url", /(?:https?:\/\/|\/api\/[^"\s?]+\?)/iu],
  ["query", /(?:\?|&)(?:token|code|key|session|location)=/iu],
] as const;

export function scanCanarySurface(
  surface: CanarySurface,
  serializedArtifact: string,
): readonly CanaryFinding[] {
  const privateSurface = ["d1", "do", "queue", "dlq"].includes(surface);
  const detectors =
    surface === "log"
      ? [...COMMON_DETECTORS, ...LOG_DETECTORS]
      : privateSurface
        ? [...COMMON_DETECTORS, ...PRIVATE_SURFACE_DETECTORS]
        : COMMON_DETECTORS;
  return detectors
    .filter(([, pattern]) => pattern.test(serializedArtifact))
    .map(([detectorId]) => ({ detectorId, surface }));
}

export function scanAllCanarySurfaces(
  artifacts: Readonly<Record<CanarySurface, readonly string[]>>,
): readonly CanaryFinding[] {
  return CANARY_SURFACES.flatMap((surface) =>
    artifacts[surface].flatMap((artifact) => scanCanarySurface(surface, artifact)),
  );
}
