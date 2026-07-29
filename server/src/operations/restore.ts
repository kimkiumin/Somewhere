export type RestoreInput = Readonly<{
  approvalDigests: readonly string[];
  currentWriteEpoch: number;
  exportCreatedAt: number;
  exportDigest: string;
  restoredDigest: string;
  restoredWriteEpoch: number;
  tombstoneDigestAfter: string;
  tombstoneDigestBefore: string;
  trafficClosed: boolean;
  writeFenceMode: "RECOVERY_VERIFY" | "OPEN" | "ADMISSION_CLOSED";
}>;

export type RestoreDecision = Readonly<{
  allowed: boolean;
  encryptedExportDeleteAt: number;
  failures: readonly string[];
  nextWriteEpoch: number;
}>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

export function evaluateRestore(input: RestoreInput): RestoreDecision {
  const failures: string[] = [];
  const approvals = new Set(input.approvalDigests);
  if (approvals.size < 2) {
    failures.push("two-person-approval-required");
  }
  if (!input.trafficClosed || input.writeFenceMode !== "RECOVERY_VERIFY") {
    failures.push("traffic-must-remain-fenced");
  }
  if (input.exportDigest !== input.restoredDigest) {
    failures.push("restore-digest-mismatch");
  }
  if (input.restoredWriteEpoch <= input.currentWriteEpoch) {
    failures.push("write-epoch-must-increase");
  }
  if (input.tombstoneDigestBefore !== input.tombstoneDigestAfter) {
    failures.push("tombstones-must-be-reapplied");
  }
  return {
    allowed: failures.length === 0,
    encryptedExportDeleteAt: input.exportCreatedAt + THIRTY_DAYS_MS,
    failures,
    nextWriteEpoch: Math.max(input.currentWriteEpoch + 1, input.restoredWriteEpoch),
  };
}
