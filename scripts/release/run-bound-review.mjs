import { dirname, resolve } from "node:path";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  digestFile,
  git,
  isInside,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  readJson,
  run,
  snapshotRegularFile,
  writeJson,
} from "./lib/release-core.mjs";
import { validateVerifyV2RuntimeEvidence } from "./lib/verify-v2-runtime-evidence.mjs";
import {
  assertReviewerResponse,
  parseReviewerAssessment,
} from "./lib/reviewer-assessment.mjs";
import { assertReviewInputBindings } from "./lib/review-input-bindings.mjs";
import { exactRuntimeValidationContext } from "./lib/runtime-suites.mjs";

const specification = {
  required: ["--profile", "--sha", "--source-tree", "--inputs", "--output"],
  optional: [
    "--prepared-build-root",
    "--prepared-build-receipt",
    "--prepared-source-archive",
    "--review-root",
  ],
};
const allowedEnvironmentVariables = [
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "CI",
  "TMPDIR",
];

function reviewerEnvironment() {
  const codeHome = process.env.CODEX_HOME;
  if (typeof codeHome !== "string" || codeHome === "") {
    throw new TypeError("reviewer CODEX_HOME is required");
  }
  const environment = Object.fromEntries(
    allowedEnvironmentVariables.flatMap((name) =>
      process.env[name] === undefined ? [] : [[name, process.env[name]]]
    ),
  );
  environment.CODEX_HOME = resolve(codeHome);
  environment.HOME = dirname(environment.CODEX_HOME);
  return environment;
}

async function bindInputs(inputPaths, options, snapshotRoot) {
  const explicit = await Promise.all(inputPaths.map(async (path) => {
    const snapshot = await snapshotRegularFile(path, "review input");
    return { path, sha256: snapshot.sha256, snapshot };
  }));
  const repo = await realpath(resolve("."));
  const reviewRoot = options["review-root"] === undefined
    ? undefined
    : await realpath(options["review-root"]);
  const expanded = [...explicit];
  if (reviewRoot !== undefined) {
    const byPath = new Map(expanded.map((entry) => [entry.path, entry.sha256]));
    for (const input of explicit) {
      let value;
      try {
        value = JSON.parse(input.snapshot.data.toString());
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        continue;
      }
      if (value?.reviewBindings === undefined) continue;
      if (!Array.isArray(value.reviewBindings) || value.reviewBindings.length > 128) {
        throw new TypeError("review bindings must be a bounded array");
      }
      for (const binding of value.reviewBindings) {
        if (
          binding === null
          || typeof binding !== "object"
          || Array.isArray(binding)
          || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(["path", "sha256"])
          || typeof binding.path !== "string"
          || binding.path === ""
        ) {
          throw new TypeError("invalid review binding");
        }
        const lexicalPath = resolve(binding.path);
        const path = await realpath(lexicalPath);
        if (path !== lexicalPath) {
          throw new TypeError("review binding path is not canonical");
        }
        if (!isInside(repo, path) && !isInside(reviewRoot, path)) {
          throw new TypeError("review binding escapes approved roots");
        }
        const expectedDigest = normalizeDigest(binding.sha256, "review binding digest");
        const existingDigest = byPath.get(path);
        if (existingDigest !== undefined) {
          if (existingDigest !== expectedDigest) {
            throw new TypeError("duplicate review binding digest mismatch");
          }
          continue;
        }
        const snapshot = await snapshotRegularFile(path, "expanded review input");
        if (snapshot.sha256 !== expectedDigest) {
          throw new TypeError("expanded review input digest mismatch");
        }
        const entry = { path, sha256: snapshot.sha256, snapshot };
        expanded.push(entry);
        byPath.set(path, snapshot.sha256);
      }
    }
  }
  assertReviewInputBindings(expanded.map(({ path, sha256: digest, snapshot }) => ({
    path,
    sha256: digest,
    data: snapshot.data,
  })));
  const preparedValues = [
    options["prepared-build-root"],
    options["prepared-build-receipt"],
    options["prepared-source-archive"],
  ];
  const exactMode = preparedValues.every((value) => value !== undefined);
  if (!exactMode && preparedValues.some((value) => value !== undefined)) {
    throw new TypeError("exact prepared build inputs must be supplied together");
  }
  const exactContext = exactMode
    ? await exactRuntimeValidationContext({
        sha: options.sha,
        sourceTree: options["source-tree"],
        repo: resolve("."),
        buildRoot: options["prepared-build-root"],
        receipt: options["prepared-build-receipt"],
        sourceArchive: options["prepared-source-archive"],
      })
    : {};
  let runtimeEvidence;
  for (const input of explicit) {
    let value;
    try {
      value = JSON.parse(input.snapshot.data.toString());
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      continue;
    }
    if (value?.runtimeEvidence === undefined) continue;
    if (runtimeEvidence !== undefined) throw new TypeError("multiple runtime evidence manifests");
    runtimeEvidence = await validateVerifyV2RuntimeEvidence({
      input: input.path,
      sha: options.sha,
      sourceTree: options["source-tree"],
      registry: "scripts/release/verify-v2-runtime-artifacts-v1.json",
      runtimeSuites: exactContext.runtimeSuites,
      preparedBuild: exactContext.preparedBuild,
    });
    if (runtimeEvidence.primarySnapshot.sha256 !== input.sha256) {
      throw new TypeError("runtime evidence primary changed while binding");
    }
  }
  const artifacts = runtimeEvidence === undefined
    ? []
    : runtimeEvidence.artifacts.map((entry) => ({
      path: entry.absolutePath,
      sha256: entry.sha256,
      data: entry.data,
    }));
  const records = [
    ...expanded.map(({ path, sha256: digest, snapshot }) => ({
      path,
      sha256: digest,
      data: snapshot.data,
    })),
    ...artifacts,
  ];
  const inputs = records.map(({ path, sha256: digest }) => ({ path, sha256: digest }));
  if (new Set(inputs.map((input) => input.path)).size !== inputs.length) {
    throw new TypeError("expanded review inputs must be unique");
  }
  const promptInputs = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const path = resolve(snapshotRoot, `input-${String(index).padStart(3, "0")}`);
    await writeFile(path, record.data, { flag: "wx", mode: 0o400 });
    const snapshot = await snapshotRegularFile(path, "private review input snapshot");
    if (snapshot.sha256 !== record.sha256) {
      throw new TypeError("private review input snapshot digest mismatch");
    }
    promptInputs.push({ originalPath: record.path, path, sha256: record.sha256 });
  }
  return { inputs, promptInputs };
}

