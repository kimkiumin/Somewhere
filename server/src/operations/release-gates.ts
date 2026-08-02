import {
  KoreaReviewRecordV1Schema,
  ProviderRightsRecordV1Schema,
} from "../../../contracts/src/provider";

export type GateContext = Readonly<{
  adapterVersion: string;
  dataFlowDigest: string;
  endpointOrigins: readonly string[];
  environment: "staging" | "production";
  nowIso: string;
  providerId: string;
  releaseDigest: string;
  representedConditionGates: readonly string[];
  retentionPolicyDigest: string;
}>;

export type ReleaseGateResult = Readonly<{
  failedRuleIds: readonly string[];
  verdict: "PASS" | "BLOCK";
}>;

export function evaluateProviderRights(
  candidate: unknown,
  context: GateContext,
): ReleaseGateResult {
  const parsed = ProviderRightsRecordV1Schema.safeParse(candidate);
  if (!parsed.success) {
    return block("provider.schema");
  }
  const record = parsed.data;
  const failures: string[] = [];
  if (record.decision !== "PASS") {
    failures.push("provider.decision");
  }
  if (record.environment !== context.environment) {
    failures.push("provider.environment");
  }
  if (record.reviewedReleaseDigest !== context.releaseDigest) {
    failures.push("provider.release-digest");
  }
  if (record.providerId !== context.providerId) {
    failures.push("provider.provider-id");
  }
  if (record.adapterVersion !== context.adapterVersion) {
    failures.push("provider.adapter-version");
  }
  if (!sameValues(record.dataFlow.endpointOrigins, context.endpointOrigins)) {
    failures.push("provider.endpoint-origins");
  }
  if (Date.parse(record.terms.reviewedAt) > Date.parse(context.nowIso)) {
    failures.push("provider.terms-review-future");
  }
  if (Date.parse(record.terms.expiresAt) <= Date.parse(context.nowIso)) {
    failures.push("provider.terms-expired");
  }
  if (Date.parse(record.credential.expiresAt) <= Date.parse(context.nowIso)) {
    failures.push("provider.credential-expired");
  }
  if (Date.parse(record.credential.rotatedAt) > Date.parse(context.nowIso)) {
    failures.push("provider.credential-rotation-future");
  }
  if (!record.rights.geographies.includes("KR")) {
    failures.push("provider.korea-geography");
  }
  if (record.dataFlow.providerRetentionDays > 30) {
    failures.push("provider.retention");
  }
  const quotaCheckedAt = Date.parse(record.quota.checkedAt);
  const now = Date.parse(context.nowIso);
  if (quotaCheckedAt > now || now - quotaCheckedAt > 30 * 24 * 60 * 60 * 1_000) {
    failures.push("provider.quota-check-stale");
  }
  if (Date.parse(record.evidence.signedAt) > now) {
    failures.push("provider.signature-future");
  }
  const attestors = new Set([
    record.evidence.owner.attestationDigest,
    record.evidence.legalReviewer.attestationDigest,
    record.evidence.securityReviewer.attestationDigest,
  ]);
  if (attestors.size !== 3) {
    failures.push("provider.independent-attestors");
  }
  return verdict(failures);
}

export function evaluateKoreaReview(candidate: unknown, context: GateContext): ReleaseGateResult {
  const parsed = KoreaReviewRecordV1Schema.safeParse(candidate);
  if (!parsed.success) {
    return block("korea.schema");
  }
  const record = parsed.data;
  const failures: string[] = [];
  if (record.decision !== "PASS") {
    failures.push("korea.decision");
  }
  if (record.environment !== context.environment) {
    failures.push("korea.environment");
  }
  if (record.reviewedReleaseDigest !== context.releaseDigest) {
    failures.push("korea.release-digest");
  }
  if (record.reviewedDataFlowDigest !== context.dataFlowDigest) {
    failures.push("korea.dataflow-digest");
  }
  if (record.reviewedRetentionPolicyDigest !== context.retentionPolicyDigest) {
    failures.push("korea.retention-digest");
  }
  if (Date.parse(record.reviewedAt) > Date.parse(context.nowIso)) {
    failures.push("korea.review-future");
  }
  if (Date.parse(record.expiresAt) <= Date.parse(context.nowIso)) {
    failures.push("korea.review-expired");
  }
  if (
    record.classification.locationInformationBusiness === "COUNSEL_DETERMINATION_REQUIRED" ||
    record.classification.locationBasedServiceBusiness === "COUNSEL_DETERMINATION_REQUIRED" ||
    record.classification.registrationOrReportingRequired === "UNRESOLVED"
  ) {
    failures.push("korea.classification-unresolved");
  }
  if (
    record.openFindings.some(
      (finding) =>
        finding.status === "OPEN" &&
        (finding.severity === "HIGH" || finding.severity === "CRITICAL"),
    )
  ) {
    failures.push("korea.high-finding-open");
  }
  const represented = new Set(context.representedConditionGates);
  if (record.conditions.some((condition) => !represented.has(condition))) {
    failures.push("korea.condition-not-enforced");
  }
  return verdict(failures);
}

export function evaluateExternalReleaseGates(
  providerCandidate: unknown,
  koreaCandidate: unknown,
  context: GateContext,
): ReleaseGateResult {
  const provider = evaluateProviderRights(providerCandidate, context);
  const korea = evaluateKoreaReview(koreaCandidate, context);
  return verdict([...provider.failedRuleIds, ...korea.failedRuleIds]);
}

function block(ruleId: string): ReleaseGateResult {
  return { failedRuleIds: [ruleId], verdict: "BLOCK" };
}

function verdict(failedRuleIds: readonly string[]): ReleaseGateResult {
  return {
    failedRuleIds,
    verdict: failedRuleIds.length === 0 ? "PASS" : "BLOCK",
  };
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  const expected = [...right].sort();
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === expected[index])
  );
}
