export const REQUIRED_METER_GROUPS = ["worker", "d1", "do", "queue", "provider"] as const;
export type MeterGroup = (typeof REQUIRED_METER_GROUPS)[number];

export type MeterSample = Readonly<{
  cap: number;
  group: MeterGroup;
  localFinalized: number;
  observed: number;
  observedAt: number;
  outstandingReservations: number;
  staleAfterMs: number;
  uncertaintyReserve: number;
  unrelatedBaseline: number;
}>;

export type MeterEvaluation = Readonly<{
  effectiveUsed: number;
  fraction: number;
  group: MeterGroup;
  status: "OPEN" | "WARN" | "CLOSED";
}>;

export function evaluateMeter(sample: MeterSample, now: number): MeterEvaluation {
  const effectiveUsed =
    Math.max(
      sample.observed + sample.unrelatedBaseline,
      sample.localFinalized + sample.unrelatedBaseline,
    ) +
    sample.outstandingReservations +
    sample.uncertaintyReserve;
  const fraction = effectiveUsed / sample.cap;
  const stale = now - sample.observedAt > sample.staleAfterMs;
  return {
    effectiveUsed,
    fraction,
    group: sample.group,
    status:
      stale || !Number.isFinite(fraction) || fraction >= 0.8
        ? "CLOSED"
        : fraction >= 0.5
          ? "WARN"
          : "OPEN",
  };
}

export function evaluateIndependentMeters(
  samples: readonly MeterSample[],
  now: number,
): readonly MeterEvaluation[] | undefined {
  const byGroup = new Map(samples.map((sample) => [sample.group, sample]));
  if (REQUIRED_METER_GROUPS.some((group) => !byGroup.has(group))) {
    return undefined;
  }
  return REQUIRED_METER_GROUPS.map((group) =>
    evaluateMeter(byGroup.get(group) ?? unreachable(), now),
  );
}

function unreachable(): never {
  throw new TypeError("required meter disappeared");
}
