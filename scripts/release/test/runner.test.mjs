import { describe, expect, test } from "bun:test";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const materializeScript = resolve(repo, "scripts/release/materialize-planned-tree.mjs");

function git(fixtureRepo, arguments_) {
  const result = run(fixtureRepo, ["git", ...arguments_]);
  if (result.exitCode !== 0) throw new TypeError(result.stderr.toString().trim());
  return result.stdout.toString();
}

async function createMaterializationFixture(root) {
  const fixtureRepo = resolve(root, "repository");
  await mkdir(fixtureRepo, { recursive: true });
  await writeJson(resolve(fixtureRepo, "package.json"), {
    name: "@somewhere/materialization-fixture",
    private: true,
  });
  await writeFile(resolve(fixtureRepo, "content.txt"), "committed fixture content\n");
  git(fixtureRepo, ["init", "--quiet"]);
  git(fixtureRepo, ["add", "package.json", "content.txt"]);
  git(fixtureRepo, [
    "-c",
    "user.name=Somewhere Test",
    "-c",
    "user.email=test@somewhere.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  return {
    repo: fixtureRepo,
    tree: git(fixtureRepo, ["rev-parse", "HEAD^{tree}"]).trim(),
    status: git(fixtureRepo, ["status", "--porcelain=v1"]),
  };
}

describe("Prepared Worker launcher", () => {
  test("fails before allocation when the requested port is already occupied", async () => {
    const root = await temporaryDirectory("occupied-service");
    const server = createServer();
    await new Promise((complete, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", complete);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new TypeError("test server did not bind TCP");
      const output = resolve(root, "receipt.json");
      const result = run(repo, [
        "bun",
        "scripts/release/start-final-lane-service.mjs",
        "--repo",
        repo,
        "--asset-dir",
        resolve(root, "assets"),
        "--state-dir",
        resolve(root, "state"),
        "--runtime-dir",
        resolve(root, "runtime"),
        "--host",
        "127.0.0.1",
        "--port",
        String(address.port),
        "--output",
        output,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(output))).toEqual({
        schemaVersion: 1,
        gate: "FAIL",
        reason: `port already in use: 127.0.0.1:${address.port}`,
      });
      await expect(access(resolve(root, "runtime"))).rejects.toBeDefined();
      await expect(access(resolve(root, "state"))).rejects.toBeDefined();
    } finally {
      await new Promise((complete, reject) => {
        server.close((error) => error === undefined ? complete() : reject(error));
      });
      await removeTemporaryDirectory(root);
    }
  });
});

describe("Final lane lifecycle", () => {
  for (const [signal, expectedExit] of [["HUP", 129], ["INT", 130], ["TERM", 143]]) {
    test(`removes allocated state before terminating on SIG${signal}`, async () => {
      const root = await temporaryDirectory(`signal-${signal.toLowerCase()}`);
      try {
        const output = resolve(root, "receipt.json");
        const result = run(repo, [
          "bun",
          "scripts/release/run-final-lane.mjs",
          "--signal-probe",
          signal,
          "--probe-output",
          output,
        ]);
        expect(result.exitCode).toBe(expectedExit);
        const receipt = await readJson(output);
        expect(receipt).toMatchObject({
          schemaVersion: 1,
          signal,
          exitCode: expectedExit,
          tempRemoved: true,
          handlerTerminated: true,
        });
        expect(typeof receipt.tempRoot).toBe("string");
        await expect(access(receipt.tempRoot)).rejects.toBeDefined();
      } finally {
        await removeTemporaryDirectory(root);
      }
    });
  }
});

describe("Exact tree materialization", () => {
  test("materializes the named Git tree outside the repository without touching source state", async () => {
    const root = await temporaryDirectory("materialize");
    try {
      const fixture = await createMaterializationFixture(root);
      const destination = resolve(root, "tree");
      const receipt = resolve(root, "receipt.json");
      const result = run(repo, [
        "bun",
        materializeScript,
        "--repo",
        fixture.repo,
        "--tree",
        fixture.tree,
        "--destination",
        destination,
        "--receipt",
        receipt,
      ]);
      expect(result.exitCode).toBe(0);
      expect((await readJson(receipt))).toMatchObject({
        schemaVersion: 1,
        gate: "PASS",
        sourceTree: fixture.tree,
        destination,
      });
      expect(await readJson(resolve(destination, "package.json"))).toEqual({
        name: "@somewhere/materialization-fixture",
        private: true,
      });
      expect(await readFile(resolve(destination, "content.txt"), "utf8")).toBe(
        "committed fixture content\n",
      );
      expect(git(fixture.repo, ["status", "--porcelain=v1"])).toBe(fixture.status);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a destination inside the repository", async () => {
    const root = await temporaryDirectory("materialize-reject");
    try {
      const fixture = await createMaterializationFixture(root);
      const destination = resolve(fixture.repo, ".forbidden-release-tree");
      const result = run(repo, [
        "bun",
        materializeScript,
        "--repo",
        fixture.repo,
        "--tree",
        fixture.tree,
        "--destination",
        destination,
        "--receipt",
        resolve(root, "receipt.json"),
      ]);
      expect(result.exitCode).not.toBe(0);
      await expect(access(destination)).rejects.toBeDefined();
      expect(git(fixture.repo, ["status", "--porcelain=v1"])).toBe(fixture.status);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});

describe("Final cleanup verifier", () => {
  test("accepts only structured clean lane receipts and actually closed ports", async () => {
    const root = await temporaryDirectory("final-cleanup");
    try {
      for (const lane of ["F1", "F2", "F3", "F4"]) {
        await writeJson(resolve(root, lane, "cleanup.txt"), {
          schemaVersion: 1,
          gate: "PASS",
          pid: null,
          portClosed: true,
          browserContextCount: 0,
          tempRoot: null,
          tempRootRemoved: true,
        });
      }
      const output = resolve(root, "cleanup.json");
      const result = run(repo, [
        "bun",
        "scripts/release/verify-final-cleanup.mjs",
        "--evidence-root",
        root,
        "--require-lanes",
        "F1,F2,F3,F4",
        "--require-ports-closed",
        "38787,38788",
        "--require-zero-browser-contexts",
        "--require-zero-temp-roots",
        "--output",
        output,
      ]);
      expect(result.exitCode).toBe(0);
      expect((await readJson(output))).toMatchObject({
        schemaVersion: 1,
        gate: "PASS",
        serverCount: 0,
        browserContextCount: 0,
        openPorts: [],
        tempRoots: [],
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
