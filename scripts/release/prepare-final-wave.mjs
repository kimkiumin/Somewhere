import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import {
  assertExternalPath,
  assertHex,
  digestFile,
  git,
  isInside,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  run,
  writeJson,
} from "./lib/release-core.mjs";
import { artifact, artifactDigest, artifactKind, files } from "./lib/artifacts.mjs";

const specification = {
  required: ["--repo", "--sha", "--plan", "--plan-sha256", "--evidence-root", "--output"],
};
const help = "prepare-final-wave.mjs --repo PATH --sha SHA --plan PATH --plan-sha256 DIGEST --evidence-root EXTERNAL_PATH --output EXTERNAL_PATH";

async function command(argv, cwd, environment = process.env) {
  const result = await run(argv, { cwd, env: environment });
  if (result.exitCode !== 0) {
    throw new TypeError(`${argv.join(" ")} failed\n${result.stderr.toString().slice(-4000)}`);
  }
}

async function copyBuild(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const path of await files(source)) {
    const target = resolve(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(source, path), target);
  }
}

async function preparation(options) {
  const repo = resolve(options.repo);
  const sha = assertHex(options.sha, 40, "sha");
  const planDigest = normalizeDigest(options["plan-sha256"]);
  const evidenceRoot = await assertExternalPath(repo, options["evidence-root"], "evidence-root");
  const output = await assertExternalPath(repo, options.output, "output");
  const expectedOutput = resolve(evidenceRoot, "final", sha, "preparation.json");
  if (output !== expectedOutput) throw new TypeError("output must be final/<sha>/preparation.json");
  if (await git(repo, ["rev-parse", "HEAD"]) !== sha) throw new TypeError("final SHA is not HEAD");
  if (await git(repo, ["cat-file", "-t", `${sha}^{commit}`]) !== "commit") throw new TypeError("final SHA is not a commit");
  if ((await git(repo, ["status", "--porcelain=v1", "--untracked-files=no"])) !== "") {
    throw new TypeError("tracked worktree or index is dirty");
  }
  const plan = resolve(options.plan);
  if (await digestFile(plan) !== planDigest) throw new TypeError("reviewed plan digest mismatch");
  const finalRoot = resolve(evidenceRoot, "final", sha);
  if (isInside(repo, finalRoot)) throw new TypeError("final root must be external");
  const prepared = resolve(finalRoot, "prepared");
  await mkdir(prepared, { recursive: true });
  for (const lane of ["F1", "F2", "F3", "F4"]) await mkdir(resolve(finalRoot, lane), { recursive: true });
  const temporary = await mkdtemp("/tmp/somewhere-v2-preparation.");
  let receipt;
  try {
    const sourceArchive = resolve(prepared, "source.tar");
    await command(["git", "-C", repo, "archive", "--format=tar", "--output", sourceArchive, sha], repo);
    const source = resolve(temporary, "source");
    await mkdir(source);
    await command(["tar", "-xf", sourceArchive, "-C", source], temporary);
    const tree = await git(repo, ["rev-parse", `${sha}^{tree}`]);
    const policyRelative = await Bun.file(resolve(source, "contracts/policy/navigation-v2-rc-1.json")).exists()
      ? "contracts/policy/navigation-v2-rc-1.json"
      : "contracts/policy/navigation-v2-calibration-1.json";
    const policyKind = policyRelative.includes("rc-1.json") ? "rc" : "calibration";
    const policySource = resolve(source, policyRelative);
    const policyCopy = resolve(prepared, basename(policyRelative));
    await cp(policySource, policyCopy);
    const policyDigest = await digestFile(policyCopy);
    const rcReceipt = resolve(prepared, "rc-promotion-receipt.json");
    await writeJson(rcReceipt, {
      schemaVersion: 1,
      gate: policyKind === "rc" ? "PASS" : "BLOCK",
      reason: policyKind === "rc" ? "TRACKED_RC_SELECTED" : "RC_ABSENT",
      finalSha: sha,
      policySha256: policyDigest,
    });
    await command(["bun", "install", "--frozen-lockfile"], source);
    await command(["bun", "run", "verify:release"], source, {
      ...process.env,
      SOMEWHERE_SOURCE_SHA: sha,
      SOMEWHERE_SOURCE_TREE: tree,
    });
    const buildOutput = resolve(temporary, "build");
    const upstreamReceipt = resolve(temporary, "production-build.json");
    await command([
      "bun",
      "run",
      "build:production",
      "--",
      "--outdir",
      buildOutput,
      "--receipt",
      upstreamReceipt,
    ], source, {
      ...process.env,
      SOMEWHERE_SOURCE_SHA: sha,
      SOMEWHERE_SOURCE_TREE: tree,
    });
    const upstreamBuild = JSON.parse(await Bun.file(upstreamReceipt).text());
    const buildCopy = resolve(prepared, "build");
    await copyBuild(buildOutput, buildCopy);
    const buildArchive = resolve(prepared, "build.tar.gz");
    await command(["tar", "-czf", buildArchive, "-C", prepared, "build"], temporary);
    const planCopy = resolve(prepared, "somewhere-v2-launch-architecture.md");
    await cp(plan, planCopy);
    const buildArtifacts = await Promise.all((await files(buildCopy)).map((path) => {
      const finalPath = `prepared/build/${path}`;
      return artifact(finalRoot, finalPath, artifactKind(finalPath));
    }));
    const buildReceipt = resolve(prepared, "build-receipt.json");
    await writeJson(buildReceipt, {
      schemaVersion: 2,
      finalSha: sha,
      sourceTree: tree,
      policy: { kind: policyKind, path: relative(finalRoot, policyCopy), sha256: policyDigest },
      commands: ["bun install --frozen-lockfile", "bun run verify:release", "bun run build:production"],
      tools: { bun: Bun.version, git: await git(repo, ["--version"]) },
      provenance: upstreamBuild.provenance,
      config: "server/wrangler.jsonc",
      entrypoint: "server/src/index.ts",
      artifacts: buildArtifacts,
      buildDigest: artifactDigest(buildArtifacts),
      builtAt: new Date().toISOString(),
    });
    const external = resolve(finalRoot, "external-gates.json");
    const externalIds = ["cloudflare-production", "cloudflare-canonical-origin", "cloudflare-production-pitr", "provider-rights-quota", "korean-privacy-location-review", "study-a-rc", "physical-iphone", "native-distribution"];
    await writeJson(external, {
      schemaVersion: 1,
      finalSha: sha,
      sourceTree: tree,
      gates: externalIds.map((id) => ({ id, gate: "BLOCK", reason: "MISSING_AUTHORIZED_EXTERNAL_EVIDENCE" })),
      releaseGate: "BLOCK",
    });
    const manifest = resolve(prepared, "preparation-manifest.sha256");
    const manifestPaths = (await files(prepared)).filter((path) => path !== "preparation-manifest.sha256");
    const lines = [];
    for (const path of manifestPaths) lines.push(`${(await digestFile(resolve(prepared, path))).slice(7)}  ${path}`);
    await writeFile(manifest, `${lines.join("\n")}\n`);
    receipt = {
      schemaVersion: 1,
      preparationGate: "PASS",
      finalSha: sha,
      sourceTree: tree,
      reviewedPlan: { path: relative(finalRoot, planCopy), sha256: await digestFile(planCopy) },
      policy: { kind: policyKind, path: relative(finalRoot, policyCopy), sha256: policyDigest },
      buildReceipt: { path: relative(finalRoot, buildReceipt), sha256: await digestFile(buildReceipt) },
      buildArchive: { path: relative(finalRoot, buildArchive), sha256: await digestFile(buildArchive) },
      sourceArchive: { path: relative(finalRoot, sourceArchive), sha256: await digestFile(sourceArchive) },
      preparationManifest: { path: relative(finalRoot, manifest), sha256: await digestFile(manifest) },
      rcPromotionReceipt: { path: relative(finalRoot, rcReceipt), sha256: await digestFile(rcReceipt) },
      cleanup: { temporaryRootRemoved: true },
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  await writeJson(output, receipt);
}

const parsed = parseArguments(process.argv.slice(2), specification);
if (parsed.help === true) console.log(help);
else await mainBoundary(() => preparation(parsed), parsed.output);
