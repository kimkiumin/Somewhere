import { describe, expect, test } from "bun:test";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  collectBuildProvenance,
  workspaceManifestPaths,
} from "../lib/build-provenance.mjs";
import { sha256 } from "../lib/release-core.mjs";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const finalSha = "a".repeat(40);
const sourceTree = "b".repeat(40);

async function receiptFixture(root, provenance) {
  const artifactPath = "prepared/build/app.js";
  const artifact = resolve(root, artifactPath);
  await Bun.write(artifact, "console.log('prepared')\n");
  const bytes = (await readFile(artifact)).byteLength;
  const digest = sha256(await readFile(artifact));
  const artifacts = [{ path: artifactPath, sha256: digest, bytes, kind: "app-asset" }];
  const receipt = resolve(root, "prepared/build-receipt.json");
  await writeJson(receipt, {
    schemaVersion: 2,
    finalSha,
    sourceTree,
    artifacts,
    buildDigest: sha256(artifacts.map((entry) =>
      `${entry.sha256}\t${entry.bytes}\t${entry.path}\0`
    ).join("")),
    provenance,
  });
  return receipt;
}

function verify(root, receipt) {
  const output = resolve(root, "verdict.json");
  const result = run(repo, [
    "bun",
    "scripts/release/verify-build-receipt.mjs",
    "--sha",
    finalSha,
    "--source-tree",
    sourceTree,
    "--receipt",
    receipt,
    "--final-root",
    root,
    "--output",
    output,
  ]);
  return { output, result };
}

describe("prepared production build provenance", () => {
  test("rejects a receipt missing its frozen dependency and toolchain identity", async () => {
    const root = await temporaryDirectory("build-provenance-missing");
    try {
      const receipt = await receiptFixture(root, undefined);
      const { output, result } = verify(root, receipt);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(output)).reason).toContain("provenance");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a toolchain field changed without a matching provenance digest", async () => {
    const root = await temporaryDirectory("build-provenance-mismatch");
    try {
      const receipt = await receiptFixture(root, {
        schemaVersion: 1,
        digest: `sha256:${"0".repeat(64)}`,
        bun: { version: "1.3.14" },
        lockfile: { path: "bun.lock", sha256: `sha256:${"1".repeat(64)}` },
        workspaceManifests: [],
        tools: {
          vite: { version: "8.1.5" },
          wrangler: { version: "4.115.0" },
        },
      });
      const mutated = await readJson(receipt);
      mutated.provenance.tools.vite.version = "99.0.0";
      await writeFile(receipt, `${JSON.stringify(mutated, null, 2)}\n`);

      const { output, result } = verify(root, receipt);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(output)).reason).toContain("provenance");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects an installed tool identity that resolves outside the exact checkout", async () => {
    // Given
    const root = await temporaryDirectory("build-provenance-tool-escape");
    try {
      const checkout = resolve(root, "checkout");
      await Promise.all(["bun.lock", ...workspaceManifestPaths].map(async (path) => {
        const target = resolve(checkout, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, "{}\n");
      }));
      await mkdir(resolve(checkout, "node_modules/.bin"), { recursive: true });
      for (const name of ["vite", "wrangler"]) {
        const externalPackage = resolve(root, "external", name);
        const externalBinary = resolve(externalPackage, "bin", `${name}.js`);
        await mkdir(dirname(externalBinary), { recursive: true });
        await writeFile(resolve(externalPackage, "package.json"), JSON.stringify({
          name,
          version: "1.0.0",
        }));
        await writeFile(externalBinary, "export {};\n");
        await symlink(externalPackage, resolve(checkout, "node_modules", name), "dir");
        await symlink(externalBinary, resolve(checkout, "node_modules/.bin", name));
      }

      // When
      const provenance = collectBuildProvenance(checkout);

      // Then
      await expect(provenance).rejects.toThrow("outside");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