async function review(options) {
  const repo = resolve(".");
  if (
    await git(repo, ["rev-parse", "HEAD"]) !== options.sha
    || await git(repo, ["rev-parse", "HEAD^{tree}"]) !== options["source-tree"]
    || await git(repo, ["status", "--porcelain=v1", "--untracked-files=no"]) !== ""
  ) {
    throw new TypeError("review source identity is not the clean exact commit");
  }
  const profilePath = resolve(options.profile);
  const profile = await readJson(profilePath);
  if (
    profile.schemaVersion !== 1
    || profile.runner.binary !== "codex2"
    || profile.runner.sandbox !== "read-only"
    || profile.runner.ephemeral !== true
  ) {
    throw new TypeError("unsafe reviewer profile");
  }
  const assessment = parseReviewerAssessment(profile.assessment);
  const environment = reviewerEnvironment();
  const version = await run(["codex2", "--version"], { cwd: repo, env: environment });
  const observedVersion = version.stdout.toString().trim();
  if (version.exitCode !== 0 || observedVersion !== profile.runner.version) {
    throw new TypeError("reviewer runner version mismatch");
  }
  const inputPaths = options.inputs.split(",").filter(Boolean).map((path) => resolve(path));
  if (inputPaths.length === 0 || new Set(inputPaths).size !== inputPaths.length) {
    throw new TypeError("review inputs must be unique and nonempty");
  }
  const temporary = await mkdtemp(resolve(tmpdir(), "somewhere-bound-review."));
  try {
    const { inputs, promptInputs } = await bindInputs(inputPaths, options, temporary);
    const responsePath = resolve(temporary, "response.json");
    const prompt = [
      profile.instructions,
      ...(assessment === undefined
        ? []
        : [
            `Machine assessment contract: ${JSON.stringify(assessment)}`,
            "Judge repository readiness under that contract; preserve external release BLOCKs without converting them into repository findings.",
            `When no local findings exist, return ${assessment.noLocalFindingsVerdict}.`,
          ]),
      `Exact reviewed commit: ${options.sha}`,
      `Exact source tree: ${options["source-tree"]}`,
      "Bound inputs are immutable private snapshots; inspect snapshot paths, not original paths:",
      ...promptInputs.map((input) =>
        `- original=${input.originalPath} snapshot=${input.path} ${input.sha256}`
      ),
      "Return only the output-schema JSON. APPROVE is allowed only with zero P0/P1 findings.",
    ].join("\n");
    const invoked = await run([
      "codex2",
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--sandbox",
      "read-only",
      "--model",
      profile.runner.model,
      "--cd",
      repo,
      "--output-schema",
      resolve(profile.outputSchema),
      "--output-last-message",
      responsePath,
      prompt,
    ], { cwd: repo, env: environment });
    if (invoked.exitCode !== 0) throw new TypeError(`reviewer runner failed: ${invoked.stderr.toString().trim()}`);
    const response = assertReviewerResponse(await readJson(responsePath), assessment);
    await writeJson(resolve(options.output), {
      schemaVersion: 1,
      verdict: response.verdict,
      reviewedSha: options.sha,
      sourceTree: options["source-tree"],
      profileId: profile.id,
      profileSha256: await digestFile(profilePath),
      runner: {
        binary: "codex2",
        version: observedVersion,
        model: profile.runner.model,
        sandbox: "read-only",
      },
      inputs,
      findings: response.findings,
    });
    if (response.verdict !== "APPROVE") process.exitCode = 1;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => review(parsed), parsed.output);
