import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateEvidencePackage } from "../../app/qa/field/v2/package-validation.mjs";
import {
  buildReceiptSchema,
  navigationPolicySchema,
  promotionReceiptSchema,
} from "../../app/qa/field/v2/schemas.mjs";
import {
  authorityPinsSchema,
  resolvePinnedRegistry,
} from "../../app/qa/field/v2/trusted-authority.mjs";

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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeVerdict(output, verdict) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(verdict, null, 2)}\n`);
}

function git(repo, argumentsList) {
  const result = spawnSync("git", ["-C", repo, ...argumentsList], { encoding: "utf8" });
  if (result.status !== 0) throw new TypeError(result.stderr.trim());
  return result.stdout.trim();
}

async function allExist(paths) {
  try {
    await Promise.all(paths.map((input) => readFile(input)));
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  const policyPath = path.resolve(options.get("--policy") ?? "");
  const promotionPath = path.resolve(options.get("--promotion-receipt") ?? "");
  const buildPath = path.resolve(options.get("--build-receipt") ?? "");
  const evidencePath = path.resolve(options.get("--evidence") ?? "");
  const output = path.resolve(options.get("--output") ?? "");
  const repo = path.resolve(options.get("--repo") ?? ".");
  if ([policyPath, promotionPath, buildPath, evidencePath, output].includes(path.resolve(""))) {
    throw new TypeError(
      "required: --policy --promotion-receipt --build-receipt --evidence --output",
    );
  }
  if (
    !(await allExist([
      policyPath,
      promotionPath,
      buildPath,
      path.join(evidencePath, "evidence.json"),
    ]))
  ) {
    await writeVerdict(output, {
      schemaVersion: 1,
      bindingGate: "BLOCK",
      rcBuildBound: false,
      reason: "RC_OR_BUILD_OR_FIELD_EVIDENCE_MISSING",
    });
    process.exitCode = 2;
    return;
  }

  try {
    const policyBytes = await readFile(policyPath);
    const policy = navigationPolicySchema.parse(JSON.parse(policyBytes.toString("utf8")));
    const promotion = promotionReceiptSchema.parse(
      JSON.parse(await readFile(promotionPath, "utf8")),
    );
    const build = buildReceiptSchema.parse(JSON.parse(await readFile(buildPath, "utf8")));
    if (
      policy.policyVersion !== "navigation-v2-rc-1" ||
      policy.status !== "release-candidate" ||
      promotion.policySha256 !== sha256(policyBytes) ||
      promotion.parentPolicySha256 !== policy.parentPolicySha256 ||
      promotion.calibrationEvidenceSha256 !== policy.calibrationEvidenceSha256
    ) {
      throw new TypeError("FOREIGN_RC_POLICY");
    }
    if (
      Date.parse(build.builtAt) < Date.parse(promotion.finalizedAt) ||
      evidence.releaseCandidate?.buildSha !== build.sourceSha ||
      evidence.releaseCandidate?.sourceTree !== build.sourceTree ||
      evidence.releaseCandidate?.buildDigest !== build.buildDigest ||
      evidence.releaseCandidate?.navigationPolicySha256 !== promotion.policySha256 ||
      evidence.releaseCandidate?.promotionReceiptSha256 !== sha256(await readFile(promotionPath))
    ) {
      throw new TypeError("FOREIGN_OR_PREPROMOTION_BUILD");
    }
    if (
      git(repo, ["merge-base", "--is-ancestor", promotion.introducedBySha, build.sourceSha]) !== ""
    ) {
      throw new TypeError("INVALID_ANCESTRY_RESULT");
    }
    const committedPins = authorityPinsSchema.parse(
      JSON.parse(
        git(repo, [
          "show",
          `${build.sourceSha}:app/qa/field/v2/authority-pins.json`,
        ]),
      ),
    );
    if (
      committedPins.status !== "ACTIVE" ||
      promotion.supervisorRegistrySha256 !== committedPins.studyASupervisorRegistrySha256
    ) {
      throw new TypeError("BUILD_AUTHORITY_NOT_ACTIVE_OR_FOREIGN");
    }
    const authority = await resolvePinnedRegistry(
      options.get("--trusted-signers"),
      "somewhere-v2-field-release",
      committedPins,
    );
    const evidence = await validateEvidencePackage(evidencePath, {
      trustedSigners: authority.state === "READY" ? authority.registry : undefined,
    });
    if (evidence.errors.length > 0) throw new TypeError("EVIDENCE_INVALID_OR_TAMPERED");
    const committedPolicy = git(repo, [
      "show",
      `${build.sourceSha}:contracts/policy/navigation-v2-rc-1.json`,
    ]);
    if (sha256(`${committedPolicy}\n`) !== promotion.policySha256) {
      throw new TypeError("RC_NOT_IMMUTABLE_IN_BUILD");
    }
    const devicePass =
      evidence.errors.length === 0 &&
      evidence.evidenceOrigin === "physical" &&
      evidence.physicalAttestationsVerified;
    await writeVerdict(output, {
      schemaVersion: 1,
      bindingGate: devicePass ? "PASS" : "BLOCK",
      rcBuildBound: true,
      devicePass,
      buildSha: build.sourceSha,
      sourceTree: build.sourceTree,
      navigationPolicySha256: promotion.policySha256,
      trustedSignerRegistrySha256:
        authority.state === "READY" ? authority.registrySha256 : null,
      supervisorRegistrySha256: promotion.supervisorRegistrySha256,
      reason: devicePass
        ? "EXACT_POST_PROMOTION_RC_BUILD_BOUND"
        : authority.state === "BLOCK" && evidence.evidenceOrigin === "physical"
          ? authority.reason
          : "SYNTHETIC_OR_MISSING_PHYSICAL_DEVICE_EVIDENCE",
    });
    process.exitCode = devicePass ? 0 : 2;
  } catch (error) {
    await writeVerdict(output, {
      schemaVersion: 1,
      bindingGate: "FAIL",
      rcBuildBound: false,
      reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    process.exitCode = 1;
  }
}

await main();
