import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, stat, unlink } from "node:fs/promises";
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
  const directory = path.dirname(output);
  const temporary = path.join(
    directory,
    `.${path.basename(output)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  let temporaryOwned = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    temporaryOwned = true;
    try {
      await handle.writeFile(`${JSON.stringify(verdict, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, output);
    temporaryOwned = false;
  } catch (error) {
    if (temporaryOwned) {
      try {
        await unlink(temporary);
      } catch (cleanupError) {
        if (
          !(
            cleanupError instanceof Error &&
            "code" in cleanupError &&
            cleanupError.code === "ENOENT"
          )
        ) {
          throw new AggregateError([error, cleanupError], "failed to publish and clean verdict");
        }
      }
    }
    throw error;
  }
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
    const inputRoot = path.resolve(input);
    let rootMetadata;
    try {
      rootMetadata = await lstat(inputRoot);
    } catch (error) {
      if (
        mode === "release" &&
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT" &&
        "path" in error &&
        error.path === inputRoot
      ) {
        const reason = "MISSING_PHYSICAL_DEVICE_EVIDENCE";
        await writeVerdict(output, {
          schemaVersion: 1,
          evidenceOrigin: "unknown",
          schemaValid: false,
          devicePass: false,
          gate: "BLOCK",
          deviceGate: "BLOCK",
          reason,
          errors: [reason],
        });
        process.exitCode = 2;
        return;
      }
      throw error;
    }
    const followedRootMetadata = await stat(inputRoot);
    if (
      !rootMetadata.isDirectory() ||
      !followedRootMetadata.isDirectory() ||
      rootMetadata.dev !== followedRootMetadata.dev ||
      rootMetadata.ino !== followedRootMetadata.ino
    ) {
      throw new TypeError("input must be an existing, non-symbolic directory");
    }
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
      gate: deviceGate,
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
    const reason = "EVIDENCE_INVALID_OR_TAMPERED";
    await writeVerdict(output, {
      schemaVersion: 1,
      evidenceOrigin: "unknown",
      schemaValid: false,
      devicePass: false,
      gate: "FAIL",
      deviceGate: "FAIL",
      reason,
      errors: [error instanceof Error ? error.message : "UNKNOWN_ERROR"],
    });
    process.exitCode = 1;
  }
}

await main();
