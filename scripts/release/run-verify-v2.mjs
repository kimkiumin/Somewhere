import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ReleaseInputError,
  mainBoundary,
  parseArguments,
  run,
  sha256,
  writeJson,
} from "./lib/release-core.mjs";
import {
  createVerifyV2RuntimeEvidence,
  validateVerifyV2RuntimeEvidence,
} from "./lib/verify-v2-runtime-evidence.mjs";

const specification = {
  required: [
    "--sha",
    "--source-tree",
    "--registry",
    "--evidence-dir",
    "--output",
    "--argv-json",
  ],
  optional: ["--cwd"],
};

async function requireAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new ReleaseInputError(`${label} must not already exist`);
}

async function execute(options) {
  const evidenceDir = resolve(options["evidence-dir"]);
  const output = resolve(options.output);
  await requireAbsent(evidenceDir, "verify-v2 runtime evidence root");
  await requireAbsent(output, "verify-v2 runtime primary");
  const argv = JSON.parse(options["argv-json"]);
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((entry) => typeof entry !== "string")) {
    throw new ReleaseInputError("argv-json must contain a nonempty string array");
  }
  const observed = await run(argv, {
    cwd: resolve(options.cwd ?? "."),
    env: {
      ...process.env,
      SOMEWHERE_OPS_EVIDENCE_DIR: evidenceDir,
      SOMEWHERE_SOURCE_SHA: options.sha,
      SOMEWHERE_SOURCE_TREE: options["source-tree"],
    },
  });
  process.stdout.write(observed.stdout);
  process.stderr.write(observed.stderr);
  if (observed.exitCode !== 0) {
    await writeJson(output, {
      schemaVersion: 1,
      gate: "FAIL",
      finalSha: options.sha,
      sourceTree: options["source-tree"],
      command: {
        argv,
        exitCode: observed.exitCode,
        stdoutSha256: sha256(observed.stdout),
        stderrSha256: sha256(observed.stderr),
      },
    });
    process.exitCode = 1;
    return;
  }
  const primary = await createVerifyV2RuntimeEvidence({
    sha: options.sha,
    sourceTree: options["source-tree"],
    registry: options.registry,
    evidenceDir,
    command: {
      argv,
      exitCode: observed.exitCode,
      stdoutSha256: sha256(observed.stdout),
      stderrSha256: sha256(observed.stderr),
    },
  });
  await writeJson(output, primary);
  await validateVerifyV2RuntimeEvidence({
    input: output,
    sha: options.sha,
    sourceTree: options["source-tree"],
    registry: options.registry,
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
if (parsed.help === true) {
  console.log("run-verify-v2.mjs --sha SHA --source-tree TREE --registry PATH --evidence-dir PATH --output PATH --argv-json JSON [--cwd PATH]");
} else {
  await mainBoundary(() => execute(parsed), parsed.output);
}
