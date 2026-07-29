import { type DatedMeterSample, METER_POLICIES } from "../admission/meter";
import type { Database, DatabaseValue, PreparedQuery } from "../db/database";

export type CollectedMeterWindow = Omit<
  DatedMeterSample,
  "localFinalized" | "outstandingReservations"
> &
  Readonly<{
    expiresAt: number;
  }>;

export type MeterCollection = Readonly<{
  authorityDigest: string;
  capturedAt: number;
  meters: readonly CollectedMeterWindow[];
}>;

export interface PlatformMeterSource {
  collect(now: number): Promise<MeterCollection>;
}

export async function collectOperationsMeters(
  source: PlatformMeterSource,
  database: Database,
  now: number,
): Promise<void> {
  const collection = await source.collect(now);
  await prepareOperationsMeterCollection(collection, database).run();
}

export function prepareOperationsMeterCollection(
  collection: MeterCollection,
  database: Database,
): PreparedQuery {
  assertExactCollection(collection);
  const placeholders = collection.meters
    .map(() => "(?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)")
    .join(",");
  const values = collection.meters.flatMap((meter): readonly DatabaseValue[] => [
    meter.meterId,
    meter.windowStartUtc,
    meter.windowEndUtc,
    meter.platformObserved,
    meter.platformObservedAt,
    meter.immediateObserved,
    meter.immediateObservedAt,
    meter.unrelatedBaseline,
    meter.uncertaintyReserve,
    meter.resetConfirmed ? 1 : 0,
    collection.authorityDigest,
    collection.capturedAt,
    meter.expiresAt,
  ]);
  return database
    .prepare(
      `INSERT INTO operations_meter_windows (
         meter_id, window_start_utc, window_end_utc, platform_observed,
         platform_observed_at, immediate_observed, immediate_observed_at,
         local_finalized, unrelated_baseline, uncertainty_reserve, reset_confirmed,
         authority_digest, updated_at, expires_at
       ) VALUES ${placeholders}
       ON CONFLICT(meter_id, window_start_utc) DO UPDATE SET
         platform_observed = MAX(
           COALESCE(operations_meter_windows.platform_observed, 0),
           COALESCE(excluded.platform_observed, 0)
         ),
         platform_observed_at = MAX(
           COALESCE(operations_meter_windows.platform_observed_at, 0),
           COALESCE(excluded.platform_observed_at, 0)
         ),
         immediate_observed = MAX(
           COALESCE(operations_meter_windows.immediate_observed, 0),
           COALESCE(excluded.immediate_observed, 0)
         ),
         immediate_observed_at = MAX(
           COALESCE(operations_meter_windows.immediate_observed_at, 0),
           COALESCE(excluded.immediate_observed_at, 0)
         ),
         unrelated_baseline = MAX(
           operations_meter_windows.unrelated_baseline,
           excluded.unrelated_baseline
         ),
         uncertainty_reserve = MAX(
           operations_meter_windows.uncertainty_reserve,
           excluded.uncertainty_reserve
         ),
         reset_confirmed = MAX(
           operations_meter_windows.reset_confirmed,
           excluded.reset_confirmed
         ),
         authority_digest = excluded.authority_digest,
         updated_at = excluded.updated_at,
         expires_at = MAX(operations_meter_windows.expires_at, excluded.expires_at)`,
    )
    .bind(...values);
}

function assertExactCollection(collection: MeterCollection): void {
  if (!/^[a-f0-9]{64}$/u.test(collection.authorityDigest)) {
    throw new TypeError("Meter authority digest is invalid");
  }
  const ids = collection.meters.map((meter) => meter.meterId);
  if (
    ids.length !== METER_POLICIES.length ||
    new Set(ids).size !== METER_POLICIES.length ||
    METER_POLICIES.some((policy) => !ids.includes(policy.id))
  ) {
    throw new TypeError("Meter collection must contain every frozen meter exactly once");
  }
  for (const meter of collection.meters) {
    if (
      meter.windowEndUtc <= meter.windowStartUtc ||
      meter.expiresAt < meter.windowEndUtc + 172_800_000 ||
      (meter.immediateObservedAt !== null && meter.immediateObserved === null) ||
      (meter.platformObservedAt !== null && meter.platformObserved === null) ||
      (meter.immediateObserved !== null && meter.immediateObservedAt === null) ||
      (meter.platformObserved !== null && meter.platformObservedAt === null)
    ) {
      throw new TypeError("Meter authority window is invalid");
    }
  }
}
