import { createHash } from "node:crypto";

import type { QualifiedCandidate } from "./evidence";
import type { ProviderFixtureBundle } from "./parser";

export type PoolMember = QualifiedCandidate;

export type SealedPool = Readonly<{
  schemaVersion: 1;
  poolId: string;
  sealedAt: string;
  orderedMemberDigest: string;
  providerId: string;
  providerCapabilityVersion: string;
  providerQueryVersion: string;
  providerPaginationVersion: string;
  providerCoverageVersion: string;
  canonicalizationVersion: string;
  ruleVersion: "manual-hard-filter-v1";
  evidencePolicyVersion: string;
  disclosureVersion: "broad-menu-v1";
  modelVersion: "disabled";
  promptVersion: "disabled";
  members: readonly PoolMember[];
}>;

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function digestMember(member: PoolMember): string {
  return digest(`${member.canonicalId}\0${member.candidateId}\0${member.snapshotVersion}`);
}

export function digestMembers(members: readonly PoolMember[]): string {
  return digest(members.map(digestMember).join("\n"));
}

export function sealPool(input: {
  readonly bundle: ProviderFixtureBundle;
  readonly qualified: readonly QualifiedCandidate[];
}): SealedPool {
  const members = Object.freeze([...input.qualified]);
  const orderedMemberDigest = digestMembers(members);
  return Object.freeze({
    schemaVersion: 1,
    poolId: `pool:${digest(`${input.bundle.venues.fixtureVersion}\0${orderedMemberDigest}`).slice(7)}`,
    sealedAt: input.bundle.venues.provider.retrievedAt,
    orderedMemberDigest,
    providerId: input.bundle.venues.provider.id,
    providerCapabilityVersion: input.bundle.venues.provider.capabilityVersion,
    providerQueryVersion: input.bundle.venues.provider.queryVersion,
    providerPaginationVersion: input.bundle.venues.provider.paginationVersion,
    providerCoverageVersion: input.bundle.venues.provider.coverageVersion,
    canonicalizationVersion: input.bundle.venues.canonicalizationVersion,
    ruleVersion: "manual-hard-filter-v1",
    evidencePolicyVersion: input.bundle.evidence.policyVersion,
    disclosureVersion: "broad-menu-v1",
    modelVersion: "disabled",
    promptVersion: "disabled",
    members,
  });
}
