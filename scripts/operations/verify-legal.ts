import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  KoreaReviewRecordV1Schema,
  ProviderRightsRecordV1Schema,
} from "../../contracts/src/provider";
import {
  evaluateExternalReleaseGates,
  type GateContext,
} from "../../server/src/operations/release-gates";

const root = resolve(import.meta.dirname, "../..");
const provider = JSON.parse(
  await readFile(resolve(root, "legal/L01-provider-rights.json"), "utf8"),
);
const korea = JSON.parse(await readFile(resolve(root, "legal/L05-korea-review.json"), "utf8"));

ProviderRightsRecordV1Schema.parse(provider);
KoreaReviewRecordV1Schema.parse(korea);
const context: GateContext = {
  adapterVersion: provider.adapterVersion,
  dataFlowDigest: korea.reviewedDataFlowDigest,
  endpointOrigins: provider.dataFlow.endpointOrigins,
  environment: "production",
  nowIso: "2026-07-29T12:00:00Z",
  providerId: provider.providerId,
  releaseDigest: provider.reviewedReleaseDigest,
  representedConditionGates: [],
  retentionPolicyDigest: korea.reviewedRetentionPolicyDigest,
};
const result = evaluateExternalReleaseGates(provider, korea, context);
if (result.verdict !== "BLOCK") {
  throw new Error("TASK14_KOREA_AND_PROVIDER_PLACEHOLDERS_MUST_BLOCK");
}
process.stdout.write(
  `${JSON.stringify({ failedRuleIds: result.failedRuleIds, legalGate: result.verdict })}\n`,
);
