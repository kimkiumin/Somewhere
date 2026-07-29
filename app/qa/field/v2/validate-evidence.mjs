import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateEvidencePackage } from "./package-validation.mjs";
import { resolvePinnedRegistry } from "./trusted-authority.mjs";

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new TypeError("arguments must be --name value pairs");
    }
    result.set(key, value);
  }
  return result;
}

async function writeVerdict(output, verdict) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(verdict, null, 2)}\n`);
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  const mode = options.get("--mode");
  const input = options.get("--input");
  const output = path.resolve(options.get("--output") ?? "");
  if (
    !["schema", "release"].includes(mode ?? "") ||
    input === undefined ||
    output === path.resolve("")
  ) {
    throw new TypeError("required: --mode schema|release --input path --output path");
  }

  try {
    const authority = await resolvePinnedRegistry(
      options.get("--trusted-signers"),
      "somewhere-v2-field-release",
    );
    const result = await validateEvidencePackage(input, {
      trustedSigners: authority.state === "READY" ? authority.registry : undefined,
    });
    const schemaValid = result.errors.length === 0;
    const physical = result.evidenceOrigin === "physical";
    const devicePass = schemaValid && physical && result.physicalAttestationsVerified;
    const deviceGate = schemaValid ? (devicePass ? "PASS" : "BLOCK") : "FAIL";
    const reason = schemaValid
      ? devicePass
        ? "FOUR_PHYSICAL_EXACT_RC_RUNS_VALID"
        : physical
          ? authority.state === "BLOCK"
            ? authority.reason
            : "TRUSTED_PHYSICAL_ATTESTATION_MISSING"
          : "SYNTHETIC_EVIDENCE_CAN_VALIDATE_SHAPE_ONLY"
      : "EVIDENCE_INVALID_OR_TAMPERED";
    const verdict = {
      schemaVersion: 1,
      evidenceOrigin: result.evidenceOrigin,
      schemaValid,
      devicePass,
      deviceGate,
      reason,
      buildSha: result.releaseCandidate?.buildSha ?? null,
      navigationPolicyVersion: result.releaseCandidate?.navigationPolicyVersion ?? null,
      navigationPolicySha256: result.releaseCandidate?.navigationPolicySha256 ?? null,
      evidenceSha256: result.evidenceSha256 ?? null,
      trustedSignerRegistrySha256: authority.state === "READY" ? authority.registrySha256 : null,
      errors: result.errors,
    };
    await writeVerdict(output, verdict);
    process.exitCode =
      deviceGate === "FAIL" ? 1 : mode === "release" && deviceGate === "BLOCK" ? 2 : 0;
  } catch (error) {
    await writeVerdict(output, {
      schemaVersion: 1,
      evidenceOrigin: "unknown",
      schemaValid: false,
      devicePass: false,
      deviceGate: "FAIL",
      reason: "EVIDENCE_INVALID_OR_TAMPERED",
      errors: [error instanceof Error ? error.message : "UNKNOWN_ERROR"],
    });
    process.exitCode = 1;
  }
}

await main();
