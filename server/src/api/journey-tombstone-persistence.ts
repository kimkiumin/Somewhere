type TombstoneRow = Readonly<{
  delete_request_digest: string;
  replay_expires_at?: number;
}>;

export async function findDeleteReplay(
  database: D1Database,
  journeyDigest: string,
  now: number,
): Promise<string | undefined> {
  const value = await database
    .prepare(
      "SELECT delete_request_digest FROM journey_tombstones WHERE journey_hmac_digest = ? AND expires_at > ?",
    )
    .bind(journeyDigest, now)
    .first();
  return isTombstoneRow(value) ? value.delete_request_digest : undefined;
}

export async function findDeleteReplayWindow(
  database: D1Database,
  journeyDigest: string,
  now: number,
): Promise<Readonly<{ deleteRequestDigest: string; replayExpiresAt: number }> | undefined> {
  const value = await database
    .prepare(
      "SELECT delete_request_digest, replay_expires_at FROM journey_tombstones WHERE journey_hmac_digest = ? AND expires_at > ?",
    )
    .bind(journeyDigest, now)
    .first();
  return isTombstoneReplayRow(value)
    ? {
        deleteRequestDigest: value.delete_request_digest,
        replayExpiresAt: value.replay_expires_at,
      }
    : undefined;
}

export async function writeDeleteTombstone(
  input: Readonly<{
    database: D1Database;
    deleteRequestDigest: string;
    journeyDigest: string;
    now: number;
    writeEpoch: number;
  }>,
): Promise<void> {
  const bucket = Math.floor(input.now / 3_600_000) * 3_600_000;
  await input.database
    .prepare(
      "INSERT INTO journey_tombstones (journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket, write_epoch, replay_status, expires_at) VALUES (?, ?, 'deleted', ?, ?, 204, ?) ON CONFLICT(journey_hmac_digest) DO NOTHING",
    )
    .bind(
      input.journeyDigest,
      input.deleteRequestDigest,
      bucket,
      input.writeEpoch,
      input.now + 48 * 60 * 60 * 1_000,
    )
    .run();
}

function isTombstoneRow(value: unknown): value is TombstoneRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "delete_request_digest" in value &&
    typeof value.delete_request_digest === "string"
  );
}

function isTombstoneReplayRow(
  value: unknown,
): value is TombstoneRow & Readonly<{ replay_expires_at: number }> {
  return (
    isTombstoneRow(value) &&
    "replay_expires_at" in value &&
    typeof value.replay_expires_at === "number"
  );
}
