export type ArrivalPolicy = {
  readonly arrivalEndpointM: number;
  readonly maxArrivalAccuracyM: number;
  readonly finalCorridorMaxDeviationM: number;
  readonly arrivalConsecutiveSamples: number;
  readonly arrivalMinimumDwellMs: number;
  readonly arrivalSampleWindowMs: number;
};

export type ArrivalEvidence = {
  readonly endpointDistanceM: number;
  readonly accuracyM: number;
  readonly finalCorridorDeviationM: number;
  readonly capturedAtMs: number;
  readonly routeIsFresh: boolean;
  readonly progressIsCredible: boolean;
};

export type ArrivalState = {
  readonly arrived: boolean;
  readonly qualifyingTimesMs: readonly number[];
};

export function initialArrivalState(): ArrivalState {
  return { arrived: false, qualifyingTimesMs: [] };
}

function qualifies(sample: ArrivalEvidence, policy: ArrivalPolicy): boolean {
  return (
    Number.isFinite(sample.endpointDistanceM) &&
    sample.endpointDistanceM >= 0 &&
    sample.endpointDistanceM <= policy.arrivalEndpointM &&
    Number.isFinite(sample.accuracyM) &&
    sample.accuracyM >= 0 &&
    sample.accuracyM <= policy.maxArrivalAccuracyM &&
    Number.isFinite(sample.finalCorridorDeviationM) &&
    sample.finalCorridorDeviationM >= 0 &&
    sample.finalCorridorDeviationM <= policy.finalCorridorMaxDeviationM &&
    Number.isFinite(sample.capturedAtMs) &&
    sample.routeIsFresh &&
    sample.progressIsCredible
  );
}

export function advanceArrivalState(
  state: ArrivalState,
  sample: ArrivalEvidence,
  policy: ArrivalPolicy,
): ArrivalState {
  if (state.arrived) {
    return state;
  }
  if (!qualifies(sample, policy)) {
    return initialArrivalState();
  }
  const earliestAllowedMs = sample.capturedAtMs - policy.arrivalSampleWindowMs;
  const qualifyingTimesMs = [
    ...state.qualifyingTimesMs.filter(
      (timeMs) => timeMs >= earliestAllowedMs && timeMs <= sample.capturedAtMs,
    ),
    sample.capturedAtMs,
  ];
  const evidenceWindow = qualifyingTimesMs.slice(-policy.arrivalConsecutiveSamples);
  const firstTimeMs = evidenceWindow[0];
  const arrived =
    evidenceWindow.length === policy.arrivalConsecutiveSamples &&
    firstTimeMs !== undefined &&
    sample.capturedAtMs - firstTimeMs >= policy.arrivalMinimumDwellMs;
  return { arrived, qualifyingTimesMs };
}
