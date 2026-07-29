export type RollbackCandidate = Readonly<{
  codeBackwardCompatible: boolean;
  includesDataRollback: boolean;
  includesLifecycleRollback: boolean;
  includesSchemaContraction: boolean;
  targetReleaseDigest: string;
}>;

export type RollbackDecision =
  | Readonly<{ allowed: true; kind: "compatible-code-only"; targetReleaseDigest: string }>
  | Readonly<{
      allowed: false;
      reason:
        | "data-rollback-forbidden"
        | "incompatible-code"
        | "lifecycle-rollback-forbidden"
        | "schema-contraction-forbidden";
    }>;

export function decideRollback(candidate: RollbackCandidate): RollbackDecision {
  if (candidate.includesLifecycleRollback) {
    return { allowed: false, reason: "lifecycle-rollback-forbidden" };
  }
  if (candidate.includesSchemaContraction) {
    return { allowed: false, reason: "schema-contraction-forbidden" };
  }
  if (candidate.includesDataRollback) {
    return { allowed: false, reason: "data-rollback-forbidden" };
  }
  if (!candidate.codeBackwardCompatible) {
    return { allowed: false, reason: "incompatible-code" };
  }
  return {
    allowed: true,
    kind: "compatible-code-only",
    targetReleaseDigest: candidate.targetReleaseDigest,
  };
}
