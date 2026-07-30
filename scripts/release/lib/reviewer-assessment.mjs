import { z } from "zod";

const assessmentSchema = z
  .object({
    target: z.literal("repository-readiness"),
    localEvidenceGap: z.literal("request-changes"),
    externalEvidenceGap: z.literal("preserve-release-block"),
    noLocalFindingsVerdict: z.literal("APPROVE"),
  })
  .strict()
  .readonly();
const reviewerResponseSchema = z
  .object({
    verdict: z.enum(["APPROVE", "REQUEST_CHANGES", "BLOCK"]),
    findings: z.array(
      z.object({
        severity: z.enum(["P0", "P1", "P2", "NOTE"]),
        summary: z.string().min(1),
      }).strict(),
    ),
  })
  .strict()
  .readonly();

export function parseReviewerAssessment(value) {
  return value === undefined ? undefined : assessmentSchema.parse(value);
}

export function assertReviewerResponse(value, assessment) {
  const response = reviewerResponseSchema.parse(value);
  const blockingFinding = response.findings.some((entry) =>
    ["P0", "P1"].includes(entry.severity)
  );
  if (
    (response.verdict === "APPROVE" && blockingFinding)
    || (assessment !== undefined
      && blockingFinding
      && response.verdict !== "REQUEST_CHANGES")
    || (assessment !== undefined
      && response.findings.length === 0
      && response.verdict !== assessment.noLocalFindingsVerdict)
  ) {
    throw new TypeError("reviewer verdict contradiction");
  }
  return response;
}
