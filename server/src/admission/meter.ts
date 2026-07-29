import { OPERATIONS_POLICY_V1 } from "../../../contracts/src/policy";

export type MeterId = (typeof OPERATIONS_POLICY_V1.meterIds)[number];
export type MeterStatus = "OPEN" | "WARN" | "CLOSED" | "RECOVERY_VERIFY";

export type MeterPolicy = Readonly<{
  blocksAdmission: boolean;
  cap: number;
  closeAt: number;
  freshnessMs: number;
  id: MeterId;
  kind: "daily" | "storage" | "cpu" | "retention";
  resetConfirmationRequired: boolean;
  warnAt: number;
}>;

const FIFTEEN_MINUTES = 15 * 60 * 1_000;
const SIX_HOURS = 6 * 60 * 60 * 1_000;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const HOUR = 60 * 60 * 1_000;

export const METER_POLICIES = [
  daily("worker.dynamic_requests", 100_000),
  cpu("worker.http_cpu", 10, 5, 8),
  { ...daily("worker.logs_written", 200_000), blocksAdmission: false, closeAt: 160_000 },
  daily("d1.rows_read", 5_000_000),
  daily("d1.rows_written", 100_000),
  storage("d1.account_storage", 5 * GIB),
  storage("d1.database_storage", 500 * MIB),
  daily("do.requests", 100_000),
  daily("do.duration", 13_000),
  daily("do.rows_read", 5_000_000),
  daily("do.rows_written", 100_000),
  storage("do.account_storage", 5 * GIB),
  storage("do.object_storage", 1 * GIB),
  daily("queue.operations", 10_000),
  {
    blocksAdmission: true,
    cap: 24 * HOUR,
    closeAt: 18 * HOUR,
    freshnessMs: FIFTEEN_MINUTES,
    id: "queue.retention",
    kind: "retention",
    resetConfirmationRequired: false,
    warnAt: 12 * HOUR,
  },
] as const satisfies readonly MeterPolicy[];

export type DatedMeterSample = Readonly<{
  immediateObserved: number | null;
  immediateObservedAt: number | null;
  localFinalized: number;
  meterId: MeterId;
  outstandingReservations: number;
  platformObserved: number | null;
  platformObservedAt: number | null;
  resetConfirmed: boolean;
  unrelatedBaseline: number | null;
  uncertaintyReserve: number;
  windowEndUtc: number;
  windowStartUtc: number;
}>;

export type DatedMeterEvaluation = Readonly<{
  blocksAdmission: boolean;
  effectiveUsed: number;
  fraction: number;
  meterId: MeterId;
  reason: "healthy" | "missing" | "stale" | "threshold" | "window-unconfirmed";
  status: MeterStatus;
}>;

export function evaluateDatedMeters(
  samples: readonly DatedMeterSample[],
  now: number,
): readonly DatedMeterEvaluation[] {
  const byId = new Map(samples.map((sample) => [sample.meterId, sample]));
  return METER_POLICIES.map((policy) => evaluateDatedMeter(policy, byId.get(policy.id), now));
}

export function meterPolicyFor(meterId: MeterId): MeterPolicy | undefined {
  return METER_POLICIES.find((candidate) => candidate.id === meterId);
}

