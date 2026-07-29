export function validatePreparedEvidence(options: {
  buildReceipt: string;
  input: string;
  output: string;
  repo: string;
  sha: string;
}): Promise<{
  artifactCount: number;
  buildReceiptSha256: string;
  gate: "PASS";
  schemaVersion: 1;
  servedArtifactCount: number;
  sourceSha: string;
  sourceTree: string;
}>;
