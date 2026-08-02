const bounds = {
  routeCorridorEnterM: [20, 50],
  routeCorridorExitM: [40, 80],
  finalCorridorMaxDeviationM: [15, 35],
  forwardTargetLookaheadM: [15, 50],
  maxGuidanceAccuracyM: [20, 50],
  maxMeasuredHeadingAccuracyDeg: [15, 35],
  nearEnterM: [80, 150],
  nearExitM: [110, 200],
  arrivalEndpointM: [15, 40],
  maxArrivalAccuracyM: [10, 30],
  arrivalConsecutiveSamples: [3, 6],
  arrivalMinimumDwellMs: [8_000, 20_000],
  arrivalSampleWindowMs: [12_000, 30_000],
  locationMaxAgeMs: [5_000, 15_000],
  headingMaxAgeMs: [5_000, 15_000],
  routeRevalidateAfterMs: [120_000, 600_000],
  routeAbsoluteMaxAgeMs: [600_000, 1_800_000],
};

const coupledFamilies = [
  ["routeCorridorEnterM", "routeCorridorExitM", "finalCorridorMaxDeviationM"],
  ["forwardTargetLookaheadM"],
  [
    "maxGuidanceAccuracyM",
    "maxMeasuredHeadingAccuracyDeg",
    "locationMaxAgeMs",
    "headingMaxAgeMs",
    "routeRevalidateAfterMs",
    "routeAbsoluteMaxAgeMs",
  ],
  ["nearEnterM", "nearExitM"],
  [
    "arrivalEndpointM",
    "maxArrivalAccuracyM",
    "arrivalConsecutiveSamples",
    "arrivalMinimumDwellMs",
    "arrivalSampleWindowMs",
  ],
];

export function candidateEnvelopeIssues(candidate, parent) {
  const issues = [];
  if (
    !/^navigation-v2-calibration-(?:[2-9]|[1-9][0-9]+)$/.test(candidate.policyVersion) ||
    candidate.status !== "calibration-only"
  ) {
    issues.push("CANDIDATE_VERSION_NOT_IMMUTABLE_SUCCESSOR");
  }
  for (const [field, [minimum, maximum]] of Object.entries(bounds)) {
    if (candidate[field] < minimum || candidate[field] > maximum) {
      issues.push(`OUTSIDE_ENVELOPE:${field}`);
    }
  }
  const corridorGap = candidate.routeCorridorExitM - candidate.routeCorridorEnterM;
  const nearGap = candidate.nearExitM - candidate.nearEnterM;
  if (corridorGap < 15 || corridorGap > 30) issues.push("CORRIDOR_GAP");
  if (candidate.finalCorridorMaxDeviationM > candidate.routeCorridorEnterM) {
    issues.push("FINAL_CORRIDOR_GT_ENTER");
  }
  if (candidate.maxGuidanceAccuracyM > candidate.routeCorridorExitM) {
    issues.push("GUIDANCE_ACCURACY_GT_EXIT");
  }
  if (nearGap < 20 || nearGap > 60) issues.push("NEAR_GAP");
  if (candidate.maxArrivalAccuracyM > candidate.arrivalEndpointM) {
    issues.push("ARRIVAL_ACCURACY_GT_ENDPOINT");
  }
  if (candidate.arrivalMinimumDwellMs > candidate.arrivalSampleWindowMs) {
    issues.push("DWELL_GT_WINDOW");
  }
  if (candidate.routeRevalidateAfterMs >= candidate.routeAbsoluteMaxAgeMs) {
    issues.push("REVALIDATE_NOT_LT_ABSOLUTE");
  }
  const changedFamilies = coupledFamilies.filter((fields) =>
    fields.some((field) => candidate[field] !== parent[field]),
  );
  if (changedFamilies.length !== 1) issues.push("NOT_ONE_COUPLED_FAMILY");
  return issues;
}
