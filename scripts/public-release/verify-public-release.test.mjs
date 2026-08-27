import { describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { canonicalJson } from "../../app/qa/field/v2/canonical-json.mjs";
import {
  PUBLIC_RELEASE_PURPOSES,
  verifyPublicRelease,
} from "./verify-public-release.mjs";

const FINAL_SHA = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const MANIFEST = `sha256:${"c".repeat(64)}`;
const ISSUED_AT = "2026-08-01T00:00:00.000Z";
const EXPIRES_AT = "2026-08-08T00:00:00.000Z";
const NOW = "2026-08-02T00:00:00.000Z";
const REPO = resolve(import.meta.dir, "../..");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function authority(purposes = PUBLIC_RELEASE_PURPOSES) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    record: {
      authorityId: "release-owner-1",
      purposes: [...purposes],
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      validFrom: "2026-07-01T00:00:00.000Z",
      validUntil: "2026-09-01T00:00:00.000Z",
    },
  };
}

function signedReceipt(purpose, signer, overrides = {}) {
  const payload = {
    schemaVersion: 1,
    purpose,
    authorityId: signer.record.authorityId,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    finalSha: FINAL_SHA,
    sourceTree: SOURCE_TREE,
    terminalManifestSha256: MANIFEST,
    decision: "PASS",
    evidenceDigests: [`sha256:${sha256(Buffer.from(`evidence:${purpose}`))}`],
    conditions: [],
    ...overrides,
  };
  const signature = sign(null, Buffer.from(canonicalJson(payload)), signer.privateKey);
  return {
    schemaVersion: 1,
    payload,
    signature: {
      algorithm: "Ed25519",
      signatureBase64: signature.toString("base64"),
      signatureSha256: sha256(signature),
    },
  };
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "somewhere-public-release-"));
  const receiptRoot = resolve(root, "receipts");
  await mkdir(receiptRoot);
  const signer = authority();
  const trustStore = { schemaVersion: 1, authorities: [signer.record] };
  const receipts = PUBLIC_RELEASE_PURPOSES.map((purpose) => ({
    path: resolve(receiptRoot, `${purpose}.json`),
    value: signedReceipt(purpose, signer),
  }));
  for (const receipt of receipts) {
    await writeFile(receipt.path, `${JSON.stringify(receipt.value)}\n`, { mode: 0o600 });
  }
  return { root, receiptRoot, signer, trustStore, receipts };
}

