import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { verifyEd25519Attestation } from "../../qa/field/v2/attestation.mjs";
import { canonicalJson } from "../../qa/field/v2/canonical-json.mjs";
import { screenManifestMatches } from "../../qa/field/v2/screen-manifest.mjs";
import { resolvePinnedRegistry } from "../../qa/field/v2/trusted-authority.mjs";
import { cleanupTemporaryRoots, temporaryRoot } from "./field-v2.testkit";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

afterEach(cleanupTemporaryRoots);

describe("Somewhere V2 evidence authority", () => {
  test("accepts only a registry matching the reviewed digest pin", async () => {
    const root = await temporaryRoot("authority-pin");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const registryPath = join(root, "field-signers.json");
    const registryBytes = `${JSON.stringify(
      {
        schemaVersion: 1,
        purpose: "somewhere-v2-field-release",
        signers: [
          {
            keyId: "field-reviewer-1",
            publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
            validFrom: "2026-01-01T00:00:00.000Z",
            validUntil: "2027-01-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`;
    await writeFile(registryPath, registryBytes);
    const registrySha256 = sha256(registryBytes);
    const authority = await resolvePinnedRegistry(registryPath, "somewhere-v2-field-release", {
      schemaVersion: 1,
      status: "ACTIVE",
      fieldReleaseRegistrySha256: registrySha256,
      studyASupervisorRegistrySha256: "a".repeat(64),
    });
    expect(authority.state).toBe("READY");
    if (authority.state !== "READY") throw new Error("expected ready authority");

    const payload = { keyId: "field-reviewer-1", runId: "A" };
    const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey);
    expect(
      verifyEd25519Attestation({
        trustedRegistry: authority.registry,
        keyId: "field-reviewer-1",
        signedAt: "2026-07-29T00:00:00.000Z",
        signatureBase64: signature.toString("base64"),
        signatureSha256: sha256(signature),
        payload,
        sha256,
      }),
    ).toBeNull();

    await expect(
      resolvePinnedRegistry(registryPath, "somewhere-v2-field-release", {
        schemaVersion: 1,
        status: "ACTIVE",
        fieldReleaseRegistrySha256: "b".repeat(64),
        studyASupervisorRegistrySha256: "a".repeat(64),
      }),
    ).rejects.toThrow("TRUSTED_REGISTRY_DIGEST_MISMATCH");
  });

  test("matches screenshot manifests as a set rather than by sort locale", async () => {
    const root = await temporaryRoot("screen-order");
    const screens = join(root, "screens");
    await mkdir(screens);
    await writeFile(join(screens, "Z.png"), "upper");
    await writeFile(join(screens, "a.png"), "lower");
    const entries = (await readdir(screens, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    await expect(
      screenManifestMatches(
        root,
        entries,
        {
          "Z.png": sha256("upper"),
          "a.png": sha256("lower"),
        },
        sha256,
      ),
    ).resolves.toBe(true);
  });
});
