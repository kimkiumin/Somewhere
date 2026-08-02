import { basename, dirname, resolve } from "node:path";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import {
  assertHex,
  git,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  resultGate,
  run,
  sha256,
  snapshotRegularFile,
  writeJson,
} from "./lib/release-core.mjs";
import { assertReceiptLane } from "./lib/release-contracts.mjs";

const specification = {
  required: [
    "--lane",
    "--check-id",
    "--sha",
    "--source-tree",
    "--plan-sha256",
    "--policy",
    "--policy-sha256",
    "--primary",
    "--primary-mode",
    "--receipt",
    "--argv-json",
  ],
  optional: ["--cwd", "--env-json"],
};
const blockedCredentials = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ZONE_ID",
  "CF_API_TOKEN",
  "CF_API_KEY",
  "CF_API_EMAIL",
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET",
  "SOMEWHERE_API_BASE_URL",
];

function environment(additions = {}) {
  const allowed = ["PATH", "LANG", "LC_ALL", "TZ", "CI", "TMPDIR", "CODEX_HOME"];
  const values = Object.fromEntries(
    allowed.flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]),
  );
  for (const name of blockedCredentials) delete values[name];
  for (const [name, value] of Object.entries(additions)) {
    if (blockedCredentials.includes(name) || typeof value !== "string") {
      throw new TypeError(`unsafe command environment: ${name}`);
    }
    values[name] = value;
  }
  return values;
}

function artifact(snapshot) {
  return { path: snapshot.path, sha256: snapshot.sha256, bytes: snapshot.bytes };
}

async function toolVersion(binary, cwd) {
  const versionArg = binary === "bun" || binary === "codex2" ? "--version" : "--version";
  const observed = await run([binary, versionArg], { cwd, env: environment() });
  return observed.exitCode === 0 ? observed.stdout.toString().trim() : "unavailable";
}

async function execute(options) {
  assertReceiptLane(options.lane);
  assertHex(options.sha, 40, "sha");
  assertHex(options["source-tree"], 40, "source-tree");
  const argv = JSON.parse(options["argv-json"]);
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((entry) => typeof entry !== "string")) {
    throw new TypeError("argv-json must contain a nonempty string array");
  }
  if (!["native", "native-or-json-envelope"].includes(options["primary-mode"])) {
    throw new TypeError("unknown primary-mode");
  }
  const cwd = resolve(options.cwd ?? ".");
  const assertSourceIdentity = async () => {
    if (
      await git(cwd, ["rev-parse", "HEAD"]) !== options.sha
      || await git(cwd, ["rev-parse", "HEAD^{tree}"]) !== options["source-tree"]
      || await git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]) !== ""
    ) {
      throw new TypeError("command source identity is not the clean exact commit");
    }
  };
  await assertSourceIdentity();
  const additions = options["env-json"] === undefined ? {} : JSON.parse(options["env-json"]);
  const receipt = resolve(options.receipt);
  const primary = resolve(options.primary);
  await mkdir(dirname(receipt), { recursive: true });
  await mkdir(dirname(primary), { recursive: true });
  const stem = basename(receipt, ".json");
  const stdoutPath = resolve(dirname(receipt), `${stem}.stdout.log`);
  const stderrPath = resolve(dirname(receipt), `${stem}.stderr.log`);
  const startedAt = new Date().toISOString();
  const observed = await run(argv, { cwd, env: environment(additions) });
  await assertSourceIdentity();
  await Promise.all([
    writeFile(stdoutPath, observed.stdout),
    writeFile(stderrPath, observed.stderr),
  ]);
  if (options["primary-mode"] === "native-or-json-envelope") {
    try {
      await lstat(primary);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      let parsedStdout = null;
      try {
        parsedStdout = JSON.parse(observed.stdout.toString());
      } catch (parseError) {
        if (!(parseError instanceof SyntaxError)) throw parseError;
      }
      await writeJson(primary, {
        schemaVersion: 1,
        gate: observed.exitCode === 0 ? "PASS" : "FAIL",
        exitCode: observed.exitCode,
        stdout: parsedStdout,
        stdoutSha256: sha256(observed.stdout),
        stderrSha256: sha256(observed.stderr),
      });
    }
  }
  const primarySnapshot = await snapshotRegularFile(primary, "command primary");
  let primaryValue;
  try {
    primaryValue = JSON.parse(primarySnapshot.data.toString());
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const primaryGate = resultGate(primaryValue);
  const gate = observed.exitCode === 0 && primaryGate !== "FAIL" && primaryGate !== "BLOCK"
    ? "PASS"
    : observed.exitCode === 2 && primaryGate === "BLOCK"
      ? "BLOCK"
      : "FAIL";
  const [stdoutSnapshot, stderrSnapshot] = await Promise.all([
    snapshotRegularFile(stdoutPath, "command stdout"),
    snapshotRegularFile(stderrPath, "command stderr"),
  ]);
  await writeJson(receipt, {
    schemaVersion: 1,
    gate,
    lane: options.lane,
    checkId: options["check-id"],
    finalSha: options.sha,
    sourceTree: options["source-tree"],
    planSha256: normalizeDigest(options["plan-sha256"], "plan-sha256"),
    policy: {
      path: options.policy,
      sha256: normalizeDigest(options["policy-sha256"], "policy-sha256"),
    },
    argv,
    cwd,
    environmentPolicy: "credential-scrubbed-v1",
    tool: { binary: argv[0], version: await toolVersion(argv[0], cwd) },
    exitCode: observed.exitCode,
    primary: artifact(primarySnapshot),
    stdout: artifact(stdoutSnapshot),
    stderr: artifact(stderrSnapshot),
    startedAt,
    endedAt: new Date().toISOString(),
  });
  if (gate === "FAIL") process.exitCode = 1;
}

const parsed = parseArguments(process.argv.slice(2), specification);
if (parsed.help === true) {
  console.log("capture-command-receipt.mjs --lane F1 --check-id id --sha SHA --source-tree TREE --plan-sha256 DIGEST --policy PATH --policy-sha256 DIGEST --primary PATH --primary-mode native|native-or-json-envelope --receipt PATH --argv-json JSON");
} else {
  await mainBoundary(() => execute(parsed), parsed.receipt);
}
