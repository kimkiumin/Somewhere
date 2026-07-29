import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new TypeError("collector arguments must be --name value pairs");
    }
    result.set(key, value);
  }
  return result;
}

function git(repo, values) {
  const result = spawnSync("git", ["-C", repo, ...values], { encoding: "utf8" });
  if (result.status !== 0) throw new TypeError(result.stderr.trim());
  return result.stdout.trim();
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function files(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await files(directory, relative)));
    else if (entry.isFile()) found.push(relative);
  }
  return found.sort();
}

async function buildDigest(repo) {
  const dist = path.join(repo, "app", "dist");
  const hash = createHash("sha256");
  for (const relative of await files(dist)) {
    hash.update(relative);
    hash.update("\0");
    hash.update(await readFile(path.join(dist, relative)));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

async function artifact(evidence, relative) {
  const bytes = await readFile(path.join(evidence, relative));
  const value = { path: relative, sha256: sha256(bytes), bytes: bytes.length };
  if (relative.endsWith(".png")) {
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.length < 24) {
      throw new TypeError(`invalid PNG: ${relative}`);
    }
    return { ...value, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  return value;
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  const repo = path.resolve(options.get("--repo") ?? ".");
  const evidence = path.resolve(options.get("--evidence") ?? "");
  const expectedSha = options.get("--expected-sha") ?? "";
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || git(repo, ["rev-parse", "HEAD"]) !== expectedSha) {
    throw new TypeError("FOREIGN_SHA");
  }
  await mkdir(evidence, { recursive: true });
  await rm(path.join(evidence, "visual"), { force: true, recursive: true });
  for (const name of [
    "browser-run.log",
    "build-receipt.json",
    "playwright-results.json",
    "process-cleanup.json",
    "process-start.json",
    "visual-metadata.json",
  ]) {
    await rm(path.join(evidence, name), { force: true });
  }
  const run = spawnSync("bun", ["run", "test:e2e:v2"], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, V2_EVIDENCE_DIR: evidence },
    maxBuffer: 16 * 1024 * 1024,
  });
  const browserLog = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  await writeFile(path.join(evidence, "browser-run.log"), browserLog);
  if (run.status !== 0) throw new TypeError(`BROWSER_RUN_FAILED:${run.status}\n${browserLog}`);

  const sourceTree = git(repo, ["write-tree"]);
  const buildReceiptBytes = await readFile(path.join(evidence, "build-receipt.json"));
  const buildReceipt = JSON.parse(buildReceiptBytes.toString("utf8"));
  const digest = await buildDigest(repo);
  if (
    buildReceipt.sourceSha !== expectedSha ||
    buildReceipt.sourceTree !== sourceTree ||
    buildReceipt.buildDigest !== digest
  ) {
    throw new TypeError("FOREIGN_BUILD_RECEIPT");
  }
  const cleanup = JSON.parse(await readFile(path.join(evidence, "process-cleanup.json"), "utf8"));
  if (cleanup.portClosed !== true || cleanup.stateRemoved !== true) {
    throw new TypeError("INCOMPLETE_CLEANUP");
  }
  const playwright = JSON.parse(
    await readFile(path.join(evidence, "playwright-results.json"), "utf8"),
  );
  const testCounts = playwright.stats;
  if (testCounts?.unexpected !== 0 || testCounts?.expected !== 5) {
    throw new TypeError("INCOMPLETE_BROWSER_OBSERVATIONS");
  }
  const visualPaths = (await files(path.join(evidence, "visual")))
    .filter((value) => value.endsWith(".png"))
    .map((value) => `visual/${value}`);
  if (visualPaths.length !== 16) throw new TypeError(`EXPECTED_16_VISUALS:${visualPaths.length}`);
  const tracePaths = (await files(path.join(evidence, "playwright-output")))
    .filter((value) => value.endsWith("/trace.zip"))
    .map((value) => `playwright-output/${value}`);
  if (tracePaths.length !== 5) throw new TypeError(`EXPECTED_5_TRACES:${tracePaths.length}`);
  const governedPaths = [
    ...visualPaths,
    ...tracePaths,
    "browser-run.log",
    "build-receipt.json",
    "playwright-results.json",
    "process-cleanup.json",
    "process-start.json",
    "visual-metadata.json",
  ];
  const manifest = {
    schemaVersion: 2,
    sourceSha: expectedSha,
    sourceTree,
    buildDigest: digest,
    buildReceiptDigest: sha256(buildReceiptBytes),
    collectedAt: new Date().toISOString(),
    maxAgeMinutes: 30,
    observations: {
      command: "bun run test:e2e:v2",
      exitCode: run.status,
      expectedTests: testCounts.expected,
      unexpectedTests: testCounts.unexpected,
      surfaces: [
        "real Worker network and console",
        "WCAG 2A/AA/2.1AA axe scan",
        "320/390/430/1280 horizontal overflow",
        "offline service-worker reload",
      ],
      cleanup,
    },
    artifacts: await Promise.all(governedPaths.map((relative) => artifact(evidence, relative))),
    verdict: "PASS",
  };
  const output = path.join(evidence, "manual-evidence.json");
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${output}\n`);
}

await main();
