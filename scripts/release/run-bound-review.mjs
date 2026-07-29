import { dirname, resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  digestFile,
  git,
  mainBoundary,
  parseArguments,
  readJson,
  run,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--profile", "--sha", "--source-tree", "--inputs", "--output"],
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
  "CLOUDFLARE_ACCESS_CLIENT_ID",
  "CLOUDFLARE_ACCESS_CLIENT_SECRET",
  "CLOUDFLARE_API_BASE_URL",
  "SOMEWHERE_API_BASE_URL",
];

function reviewerEnvironment() {
  const environment = { ...process.env };
  for (const name of blockedCredentials) delete environment[name];
  if (typeof environment.CODEX_HOME !== "string" || environment.CODEX_HOME === "") {
    throw new TypeError("reviewer CODEX_HOME is required");
  }
  environment.CODEX_HOME = resolve(environment.CODEX_HOME);
  environment.HOME = dirname(environment.CODEX_HOME);
  return environment;
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
  const inputs = await Promise.all(inputPaths.map(async (path) => ({ path, sha256: await digestFile(path) })));
  const temporary = await mkdtemp(resolve(tmpdir(), "somewhere-bound-review."));
  try {
    const responsePath = resolve(temporary, "response.json");
    const prompt = [
      profile.instructions,
      `Exact reviewed commit: ${options.sha}`,
      `Exact source tree: ${options["source-tree"]}`,
      "Bound inputs:",
      ...inputs.map((input) => `- ${input.path} ${input.sha256}`),
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
    const response = await readJson(responsePath);
    if (
      !["APPROVE", "REQUEST_CHANGES", "BLOCK"].includes(response.verdict)
      || !Array.isArray(response.findings)
      || (response.verdict === "APPROVE" && response.findings.some((entry) => ["P0", "P1"].includes(entry.severity)))
    ) {
      throw new TypeError("reviewer verdict contradiction");
    }
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