export function evaluateDatedMeter(
  policy: MeterPolicy,
  sample: DatedMeterSample | undefined,
  now: number,
): DatedMeterEvaluation {
  if (sample === undefined || sample.unrelatedBaseline === null) {
    return failedEvaluation(policy, "missing", "CLOSED");
  }
  if (
    policy.resetConfirmationRequired &&
    (!sample.resetConfirmed || now < sample.windowStartUtc || now >= sample.windowEndUtc)
  ) {
    return failedEvaluation(policy, "window-unconfirmed", "RECOVERY_VERIFY");
  }
  const platformFresh =
    sample.platformObserved !== null &&
    sample.platformObservedAt !== null &&
    now - sample.platformObservedAt <= policy.freshnessMs;
  const immediateFresh =
    sample.immediateObserved !== null &&
    sample.immediateObservedAt !== null &&
    now - sample.immediateObservedAt <= policy.freshnessMs;
  if (!platformFresh || !immediateFresh) {
    return failedEvaluation(policy, "stale", "CLOSED");
  }
  const baseline = sample.unrelatedBaseline;
  const effectiveUsed =
    Math.max(
      sample.platformObserved + baseline,
      sample.immediateObserved + baseline,
      sample.localFinalized + baseline,
    ) +
    sample.outstandingReservations +
    sample.uncertaintyReserve;
  const fraction = effectiveUsed / policy.cap;
  const status =
    !Number.isFinite(fraction) || effectiveUsed >= policy.closeAt
      ? "CLOSED"
      : effectiveUsed >= policy.warnAt
        ? "WARN"
        : "OPEN";
  return {
    blocksAdmission: policy.blocksAdmission,
    effectiveUsed,
    fraction,
    meterId: policy.id,
    reason: status === "CLOSED" ? "threshold" : "healthy",
    status,
  };
}

function daily(id: MeterId, cap: number): MeterPolicy {
  return {
    blocksAdmission: true,
    cap,
    closeAt: cap * OPERATIONS_POLICY_V1.closeFraction,
    freshnessMs: FIFTEEN_MINUTES,
    id,
    kind: "daily",
    resetConfirmationRequired: true,
    warnAt: cap * OPERATIONS_POLICY_V1.warnFraction,
  };
}

function storage(id: MeterId, cap: number): MeterPolicy {
  return {
    ...daily(id, cap),
    freshnessMs: SIX_HOURS,
    kind: "storage",
    resetConfirmationRequired: false,
  };
}

function cpu(id: MeterId, cap: number, warnAt: number, closeAt: number): MeterPolicy {
  return {
    blocksAdmission: true,
    cap,
    closeAt,
    freshnessMs: FIFTEEN_MINUTES,
    id,
    kind: "cpu",
    resetConfirmationRequired: false,
    warnAt,
  };
}

function failedEvaluation(
  policy: MeterPolicy,
  reason: DatedMeterEvaluation["reason"],
  status: Extract<MeterStatus, "CLOSED" | "RECOVERY_VERIFY">,
): DatedMeterEvaluation {
  return {
    blocksAdmission: policy.blocksAdmission,
    effectiveUsed: Number.POSITIVE_INFINITY,
    fraction: Number.POSITIVE_INFINITY,
    meterId: policy.id,
    reason,
    status,
  };
}

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

export function evaluateIndependentMeters(
  samples: readonly MeterSample[],
  now: number,
):
  | readonly Readonly<{
      effectiveUsed: number;
      fraction: number;
      group: MeterGroup;
      status: "OPEN" | "WARN" | "CLOSED";
    }>[]
  | undefined {
  const byGroup = new Map(samples.map((sample) => [sample.group, sample]));
  if (REQUIRED_METER_GROUPS.some((group) => !byGroup.has(group))) {
    return undefined;
  }
  return REQUIRED_METER_GROUPS.map((group) => {
    const sample = byGroup.get(group);
    if (sample === undefined) {
      return undefined;
    }
    const effectiveUsed =
      Math.max(
        sample.observed + sample.unrelatedBaseline,
        sample.localFinalized + sample.unrelatedBaseline,
      ) +
      sample.outstandingReservations +
      sample.uncertaintyReserve;
    const fraction = effectiveUsed / sample.cap;
    const stale = now - sample.observedAt > sample.staleAfterMs;
    const status: "OPEN" | "WARN" | "CLOSED" =
      stale || !Number.isFinite(fraction) || fraction >= 0.8
        ? "CLOSED"
        : fraction >= 0.5
          ? "WARN"
          : "OPEN";
    return {
      effectiveUsed,
      fraction,
      group,
      status,
    };
  }).filter((evaluation) => evaluation !== undefined);
}