async function run(values = {}) {
  const state = await fixture();
  try {
    return await verifyPublicRelease({
      trustStore: state.trustStore,
      receipts: state.receipts,
      finalSha: FINAL_SHA,
      sourceTree: SOURCE_TREE,
      terminalManifestSha256: MANIFEST,
      now: NOW,
      repoRoot: REPO,
      ...values,
    });
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
}

describe("public release authority", () => {
  test("publishes three strict JSON Schema 2020-12 contracts and side-effect-free help", async () => {
    for (const name of [
      "external-receipt-v1.schema.json",
      "trusted-authorities-v1.schema.json",
      "public-release-decision-v1.schema.json",
    ]) {
      const schema = JSON.parse(await readFile(resolve(import.meta.dir, name), "utf8"));
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
    }
    const result = Bun.spawnSync(["bun", "scripts/public-release/verify-public-release.mjs", "--help"], {
      cwd: resolve(import.meta.dir, "../.."),
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("--terminal-manifest-sha256");
  });

  test("accepts exactly eight trusted receipts bound to one release identity", async () => {
    const decision = await run();

    expect(decision.publicRelease).toBe("PASS");
    expect(decision.trustStoreSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(decision.receipts.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.receiptSha256))).toBe(true);
    expect(decision.receipts.map((entry) => entry.purpose)).toEqual(PUBLIC_RELEASE_PURPOSES);
  });

  test("derives FAIL before BLOCK before PASS from signed decisions", async () => {
    const state = await fixture();
    try {
      const input = {
        trustStore: state.trustStore, finalSha: FINAL_SHA, sourceTree: SOURCE_TREE,
        terminalManifestSha256: MANIFEST, now: NOW, repoRoot: REPO,
      };
      const blocked = structuredClone(state.receipts);
      blocked[2].value = signedReceipt(PUBLIC_RELEASE_PURPOSES[2], state.signer, { decision: "BLOCK" });
      expect((await verifyPublicRelease({ ...input, receipts: blocked })).publicRelease).toBe("BLOCK");

      const failed = structuredClone(blocked);
      failed[5].value = signedReceipt(PUBLIC_RELEASE_PURPOSES[5], state.signer, { decision: "FAIL" });
      expect((await verifyPublicRelease({ ...input, receipts: failed })).publicRelease).toBe("FAIL");
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  test("writes one owner-only decision through the fixed CLI", async () => {
    const state = await fixture();
    try {
      const clock = Date.now();
      const issuedAt = new Date(clock - 60_000).toISOString();
      const expiresAt = new Date(clock + 60 * 60 * 1_000).toISOString();
      state.signer.record.validFrom = new Date(clock - 24 * 60 * 60 * 1_000).toISOString();
      state.signer.record.validUntil = new Date(clock + 24 * 60 * 60 * 1_000).toISOString();
      for (const receipt of state.receipts) {
        receipt.value = signedReceipt(receipt.value.payload.purpose, state.signer, {
          expiresAt,
          issuedAt,
        });
        await writeFile(receipt.path, `${JSON.stringify(receipt.value)}\n`, { mode: 0o600 });
      }
      const trustPath = resolve(state.root, "trusted.json");
      const output = resolve(state.root, "decision.json");
      await writeFile(trustPath, `${JSON.stringify(state.trustStore)}\n`, { mode: 0o600 });
      const argv = [
        "bun", "scripts/public-release/verify-public-release.mjs",
        "--trust-store", trustPath,
        "--receipts", state.receiptRoot,
        "--final-sha", FINAL_SHA,
        "--source-tree", SOURCE_TREE,
        "--terminal-manifest-sha256", MANIFEST,
        "--repo", REPO,
        "--output", output,
      ];
      const result = Bun.spawnSync(argv, { cwd: REPO, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(await readFile(output, "utf8")).publicRelease).toBe("PASS");
      expect((await stat(output)).mode & 0o777).toBe(0o600);

      await writeFile(resolve(state.receiptRoot, "unexpected.json"), "{}\n");
      const extra = Bun.spawnSync([...argv.slice(0, -1), resolve(state.root, "second.json")], {
        cwd: REPO, stdout: "pipe", stderr: "pipe",
      });
      expect(extra.exitCode).not.toBe(0);
      expect(extra.stderr.toString()).toContain("receipt directory must contain exactly eight canonical files");
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  test("rejects missing, duplicate, and unknown purposes", async () => {
    const state = await fixture();
    try {
      const input = {
        trustStore: state.trustStore,
        finalSha: FINAL_SHA,
        sourceTree: SOURCE_TREE,
        terminalManifestSha256: MANIFEST,
        now: NOW,
        repoRoot: REPO,
      };
      await expect(verifyPublicRelease({ ...input, receipts: state.receipts.slice(1) })).rejects.toThrow(
        "receipts must contain the exact ordered public release purposes",
      );
      await expect(
        verifyPublicRelease({ ...input, receipts: [...state.receipts, state.receipts[0]] }),
      ).rejects.toThrow("receipts must contain the exact ordered public release purposes");
      const unknown = structuredClone(state.receipts);
      unknown[0].value.payload.purpose = "unknown";
      await expect(verifyPublicRelease({ ...input, receipts: unknown })).rejects.toThrow(
        "invalid receipt purpose",
      );
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  test("rejects untrusted, wrong-purpose, expired, and out-of-validity authorities", async () => {
    const state = await fixture();
    try {
      const base = {
        receipts: state.receipts,
        finalSha: FINAL_SHA,
        sourceTree: SOURCE_TREE,
        terminalManifestSha256: MANIFEST,
        now: NOW,
        repoRoot: REPO,
      };
      await expect(verifyPublicRelease({ ...base, trustStore: { schemaVersion: 1, authorities: [] } })).rejects.toThrow(
        "untrusted authority",
      );
      const wrongPurpose = structuredClone(state.trustStore);
      wrongPurpose.authorities[0].purposes = [PUBLIC_RELEASE_PURPOSES[0]];
      await expect(verifyPublicRelease({ ...base, trustStore: wrongPurpose })).rejects.toThrow(
        "authority purpose not granted",
      );
      await expect(verifyPublicRelease({ ...base, trustStore: state.trustStore, now: "2026-08-09T00:00:00.000Z" })).rejects.toThrow(
        "receipt expired",
      );
      const invalidWindow = structuredClone(state.trustStore);
      invalidWindow.authorities[0].validUntil = "2026-07-31T00:00:00.000Z";
      await expect(verifyPublicRelease({ ...base, trustStore: invalidWindow })).rejects.toThrow(
        "authority outside validity",
      );
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  test("rejects release identity drift and changed signed bytes", async () => {
    const state = await fixture();
    try {
      const base = {
        trustStore: state.trustStore,
        receipts: state.receipts,
        finalSha: FINAL_SHA,
        sourceTree: SOURCE_TREE,
        terminalManifestSha256: MANIFEST,
        now: NOW,
        repoRoot: REPO,
      };
      await expect(verifyPublicRelease({ ...base, finalSha: "d".repeat(40) })).rejects.toThrow("release identity mismatch");
      await expect(verifyPublicRelease({ ...base, sourceTree: "e".repeat(40) })).rejects.toThrow("release identity mismatch");
      await expect(
        verifyPublicRelease({ ...base, terminalManifestSha256: `sha256:${"f".repeat(64)}` }),
      ).rejects.toThrow("release identity mismatch");
      const changed = structuredClone(state.receipts);
      changed[0].value.payload.conditions = ["changed-after-signing"];
      await expect(verifyPublicRelease({ ...base, receipts: changed })).rejects.toThrow("invalid receipt signature");
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  test("rejects signature digest changes and repository-resident receipts", async () => {
    const state = await fixture();
    try {
      const base = {
        trustStore: state.trustStore,
        finalSha: FINAL_SHA,
        sourceTree: SOURCE_TREE,
        terminalManifestSha256: MANIFEST,
        now: NOW,
        repoRoot: REPO,
      };
      const changed = structuredClone(state.receipts);
      changed[0].value.signature.signatureSha256 = "0".repeat(64);
      await expect(verifyPublicRelease({ ...base, receipts: changed })).rejects.toThrow("signature digest mismatch");
      const inside = structuredClone(state.receipts);
      inside[0].path = resolve(REPO, "forged-receipt.json");
      await expect(verifyPublicRelease({ ...base, receipts: inside })).rejects.toThrow(
        "receipt path must be outside the repository",
      );
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });
});
