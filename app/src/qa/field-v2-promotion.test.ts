import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupTemporaryRoots,
  promoter,
  qaRoot,
  run,
  temporaryRoot,
  verdict,
} from "./field-v2.testkit";

const parentPath = fileURLToPath(
  new URL("../../../contracts/policy/navigation-v2-calibration-1.json", import.meta.url),
);

function studySessions(candidatePolicy: unknown, candidatePolicySha256: string) {
  return Array.from({ length: 5 }, (_, index) => ({
    schemaVersion: 1,
    sessionId: `study-a-session-${index + 1}-physical`,
    evidenceOrigin: "physical",
    supervised: true,
    deviceModel: "iPhone 15 Pro Max",
    iosVersion: "18.4",
    browserMode: index % 2 === 0 ? "safari" : "home-screen",
    startedAt: `2026-07-2${index + 1}T10:00:00.000Z`,
    endedAt: `2026-07-2${index + 1}T10:20:00.000Z`,
    environment: index % 2 === 0 ? "open-sky" : "building-dense",
    routeId: "seoul-forest-route-1",
    parentPolicySha256: "281418e65f21f43b07f90977d44fe1e2db9243dc9ffd5fd207ab48613977ff04",
    candidatePolicySha256,
    candidatePolicy,
    candidateInEnvelope: true,
    unsafeEvents: 0,
    outcomes: {
      falseArrivals: 0,
      directionOutsideExit: 0,
      staleBackgroundArrows: 0,
      directBearingFallbacks: 0,
      duplicateListeners: 0,
      newP0P1Defects: 0,
      missedArrivals: 0,
      recoveries: 1,
      missedArrivalsReviewed: true,
      recoveriesReviewed: true,
    },
    traceSha256: `${index + 1}`.repeat(64),
    traceStoredPrivately: true,
    supervisor: "declared-only",
    supervisorAttestationSha256: `${index + 5}`.repeat(64),
    supervisorKeyId: "declared-only-key",
    supervisorSignatureBase64: "ZmFrZQ==",
  }));
}

async function writeStudy(root: string, sessions: readonly unknown[]): Promise<string> {
  const studyRoot = join(root, "study");
  await cp(join(qaRoot, "fixtures", "synthetic-release-block"), studyRoot, {
    recursive: true,
  });
  await writeFile(
    join(studyRoot, "study-a-evidence.json"),
    `${JSON.stringify({ schemaVersion: 1, studyId: "study-a-authority-test", sessions }, null, 2)}\n`,
  );
  return studyRoot;
}

afterEach(cleanupTemporaryRoots);

describe("Somewhere V2 policy promotion", () => {
  test("blocks promotion without 5-8 real Study A sessions and creates no RC", async () => {
    const root = await temporaryRoot("missing");
    const outputPolicy = join(root, "navigation-v2-rc-1.json");
    const receipt = join(root, "receipt.json");
    const result = run(promoter, [
      "--input",
      join(root, "missing-study-a"),
      "--parent-policy",
      parentPath,
      "--output-policy",
      outputPolicy,
      "--receipt",
      receipt,
    ]);
    expect(result.status, result.stderr).toBe(2);
    expect(existsSync(outputPolicy)).toBe(false);
    expect(await verdict(receipt)).toMatchObject({
      promotionGate: "BLOCK",
      rcCreated: false,
      reason: "STUDY_A_EVIDENCE_MISSING",
    });
  });

  test("declared physical sessions need trusted supervisor attestations", async () => {
    const root = await temporaryRoot("authority");
    const candidatePolicy = JSON.parse(await readFile(parentPath, "utf8"));
    candidatePolicy.policyVersion = "navigation-v2-calibration-2";
    candidatePolicy.routeCorridorEnterM = 30;
    const studyRoot = await writeStudy(
      root,
      studySessions(
        candidatePolicy,
        "c493887fb64e067116d264e13f85d23238c46b03f340196eea58a8fb1dfd098c",
      ),
    );
    const outputPolicy = join(root, "navigation-v2-rc-1.json");
    const receipt = join(root, "receipt.json");
    const attackerRegistry = join(root, "attacker-study-a-signers.json");
    const { publicKey } = generateKeyPairSync("ed25519");
    await writeFile(
      attackerRegistry,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          purpose: "somewhere-v2-study-a-supervision",
          signers: [
            {
              keyId: "declared-only-key",
              publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
              validFrom: "2026-01-01T00:00:00.000Z",
              validUntil: "2027-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const result = run(promoter, [
      "--input",
      studyRoot,
      "--parent-policy",
      parentPath,
      "--output-policy",
      outputPolicy,
      "--trusted-supervisors",
      attackerRegistry,
      "--receipt",
      receipt,
    ]);
    expect(result.status, result.stderr).toBe(2);
    expect(existsSync(outputPolicy)).toBe(false);
    expect(await verdict(receipt)).toMatchObject({
      promotionGate: "BLOCK",
      reason: "STUDY_A_AUTHORITY_NOT_PINNED",
    });
  });

  test("rejects a candidate outside the numeric Study A envelope", async () => {
    const root = await temporaryRoot("outside-envelope");
    const candidatePolicy = JSON.parse(await readFile(parentPath, "utf8"));
    candidatePolicy.policyVersion = "navigation-v2-calibration-2";
    candidatePolicy.maxGuidanceAccuracyM = 99;
    const studyRoot = await writeStudy(
      root,
      studySessions(
        candidatePolicy,
        "2ec8c7761783c79ed72405881b71c21b486f56751ae9726389e9dc7fcb5b65d0",
      ),
    );
    const receipt = join(root, "receipt.json");
    const result = run(promoter, [
      "--input",
      studyRoot,
      "--parent-policy",
      parentPath,
      "--output-policy",
      join(root, "navigation-v2-rc-1.json"),
      "--receipt",
      receipt,
    ]);
    expect(result.status, result.stderr).toBe(1);
    expect(await verdict(receipt)).toMatchObject({
      promotionGate: "FAIL",
      reason: "CANDIDATE_OUTSIDE_STUDY_A_ENVELOPE",
    });
  });

  test("rejects an existing RC policy path without overwriting it", async () => {
    const root = await temporaryRoot("reuse");
    const outputPolicy = join(root, "navigation-v2-rc-1.json");
    const receipt = join(root, "receipt.json");
    await writeFile(outputPolicy, "existing-rc-sentinel\n");
    const result = run(promoter, [
      "--input",
      join(root, "missing-study-a"),
      "--parent-policy",
      parentPath,
      "--output-policy",
      outputPolicy,
      "--receipt",
      receipt,
    ]);
    expect(result.status, result.stderr).toBe(1);
    expect(await readFile(outputPolicy, "utf8")).toBe("existing-rc-sentinel\n");
    expect(await verdict(receipt)).toMatchObject({
      promotionGate: "FAIL",
      reason: "RC_POLICY_ALREADY_EXISTS",
    });
  });
});
