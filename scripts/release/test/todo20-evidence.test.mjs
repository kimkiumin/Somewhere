import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const registryPath = resolve(repo, "scripts/release/todo20-artifacts-v1.json");
const canonicalCommand = (await readFile(
  resolve(repo, "scripts/release/todo20-exact-command.sh"),
  "utf8",
)).trimEnd();
const unsafeCodes = new Map([
  ["false-pass-missing-credential", "FALSE_RELEASE_PASS_WITHOUT_CREDENTIAL"],
  ["shared-environment-binding", "ENVIRONMENT_BINDING_REUSE"],
  ["lifecycle-gradual-rollback", "DO_LIFECYCLE_ROLLBACK_UNSAFE"],
  ["migration-without-backup", "MIGRATION_BACKUP_MISSING"],
  ["private-cache-leak", "PRIVATE_RESPONSE_CACHEABLE"],
  ["fork-secret-exposure", "UNTRUSTED_EVENT_SECRET_EXPOSURE"],
]);
const transcripts = new Map([
  ["task-20-workflow-green.txt", "PASS: workflow safety validated\n"],
  [
    "task-20-verdict-green.txt",
    "PASS: repository ready; release blocked by external gates\n",
  ],
  ["task-20-selftest-green.txt", "PASS: gate harness and Wrangler 4.115.0\n"],
  [
    "task-20-staging-green.txt",
    [
      "PASS: gate harness and Wrangler 4.115.0",
      "PASS: Wrangler configuration contract",
      "13 pass",
      "166 passed",
      "--dry-run: exiting now.",
      "PASS: staging compile, binding types, tests, build, and deploy dry-run",
      "",
    ].join("\n"),
  ],
  [
    "task-20-production-green.txt",
    [
      "PASS: gate harness and Wrangler 4.115.0",
      "PASS: Wrangler configuration contract",
      "13 pass",
      "166 passed",
      "--dry-run: exiting now.",
      "PASS: production compile, binding types, tests, build, and deploy dry-run",
      "",
    ].join("\n"),
  ],
  [
    "task-20-cleanup.txt",
    "PASS: zero external writes; temp removed; no credential created\n",
  ],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createEvidence(root) {
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  for (const path of registry.artifacts) {
    const absolute = resolve(root, path);
    await mkdir(resolve(absolute, ".."), { recursive: true });
    let value = transcripts.get(path) ?? "PASS\n";
    if (path.endsWith("workflow-verdict.json")) {
      value = `${JSON.stringify({
        gate: "PASS",
        schemaValid: true,
        externalWriteInLocalMode: false,
      })}\n`;
    } else if (path.endsWith("release-verdict.json")) {
      value = `${JSON.stringify({
        repositoryReady: "PASS",
        releaseReady: "BLOCK",
        blockingGates: ["CLOUDFLARE_CREDENTIAL_PASS"],
        externalWrites: 0,
      })}\n`;
    } else if (path.includes("/unsafe/")) {
      const fixture = path.split("/").at(-1).replace(".json", "");
      value = `${JSON.stringify({
        repositoryReady: "FAIL",
        failingGates: [unsafeCodes.get(fixture)],
        externalWrites: 0,
      })}\n`;
    } else if (path.includes("/cleanup-")) {
      const signal = path.match(/cleanup-(HUP|INT|TERM)/u)?.[1];
      value = `${JSON.stringify({
        signal,
        tempRemoved: true,
        handlerTerminated: true,
        processGroupTerminated: true,
        waited: true,
      })}\n`;
    }
    await writeFile(absolute, value);
  }
  const artifacts = await Promise.all(registry.artifacts.map(async (path) => {
    const value = await readFile(resolve(root, path));
    return { path, sha256: sha256(value), bytes: value.byteLength };
  }));
  return artifacts;
}

function receiptValue(artifacts) {
  return {
    schemaVersion: 1,
    tree: "a".repeat(40),
    inventoryDigest: `sha256:${"c".repeat(64)}`,
    argv: [
      "/bin/bash",
      "-lc",
      canonicalCommand,
    ],
    cwd: "/tmp/exact-source",
    exitCode: 0,
    exitClass: "GREEN_ZERO",
    expectedClass: "GREEN_ZERO",
    assertion: "exit 0 satisfied GREEN_ZERO",
    artifacts,
    dependencies: {
      root: "/external/dependencies/node_modules",
      lockfileSha256: `sha256:${"d".repeat(64)}`,
      paths: [
        "node_modules",
        "app/node_modules",
        "contracts/node_modules",
        "server/node_modules",
      ],
      readOnly: true,
      ephemeralCachePaths: [
        "node_modules/.vite-temp",
        "app/node_modules/.vite-temp",
        "contracts/node_modules/.vite-temp",
        "server/node_modules/.vite-temp",
      ],
      ephemeralWorkPaths: ["server/.wrangler"],
    },
    environment: {
      credentialsScrubbed: true,
      cachesIsolated: true,
      temporaryFilesystemIsolated: true,
      hostCredentialRootsMasked: true,
      hostProcessNamespaceMasked: true,
      preexistingEvidenceIsolated: true,
      temporaryRoot: "/tmp/removed-runner-root",
    },
    network: {
      policy: "deny",
      namespaceIsolated: true,
      externalConnectSucceeded: false,
      traceSha256: `sha256:${"b".repeat(64)}`,
      traceBytes: 0,
    },
    cleanup: {
      sourceUnchanged: true,
      temporaryRootRemovedByCaller: true,
      runnerTemporaryRootRemoved: true,
    },
    startedAt: "2026-07-29T00:00:00.000Z",
    endedAt: "2026-07-29T00:01:00.000Z",
  };
}

function validate(root, receipt, output = resolve(root, "verdict.json")) {
  return run(repo, [
    "bun",
    "scripts/release/validate-todo20-evidence.mjs",
    "--receipt",
    receipt,
    "--evidence-root",
    root,
    "--registry",
    registryPath,
    "--output",
    output,
  ]);
}

describe("Todo 20 exact-tree evidence", () => {
  test("accepts only the exact network-isolated 17-artifact set", async () => {
    const root = await temporaryDirectory("todo20-evidence");
    try {
      const artifacts = await createEvidence(root);
      const receipt = resolve(root, "task-20/exact-tree-receipt.json");
      await writeJson(receipt, receiptValue(artifacts));
      const output = resolve(root, "verdict.json");
      const result = validate(root, receipt, output);

      expect(result.exitCode).toBe(0);
      expect(await readJson(output)).toMatchObject({
        gate: "PASS",
        artifactCount: 17,
        externalWrites: 0,
        networkPolicy: "deny",
        transcriptsValidated: true,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a receipt that omits a governed artifact", async () => {
    const root = await temporaryDirectory("todo20-evidence-missing");
    try {
      const artifacts = await createEvidence(root);
      const receipt = resolve(root, "task-20/exact-tree-receipt.json");
      await writeJson(receipt, receiptValue(artifacts.slice(1)));
      const result = validate(root, receipt);

      expect(result.exitCode).toBe(1);
      expect((await readJson(resolve(root, "verdict.json"))).gate).toBe("FAIL");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a forged success transcript even when its receipt hash matches", async () => {
    const root = await temporaryDirectory("todo20-evidence-transcript");
    try {
      const artifacts = await createEvidence(root);
      const path = "task-20-workflow-green.txt";
      const forged = Buffer.from("PASS\n");
      await writeFile(resolve(root, path), forged);
      const entry = artifacts.find((artifact) => artifact.path === path);
      Object.assign(entry, { sha256: sha256(forged), bytes: forged.byteLength });
      const receipt = resolve(root, "task-20/exact-tree-receipt.json");
      await writeJson(receipt, receiptValue(artifacts));

      const result = validate(root, receipt);

      expect(result.exitCode).toBe(1);
      expect((await readJson(resolve(root, "verdict.json"))).reason)
        .toContain("workflow transcript");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a producer command that only contains the required marker tokens", async () => {
    const root = await temporaryDirectory("todo20-evidence-command");
    try {
      const artifacts = await createEvidence(root);
      const receipt = resolve(root, "task-20/exact-tree-receipt.json");
      const value = receiptValue(artifacts);
      value.argv[2] = `# ${value.argv[2]}\nprintf 'forged evidence directly\\n'`;
      await writeJson(receipt, value);

      const result = validate(root, receipt);

      expect(result.exitCode).toBe(1);
      expect((await readJson(resolve(root, "verdict.json"))).reason)
        .toContain("frozen Todo20 command");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
