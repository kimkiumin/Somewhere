import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  bindingVerifier,
  cleanupTemporaryRoots,
  qaRoot,
  run,
  temporaryRoot,
  verdict,
} from "./field-v2.testkit";

afterEach(cleanupTemporaryRoots);

describe("Somewhere V2 RC-to-build binding", () => {
  test("BLOCKs when the promoted RC or post-promotion build is absent", async () => {
    const root = await temporaryRoot("binding");
    const output = join(root, "verdict.json");
    const result = run(bindingVerifier, [
      "--policy",
      join(root, "missing-rc.json"),
      "--promotion-receipt",
      join(root, "missing-promotion.json"),
      "--build-receipt",
      join(root, "missing-build.json"),
      "--evidence",
      join(qaRoot, "fixtures", "synthetic-release-block"),
      "--output",
      output,
    ]);
    expect(result.status, result.stderr).toBe(2);
    expect(await verdict(output)).toMatchObject({
      bindingGate: "BLOCK",
      rcBuildBound: false,
    });
  });

  test("BLOCKs a prepared calibration candidate as RC_ABSENT", async () => {
    const root = await temporaryRoot("calibration");
    const policyPath = resolve(repo, "contracts/policy/navigation-v2-calibration-1.json");
    const promotionPath = join(root, "promotion.json");
    const buildPath = join(root, "build.json");
    const output = join(root, "verdict.json");
    await writeFile(
      promotionPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          gate: "BLOCK",
          reason: "RC_ABSENT",
          finalSha: git("rev-parse", "HEAD"),
          policySha256: `sha256:${sha256(await readFile(policyPath))}`,
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      buildPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          sourceSha: git("rev-parse", "HEAD"),
          sourceTree: git("rev-parse", "HEAD^{tree}"),
          buildDigest: `sha256:${"4".repeat(64)}`,
          builtAt: "2026-07-29T10:00:00.000Z",
          command: "bun run build:production",
        },
        null,
        2,
      )}\n`,
    );

    const result = run(bindingVerifier, [
      "--repo",
      repo,
      "--policy",
      policyPath,
      "--promotion-receipt",
      promotionPath,
      "--build-receipt",
      buildPath,
      "--evidence",
      join(qaRoot, "fixtures", "synthetic-release-block"),
      "--output",
      output,
    ]);

    expect(result.status, result.stderr).toBe(2);
    expect(await verdict(output)).toMatchObject({
      bindingGate: "BLOCK",
      rcBuildBound: false,
      reason: "RC_ABSENT",
    });

    const forgedPromotion = JSON.parse(await readFile(promotionPath, "utf8"));
    forgedPromotion.policySha256 = `sha256:${"0".repeat(64)}`;
    await writeFile(promotionPath, `${JSON.stringify(forgedPromotion, null, 2)}\n`);
    const forgedResult = run(bindingVerifier, [
      "--repo",
      repo,
      "--policy",
      policyPath,
      "--promotion-receipt",
      promotionPath,
      "--build-receipt",
      buildPath,
      "--evidence",
      join(qaRoot, "fixtures", "synthetic-release-block"),
      "--output",
      output,
    ]);
    expect(forgedResult.status, forgedResult.stderr).toBe(1);
    expect(await verdict(output)).toMatchObject({
      bindingGate: "FAIL",
      reason: "INVALID_RC_ABSENT_RECEIPT",
    });
  });

  test("BLOCKs matching synthetic evidence when committed release authority is inactive", async () => {
    const fixture = await boundSyntheticFixture("matching");
    const result = run(bindingVerifier, fixture.argumentsList);
    const actual = await verdict(fixture.output);

    expect(result.status, `${result.stderr}\n${JSON.stringify(actual)}`).toBe(2);
    expect(actual).toMatchObject({
      bindingGate: "BLOCK",
      rcBuildBound: false,
      devicePass: false,
      reason: "FIELD_RELEASE_AUTHORITY_NOT_PINNED",
    });
  });

  test("FAILs evidence bound to a foreign build SHA", async () => {
    const fixture = await boundSyntheticFixture("foreign-build");
    const evidencePath = join(fixture.evidenceRoot, "evidence.json");
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    evidence.releaseCandidate.buildSha = "f".repeat(40);
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

    const result = run(bindingVerifier, fixture.argumentsList);

    expect(result.status, result.stderr).toBe(1);
    expect(await verdict(fixture.output)).toMatchObject({
      bindingGate: "FAIL",
      rcBuildBound: false,
      reason: "FOREIGN_OR_PREPROMOTION_BUILD",
    });
  });
});

const repo = resolve(qaRoot, "../../../..");

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function boundSyntheticFixture(label: string) {
  const root = await temporaryRoot(label);
  const evidenceRoot = join(root, "evidence");
  await cp(join(qaRoot, "fixtures", "synthetic-release-block"), evidenceRoot, {
    recursive: true,
  });
  const parentBytes = await readFile(
    resolve(repo, "contracts/policy/navigation-v2-calibration-1.json"),
  );
  const policy = JSON.parse(parentBytes.toString("utf8"));
  policy.policyVersion = "navigation-v2-rc-1";
  policy.status = "release-candidate";
  policy.parentPolicyVersion = "navigation-v2-calibration-1";
  policy.parentPolicySha256 = sha256(parentBytes);
  policy.calibrationEvidenceSha256 = "1".repeat(64);
  const policyBytes = `${JSON.stringify(policy, null, 2)}\n`;
  const policyPath = join(root, "navigation-v2-rc-1.json");
  await writeFile(policyPath, policyBytes);

  const sourceSha = git("rev-parse", "HEAD");
  const sourceTree = git("rev-parse", "HEAD^{tree}");
  const promotion = {
    schemaVersion: 1,
    promotionGate: "PASS",
    status: "FINAL",
    rcCreated: true,
    policyVersion: "navigation-v2-rc-1",
    policySha256: sha256(policyBytes),
    parentPolicySha256: policy.parentPolicySha256,
    candidatePolicySha256: "2".repeat(64),
    calibrationEvidenceSha256: policy.calibrationEvidenceSha256,
    sessionCount: 5,
    unsafeEventCount: 0,
    supervisorRegistrySha256: "3".repeat(64),
    introducedBySha: sourceSha,
    finalizedAt: "2026-07-29T09:00:00.000Z",
  };
  const promotionBytes = `${JSON.stringify(promotion, null, 2)}\n`;
  const promotionPath = join(root, "promotion.json");
  await writeFile(promotionPath, promotionBytes);

  const build = {
    schemaVersion: 1,
    sourceSha,
    sourceTree,
    buildDigest: `sha256:${"4".repeat(64)}`,
    builtAt: "2026-07-29T10:00:00.000Z",
    command: "bun run build:production",
  };
  const buildPath = join(root, "build.json");
  await writeFile(buildPath, `${JSON.stringify(build, null, 2)}\n`);

  const evidencePath = join(evidenceRoot, "evidence.json");
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  Object.assign(evidence.releaseCandidate, {
    buildSha: sourceSha,
    sourceTree,
    buildDigest: build.buildDigest,
    builtAt: build.builtAt,
    navigationPolicySha256: promotion.policySha256,
    promotionReceiptSha256: sha256(promotionBytes),
  });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  const output = join(root, "verdict.json");
  return {
    evidenceRoot,
    output,
    argumentsList: [
      "--repo",
      repo,
      "--policy",
      policyPath,
      "--promotion-receipt",
      promotionPath,
      "--build-receipt",
      buildPath,
      "--evidence",
      evidenceRoot,
      "--output",
      output,
    ],
  };
}

function git(...argumentsList: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...argumentsList], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
