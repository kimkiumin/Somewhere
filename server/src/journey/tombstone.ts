export type JourneyStorage = Readonly<{
  deleteAlarm(): Promise<void>;
  deleteAll(): Promise<void>;
}>;

export class TombstoneNotDurableError extends Error {
  override readonly name = "TombstoneNotDurableError";

  constructor() {
    super("D1 tombstone durability is required before Durable Object deletion");
  }
}

type DeletePlanInput = Readonly<{
  coarseUtcBucket: number;
  deleteRequestDigest: string;
  expiresAt: number;
  journeyHmacDigest: string;
  writeEpoch: number;
}>;

export type DeletePlan = Readonly<{
  coarse_utc_bucket: number;
  delete_request_digest: string;
  expires_at: number;
  journey_hmac_digest: string;
  replay_status: 204;
  terminal_type: "deleted" | "expired";
  write_epoch: number;
}>;

export function createDeletePlan(input: DeletePlanInput): DeletePlan {
  return createTerminalPlan(input, "deleted");
}

export function createExpiryPlan(input: DeletePlanInput): DeletePlan {
  return createTerminalPlan(input, "expired");
}

function createTerminalPlan(
  input: DeletePlanInput,
  terminalType: DeletePlan["terminal_type"],
): DeletePlan {
  return {
    coarse_utc_bucket: input.coarseUtcBucket,
    delete_request_digest: input.deleteRequestDigest,
    expires_at: input.expiresAt,
    journey_hmac_digest: input.journeyHmacDigest,
    replay_status: 204,
    terminal_type: terminalType,
    write_epoch: input.writeEpoch,
  };
}

export function checkExternalTombstoneBarrier(
  tombstone: DeletePlan | null,
  workEpoch: number,
  now: number,
): "allowed" | "stale_epoch" | "tombstoned" {
  if (tombstone !== null && tombstone.expires_at > now) {
    return "tombstoned";
  }
  if (tombstone !== null && tombstone.write_epoch !== workEpoch) {
    return "stale_epoch";
  }
  return "allowed";
}

export async function finalizeDeleteAfterTombstone(
  storage: JourneyStorage,
  receipt: Readonly<{ durable: boolean; replayStatus: 204 }>,
  deleteJourneyData?: () => void,
): Promise<void> {
  if (!receipt.durable) {
    throw new TombstoneNotDurableError();
  }
  await storage.deleteAlarm();
  if (deleteJourneyData === undefined) {
    await storage.deleteAll();
    return;
  }
  deleteJourneyData();
}
