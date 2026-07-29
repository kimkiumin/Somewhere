import { generateKeyPairSync } from "node:crypto";
import { cp, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupTemporaryRoots,
  qaRoot,
  run,
  temporaryRoot,
  validator,
  verdict,
} from "./field-v2.testkit";

afterEach(cleanupTemporaryRoots);

describe("Somewhere V2 physical evidence gate", () => {
  test("TASK21_DEVICE_PASS_REQUIRES_RC_BUILD", async () => {
    const root = await temporaryRoot("synthetic");
    const fixture = join(qaRoot, "fixtures", "synthetic-schema-valid");
    const schemaOutput = join(root, "schema.json");
    const schemaResult = run(validator, [
      "--mode",
      "schema",
      "--input",
      fixture,
      "--output",
      schemaOutput,
    ]);
    expect(schemaResult.status, schemaResult.stderr).toBe(0);
    expect(await verdict(schemaOutput)).toMatchObject({
      schemaValid: true,
      devicePass: false,
      deviceGate: "BLOCK",
      evidenceOrigin: "synthetic",
    });

    const releaseOutput = join(root, "release.json");
    const releaseResult = run(validator, [
      "--mode",
      "release",
      "--input",
      fixture,
      "--output",
      releaseOutput,
    ]);
    expect(releaseResult.status, releaseResult.stderr).toBe(2);
    expect(await verdict(releaseOutput)).toMatchObject({
      schemaValid: true,
      devicePass: false,
      deviceGate: "BLOCK",
    });
  });

  test.each([
    ["foreign-sha", "buildSha", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    ["pre-build", "startedAt", "2026-07-29T09:59:59.000Z"],
    ["stale-provider", "providerExpiresAt", "2026-07-29T10:00:00.000Z"],
    ["unsupported-home-screen-ios", "iosVersion", "18.3"],
    ["unsupported-home-screen", "wakeLockSupported", false],
  ])("rejects %s field evidence", async (_label, field, value) => {
    const root = await temporaryRoot("mutation");
    const fixture = join(root, "fixture");
    await cp(join(qaRoot, "fixtures", "synthetic-schema-valid"), fixture, {
      recursive: true,
    });
    const evidence = JSON.parse(await readFile(join(fixture, "evidence.json"), "utf8"));
    const metadataPath = join(fixture, evidence.runDirectories[0], "metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata[field] = value;
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    const output = join(root, "verdict.json");

    const result = run(validator, ["--mode", "schema", "--input", fixture, "--output", output]);

    expect(result.status, result.stderr).toBe(1);
    expect(await verdict(output)).toMatchObject({ schemaValid: false, deviceGate: "FAIL" });
  });

  test("rejects reused trace, incomplete P1-P7, and raw trace artifacts", async () => {
    const root = await temporaryRoot("privacy");
    const fixture = join(root, "fixture");
    await cp(join(qaRoot, "fixtures", "synthetic-schema-valid"), fixture, {
      recursive: true,
    });
    const evidence = JSON.parse(await readFile(join(fixture, "evidence.json"), "utf8"));
    const first = join(fixture, evidence.runDirectories[0]);
    const second = join(fixture, evidence.runDirectories[1]);
    await writeFile(join(second, "trace.sha256"), await readFile(join(first, "trace.sha256")));
    const metadataPath = join(first, "metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    delete metadata.gates.P7;
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    await writeFile(join(first, "raw-trace.json"), '{"preciseLocation":"forbidden"}\n');
    const output = join(root, "verdict.json");

    const result = run(validator, ["--mode", "schema", "--input", fixture, "--output", output]);

    expect(result.status, result.stderr).toBe(1);
    expect(await verdict(output)).toMatchObject({ schemaValid: false, deviceGate: "FAIL" });
  });

  test("rejects a checklist changed after metadata creation", async () => {
    const root = await temporaryRoot("checklist");
    const fixture = join(root, "fixture");
    await cp(join(qaRoot, "fixtures", "synthetic-schema-valid"), fixture, {
      recursive: true,
    });
    const evidence = JSON.parse(await readFile(join(fixture, "evidence.json"), "utf8"));
    const checklist = join(fixture, evidence.runDirectories[0], "checklist.md");
    await writeFile(checklist, `${await readFile(checklist, "utf8")}\nTampered.\n`);
    const output = join(root, "verdict.json");

    const result = run(validator, ["--mode", "schema", "--input", fixture, "--output", output]);

    expect(result.status, result.stderr).toBe(1);
    expect(await verdict(output)).toMatchObject({ schemaValid: false, deviceGate: "FAIL" });
  });

  test("rejects a screenshot changed after metadata creation", async () => {
    const root = await temporaryRoot("screenshot");
    const fixture = join(root, "fixture");
    await cp(join(qaRoot, "fixtures", "synthetic-schema-valid"), fixture, {
      recursive: true,
    });
    const evidence = JSON.parse(await readFile(join(fixture, "evidence.json"), "utf8"));
    const screenshot = join(
      fixture,
      evidence.runDirectories[0],
      "screens",
      "synthetic-placeholder.txt",
    );
    await writeFile(screenshot, "changed after attestation\n");
    const output = join(root, "verdict.json");

    const result = run(validator, ["--mode", "schema", "--input", fixture, "--output", output]);

    expect(result.status, result.stderr).toBe(1);
    expect(await verdict(output)).toMatchObject({ schemaValid: false, deviceGate: "FAIL" });
  });

  test("a declared physical but tampered package is FAIL rather than BLOCK", async () => {
    const root = await temporaryRoot("tampered");
    const output = join(root, "verdict.json");
    const result = run(validator, [
      "--mode",
      "release",
      "--input",
      join(qaRoot, "fixtures", "physical-tampered"),
      "--output",
      output,
    ]);
    expect(result.status, result.stderr).toBe(1);
    expect(await verdict(output)).toMatchObject({
      evidenceOrigin: "physical",
      schemaValid: false,
      deviceGate: "FAIL",
    });
  });

  test("origin labels cannot forge DEVICE_PASS", async () => {
    const root = await temporaryRoot("origin");
    const fixture = join(root, "fixture");
    await cp(join(qaRoot, "fixtures", "synthetic-schema-valid"), fixture, {
      recursive: true,
    });
    const evidencePath = join(fixture, "evidence.json");
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    evidence.evidenceOrigin = "physical";
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    for (const directory of evidence.runDirectories) {
      const metadataPath = join(fixture, directory, "metadata.json");
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      metadata.evidenceOrigin = "physical";
      metadata.screensSha256 = {
        "synthetic-placeholder.png":
          "30f322d89681214dfd70d1f1a59650f456f11f9430df6ec5bed37e5213eb2e53",
      };
      metadata.testerAttestation.keyId = "declared-only-key";
      metadata.testerAttestation.signatureBase64 = "ZmFrZQ==";
      await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      await rename(
        join(fixture, directory, "screens", "synthetic-placeholder.txt"),
        join(fixture, directory, "screens", "synthetic-placeholder.png"),
      );
    }
    const attackerRegistry = join(root, "attacker-field-signers.json");
    const { publicKey } = generateKeyPairSync("ed25519");
    await writeFile(
      attackerRegistry,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          purpose: "somewhere-v2-field-release",
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
    const output = join(root, "verdict.json");
    const result = run(validator, [
      "--mode",
      "release",
      "--input",
      fixture,
      "--trusted-signers",
      attackerRegistry,
      "--output",
      output,
    ]);

    expect(result.status, result.stderr).toBe(2);
    expect(await verdict(output)).toMatchObject({
      schemaValid: true,
      devicePass: false,
      deviceGate: "BLOCK",
      reason: "FIELD_RELEASE_AUTHORITY_NOT_PINNED",
    });
  });
});
