import { randomBytes } from "node:crypto";

import { digestMembers, type PoolMember, type SealedPool } from "./pool";

const UINT32_RANGE = 4_294_967_296;

export type RandomUint32 = () => number;

export type DrawResult = Readonly<{
  index: number;
  rawAttempts: readonly number[];
}>;

export type Revalidation =
  | Readonly<{ verdict: "pass" }>
  | Readonly<{ verdict: "reject"; code: string }>;

export type SelectionAttempt = Readonly<{
  attemptNumber: number;
  remainingSetDigest: string;
  rawValues: readonly number[];
  rngVersion: "uint32-rejection-v1";
  selectedIndex: number;
  candidateId: string;
  snapshotVersion: string;
  validation: string;
}>;

type SelectionReceipt = Readonly<{
  schemaVersion: 1;
  requestId: string;
  poolId: string;
  poolDigest: string;
  qualifiedPoolSize: number;
  providerId: string;
  providerCapabilityVersion: string;
  providerQueryVersion: string;
  providerPaginationVersion: string;
  providerCoverageVersion: string;
  snapshotAt: string;
  canonicalizationVersion: string;
  ruleVersion: string;
  evidencePolicyVersion: string;
  disclosureVersion: string;
  modelVersion: string;
  promptVersion: string;
  rngVersion: "uint32-rejection-v1";
  attempts: readonly SelectionAttempt[];
  successfulAttemptNumber: number | null;
  result: "selected" | "no_fit";
}>;

export type SelectionResult =
  | Readonly<{ kind: "selected"; member: PoolMember; receipt: SelectionReceipt }>
  | Readonly<{ kind: "no_fit"; receipt: SelectionReceipt }>;

function cryptoUint32(): number {
  return randomBytes(4).readUInt32BE(0);
}

export function drawUnbiasedIndex(size: number, randomUint32: RandomUint32): DrawResult {
  if (!Number.isSafeInteger(size) || size < 1 || size > UINT32_RANGE) {
    throw new RangeError("selection size must be a positive uint32 range");
  }
  const acceptanceLimit = Math.floor(UINT32_RANGE / size) * size;
  const attempts: number[] = [];
  for (;;) {
    const raw = randomUint32();
    if (!Number.isInteger(raw) || raw < 0 || raw >= UINT32_RANGE) {
      throw new RangeError("random source must return a uint32");
    }
    attempts.push(raw);
    if (raw < acceptanceLimit) {
      return Object.freeze({
        index: raw % size,
        rawAttempts: Object.freeze(attempts),
      });
    }
  }
}

function sealReceipt(
  requestId: string,
  pool: SealedPool,
  attempts: readonly SelectionAttempt[],
  successfulAttemptNumber: number | null,
): SelectionReceipt {
  return Object.freeze({
    schemaVersion: 1,
    requestId,
    poolId: pool.poolId,
    poolDigest: pool.orderedMemberDigest,
    qualifiedPoolSize: pool.members.length,
    providerId: pool.providerId,
    providerCapabilityVersion: pool.providerCapabilityVersion,
    providerQueryVersion: pool.providerQueryVersion,
    providerPaginationVersion: pool.providerPaginationVersion,
    providerCoverageVersion: pool.providerCoverageVersion,
    snapshotAt: pool.sealedAt,
    canonicalizationVersion: pool.canonicalizationVersion,
    ruleVersion: pool.ruleVersion,
    evidencePolicyVersion: pool.evidencePolicyVersion,
    disclosureVersion: pool.disclosureVersion,
    modelVersion: pool.modelVersion,
    promptVersion: pool.promptVersion,
    rngVersion: "uint32-rejection-v1",
    attempts: Object.freeze([...attempts]),
    successfulAttemptNumber,
    result: successfulAttemptNumber === null ? "no_fit" : "selected",
  });
}

export async function selectDestination(input: {
  readonly requestId: string;
  readonly pool: SealedPool;
  readonly previousCandidateId?: string;
  readonly randomUint32?: RandomUint32;
  readonly revalidate: (member: PoolMember) => Promise<Revalidation>;
}): Promise<SelectionResult> {
  const remaining = input.pool.members.filter(
    (member) => member.candidateId !== input.previousCandidateId,
  );
  const attempts: SelectionAttempt[] = [];
  const randomUint32 = input.randomUint32 ?? cryptoUint32;
  while (remaining.length > 0) {
    const remainingSetDigest = digestMembers(remaining);
    const draw = drawUnbiasedIndex(remaining.length, randomUint32);
    const member = remaining[draw.index];
    if (member === undefined) {
      throw new RangeError("draw selected an absent pool member");
    }
    const validation = await input.revalidate(member);
    const validationCode = validation.verdict === "pass" ? "PASS" : validation.code;
    attempts.push(
      Object.freeze({
        attemptNumber: attempts.length + 1,
        remainingSetDigest,
        rawValues: draw.rawAttempts,
        rngVersion: "uint32-rejection-v1",
        selectedIndex: draw.index,
        candidateId: member.candidateId,
        snapshotVersion: member.snapshotVersion,
        validation: validationCode,
      }),
    );
    if (validation.verdict === "pass") {
      return Object.freeze({
        kind: "selected",
        member,
        receipt: sealReceipt(input.requestId, input.pool, attempts, attempts.length),
      });
    }
    remaining.splice(draw.index, 1);
  }
  return Object.freeze({
    kind: "no_fit",
    receipt: sealReceipt(input.requestId, input.pool, attempts, null),
  });
}

export function projectPreReveal(
  member: PoolMember,
  routeDistanceM: number,
  routeDurationSeconds: number,
) {
  return Object.freeze({
    category: member.category,
    priceBand: member.priceBand,
    broadMenuCategory: member.broadMenuCategory,
    routeDistanceM,
    routeDurationSeconds,
  });
}
