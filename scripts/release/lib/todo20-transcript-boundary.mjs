import { isAbsolute, relative, resolve, sep } from "node:path";
import { ReleaseInputError, snapshotRegularFile } from "./release-core.mjs";

function fail(message) {
  throw new ReleaseInputError(message);
}

function safePath(root, path) {
  if (isAbsolute(path) || path === "" || path.split("/").includes("..")) {
    fail(`unsafe evidence path: ${path}`);
  }
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    fail(`evidence path escapes root: ${path}`);
  }
  return absolute;
}

async function readBoundText(root, entry) {
  const snapshot = await snapshotRegularFile(safePath(root, entry.path), entry.path);
  if (
    snapshot.sha256.slice(7) !== entry.sha256
    || snapshot.bytes !== entry.bytes
  ) {
    fail(`evidence digest mismatch: ${entry.path}`);
  }
  return snapshot.data.toString().replace(/\u001B\[[0-9;]*[A-Za-z]/gu, "");
}

async function requireExactCommand(receipt) {
  if (
    receipt.argv.length !== 3
    || receipt.argv[0] !== "/bin/bash"
    || receipt.argv[1] !== "-lc"
  ) {
    fail("receipt does not bind the frozen Todo20 command");
  }
  const canonical = (await snapshotRegularFile(
    resolve(import.meta.dirname, "../todo20-exact-command.sh"),
    "frozen Todo20 command",
  )).data.toString().trimEnd();
  if (receipt.argv[2] !== canonical) {
    fail("receipt does not bind the frozen Todo20 command");
  }
}

export async function validateTodo20Provenance(receipt, root, entries) {
  await requireExactCommand(receipt);
  const exact = new Map([
    ["task-20-workflow-green.txt", "PASS: workflow safety validated\n"],
    [
      "task-20-verdict-green.txt",
      "PASS: repository ready; release blocked by external gates\n",
    ],
    ["task-20-selftest-green.txt", "PASS: gate harness and Wrangler 4.115.0\n"],
    [
      "task-20-cleanup.txt",
      "PASS: zero external writes; temp removed; no credential created\n",
    ],
  ]);
  for (const [path, expected] of exact) {
    if (await readBoundText(root, entries.get(path)) !== expected) {
      fail(`${path.replace("task-20-", "").replace("-green.txt", "")} transcript is not exact`);
    }
  }
  for (const environment of ["staging", "production"]) {
    const transcript = await readBoundText(
      root,
      entries.get(`task-20-${environment}-green.txt`),
    );
    const ordered = [
      "PASS: gate harness and Wrangler 4.115.0",
      "PASS: Wrangler configuration contract",
      "13 pass",
    ];
    let offset = 0;
    for (const marker of ordered) {
      const next = transcript.indexOf(marker, offset);
      if (next < 0) fail(`${environment} transcript is missing ordered marker: ${marker}`);
      offset = next + marker.length;
    }
    const passingTests = /\bTests\s+([1-9]\d*) passed\s+\(\1\)/u.exec(
      transcript.slice(offset),
    );
    if (passingTests === null) {
      fail(`${environment} transcript is missing a passing server test summary`);
    }
    offset += passingTests.index + passingTests[0].length;
    ordered.push(
      "--dry-run: exiting now.",
      `PASS: ${environment} compile, binding types, tests, build, and deploy dry-run`,
    );
    for (const marker of ordered.slice(3)) {
      const next = transcript.indexOf(marker, offset);
      if (next < 0) fail(`${environment} transcript is missing ordered marker: ${marker}`);
      offset = next + marker.length;
    }
    if (!transcript.endsWith(`${ordered.at(-1)}\n`)) {
      fail(`${environment} transcript has no exact completion marker`);
    }
  }
}
