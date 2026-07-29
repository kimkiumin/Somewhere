import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  assertExternalPath,
  assertHex,
  digestFile,
  mainBoundary,
  parseArguments,
  run,
  writeJson,
} from "./lib/release-core.mjs";
import { artifact, artifactDigest, artifactKind, files } from "./lib/artifacts.mjs";

const specification = {
  required: ["--outdir", "--receipt"],
  optional: ["--environment"],
};
const help =
  "build-production.mjs --outdir EXTERNAL_PATH --receipt EXTERNAL_PATH [--environment staging|production]";
async function requireAbsent(path, label) {
  try {
    await lstat(path);
    throw new TypeError(`${label} already exists`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

function cleanEnvironment(home) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LANG: process.env.LANG ?? "C.UTF-8",
    CI: "1",
    HOME: home,
    XDG_CONFIG_HOME: resolve(home, "xdg/config"),
    XDG_CACHE_HOME: resolve(home, "xdg/cache"),
    XDG_DATA_HOME: resolve(home, "xdg/data"),
    BUN_INSTALL_CACHE_DIR: resolve(home, "bun-cache"),
    npm_config_cache: resolve(home, "npm-cache"),
    WRANGLER_HOME: resolve(home, "wrangler-home"),
    WRANGLER_SEND_METRICS: "false",
    TMPDIR: resolve(home, "tmp"),
  };
}

async function execute(argv, cwd, environment) {
  const result = await run(argv, { cwd, env: environment });
  if (result.exitCode !== 0) {
    throw new TypeError(`${argv[0]} failed: ${result.stderr.toString().slice(-2_000)}`);
  }
}

async function build(options) {
  const repo = resolve(import.meta.dir, "../..");
  const target = options.environment ?? "production";
  if (!["staging", "production"].includes(target)) {
    throw new TypeError("environment must be staging or production");
  }
  await mkdir(dirname(resolve(options.outdir)), { recursive: true });
  await mkdir(dirname(resolve(options.receipt)), { recursive: true });
  const outdir = await assertExternalPath(repo, options.outdir, "outdir");
  const receipt = await assertExternalPath(repo, options.receipt, "receipt");
  await Promise.all([requireAbsent(outdir, "outdir"), requireAbsent(receipt, "receipt")]);
  const temporary = await mkdtemp("/tmp/somewhere-v2-production.");
  const stage = resolve(dirname(outdir), `.somewhere-production-${process.pid}`);
  await requireAbsent(stage, "staging output");
  await mkdir(resolve(stage, "app/dist"), { recursive: true });
  const environment = cleanEnvironment(resolve(temporary, "home"));
  await Promise.all(Object.values(environment)
    .filter((path) => path.startsWith(temporary))
    .map((path) => mkdir(path, { recursive: true })));
  try {
    await execute([
      "bun",
      "--bun",
      resolve(repo, "node_modules/.bin/vite"),
      "build",
      "--config",
      resolve(repo, "app/vite.config.ts"),
      "--base",
      "/",
      "--outDir",
      resolve(stage, "app/dist"),
    ], resolve(repo, "app"), environment);
    await execute([
      "bun",
      resolve(repo, "app/scripts/assert-precache-unique.mjs"),
      resolve(stage, "app/dist"),
      "production",
    ], repo, environment);
    await execute([
      resolve(repo, "node_modules/.bin/wrangler"),
      "deploy",
      "--config",
      resolve(repo, "server/wrangler.jsonc"),
      "--env",
      target,
      "--assets",
      resolve(stage, "app/dist"),
      "--dry-run",
      "--outdir",
      resolve(stage, "worker"),
    ], repo, environment);
    await rename(stage, outdir);
    const outputs = await Promise.all((await files(outdir)).map(async (path) => ({
      ...await artifact(outdir, path, artifactKind(`prepared/build/${path}`)),
      path,
    })));
    const sourceSha = process.env.SOMEWHERE_SOURCE_SHA;
    const sourceTree = process.env.SOMEWHERE_SOURCE_TREE;
    if (sourceSha !== undefined) assertHex(sourceSha, 40, "source SHA");
    if (sourceTree !== undefined) assertHex(sourceTree, 40, "source tree");
    const assetManifest = outputs.find((entry) => entry.path === "app/dist/manifest.webmanifest");
    if (assetManifest === undefined) throw new TypeError("production asset manifest missing");
    await writeJson(receipt, {
      schemaVersion: 1,
      gate: "PASS",
      sourceSha: sourceSha ?? null,
      sourceTree: sourceTree ?? null,
      environment: target,
      config: {
        path: "server/wrangler.jsonc",
        sha256: await digestFile(resolve(repo, "server/wrangler.jsonc")),
      },
      entrypoint: {
        path: "server/src/index.ts",
        sha256: await digestFile(resolve(repo, "server/src/index.ts")),
      },
      assetManifest: {
        path: assetManifest.path,
        sha256: assetManifest.sha256,
      },
      artifacts: outputs,
      buildDigest: artifactDigest(outputs),
      externalWrites: 0,
    });
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(temporary, { recursive: true, force: true });
  }
}

const parsed = parseArguments(process.argv.slice(2), specification);
if (parsed.help === true) console.log(help);
else await mainBoundary(() => build(parsed), parsed.receipt);
