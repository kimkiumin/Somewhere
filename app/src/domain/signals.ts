import {
  type Coordinates,
  isValidCoordinates,
  magneticToTrueDegrees,
  normalizeDegrees,
} from "./geo";

export type NavigationPolicy = {
  readonly locationMaxAgeMs: number;
  readonly headingMaxAgeMs: number;
  readonly maxGuidanceAccuracyM: number;
  readonly nearEnterM: number;
  readonly nearExitM: number;
  readonly arrivedM: number;
  readonly maxArrivalAccuracyM: number;
  readonly arrivalSamplesRequired: number;
  readonly arrivalWindowMs: number;
  readonly maxMeasuredHeadingAccuracyDeg: number;
};

export const INITIAL_NAVIGATION_POLICY = {
  locationMaxAgeMs: 10_000,
  headingMaxAgeMs: 10_000,
  maxGuidanceAccuracyM: 50,
  nearEnterM: 120,
  nearExitM: 150,
  arrivedM: 30,
  maxArrivalAccuracyM: 25,
  arrivalSamplesRequired: 3,
  arrivalWindowMs: 12_000,
  maxMeasuredHeadingAccuracyDeg: 25,
} satisfies NavigationPolicy;

export type LocationSample = {
  readonly coordinates: Coordinates;
  readonly accuracyM: number;
  readonly capturedAtMs: number;
  readonly movementHeadingTrueDeg?: number | null;
  readonly speedMps?: number | null;
};

export type HeadingSample = {
  readonly degrees: number;
  readonly reference: "magnetic" | "true";
  readonly accuracyDeg: number | null;
  readonly capturedAtMs: number;
};

export type LocationProblem = "location-invalid" | "location-stale" | "location-inaccurate";

export type HeadingProblem =
  | "heading-invalid"
  | "heading-stale"
  | "heading-uncalibrated"
  | "heading-inaccurate"
  | "declination-unavailable";

export type LocationEvaluation =
  | { readonly status: "valid"; readonly sample: LocationSample }
  | { readonly status: "invalid"; readonly reason: LocationProblem };

export type HeadingEvaluation =
  | { readonly status: "valid"; readonly trueDegrees: number }
  | { readonly status: "invalid"; readonly reason: HeadingProblem };

export function evaluateLocation(
  sample: LocationSample,
  nowMs: number,
  policy: NavigationPolicy,
): LocationEvaluation {
  if (
    !isValidCoordinates(sample.coordinates) ||
    !Number.isFinite(sample.accuracyM) ||
    sample.accuracyM < 0 ||
    !Number.isFinite(sample.capturedAtMs) ||
    !Number.isFinite(nowMs) ||
    sample.capturedAtMs > nowMs
  ) {
    return { status: "invalid", reason: "location-invalid" };
  }
  if (nowMs - sample.capturedAtMs > policy.locationMaxAgeMs) {
    return { status: "invalid", reason: "location-stale" };
  }
  if (sample.accuracyM > policy.maxGuidanceAccuracyM) {
    return { status: "invalid", reason: "location-inaccurate" };
  }

  return { status: "valid", sample };
}

export function evaluateHeading(
  sample: HeadingSample,
  nowMs: number,
  declinationDegreesEast: number | null,
  policy: NavigationPolicy,
): HeadingEvaluation {
  if (
    !Number.isFinite(sample.degrees) ||
    !Number.isFinite(sample.capturedAtMs) ||
    !Number.isFinite(nowMs) ||
    sample.capturedAtMs > nowMs ||
    (sample.accuracyDeg !== null && !Number.isFinite(sample.accuracyDeg))
  ) {
    return { status: "invalid", reason: "heading-invalid" };
  }
  if (nowMs - sample.capturedAtMs > policy.headingMaxAgeMs) {
    return { status: "invalid", reason: "heading-stale" };
  }
  if (sample.accuracyDeg === -1) {
    return { status: "invalid", reason: "heading-uncalibrated" };
  }
  if (sample.accuracyDeg !== null && sample.accuracyDeg < 0) {
    return { status: "invalid", reason: "heading-invalid" };
  }
  if (sample.accuracyDeg !== null && sample.accuracyDeg > policy.maxMeasuredHeadingAccuracyDeg) {
    return { status: "invalid", reason: "heading-inaccurate" };
  }

  const trueDegrees =
    sample.reference === "true"
      ? normalizeDegrees(sample.degrees)
      : declinationDegreesEast === null
        ? null
        : magneticToTrueDegrees(sample.degrees, declinationDegreesEast);

  if (sample.reference === "magnetic" && declinationDegreesEast === null) {
    return { status: "invalid", reason: "declination-unavailable" };
  }
  if (trueDegrees === null) {
    return { status: "invalid", reason: "heading-invalid" };
  }

  return { status: "valid", trueDegrees };
}

export type Proximity = "following" | "near";

export function nextProximity(
  current: Proximity,
  distanceM: number,
  policy: NavigationPolicy,
): Proximity {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    return current;
  }
  if (current === "following" && distanceM <= policy.nearEnterM) {
    return "near";
  }
  if (current === "near" && distanceM >= policy.nearExitM) {
    return "following";
  }

  return current;
}

export type ArrivalSample = {
  readonly distanceM: number;
  readonly accuracyM: number;
  readonly capturedAtMs: number;
};

export type ArrivalGate = {
  readonly arrived: boolean;
  readonly candidateTimesMs: readonly number[];
};

export function initialArrivalGate(): ArrivalGate {
  return { arrived: false, candidateTimesMs: [] };
}

function isArrivalCandidate(sample: ArrivalSample, policy: NavigationPolicy): boolean {
  return (
    Number.isFinite(sample.distanceM) &&
    sample.distanceM >= 0 &&
    sample.distanceM <= policy.arrivedM &&
    Number.isFinite(sample.accuracyM) &&
    sample.accuracyM >= 0 &&
    sample.accuracyM <= policy.maxArrivalAccuracyM &&
    Number.isFinite(sample.capturedAtMs)
  );
}

export function advanceArrivalGate(
  state: ArrivalGate,
  sample: ArrivalSample,
  policy: NavigationPolicy,
): ArrivalGate {
  if (state.arrived) {
    return state;
  }
  if (!isArrivalCandidate(sample, policy)) {
    return initialArrivalGate();
  }

  const earliestAllowedMs = sample.capturedAtMs - policy.arrivalWindowMs;
  const candidateTimesMs = [
    ...state.candidateTimesMs.filter(
      (capturedAtMs) => capturedAtMs >= earliestAllowedMs && capturedAtMs <= sample.capturedAtMs,
    ),
    sample.capturedAtMs,
  ];

  return {
    arrived: candidateTimesMs.length >= policy.arrivalSamplesRequired,
    candidateTimesMs,
  };
}
