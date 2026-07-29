import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { ReleaseInputError } from "./release-core.mjs";
import { prepareDependencyLayer } from "./exact-dependency-boundary.mjs";
import {
  changedArtifacts,
  evidenceInventory,
  publishEvidence,
} from "./exact-evidence-boundary.mjs";
import {
  hasSuccessfulExternalConnect,
  isolatedEnvironment,
  sandboxCommand,
  sandboxRuntime,
} from "./exact-sandbox-boundary.mjs";
export { changedArtifacts, evidenceInventory };

const ZERO_EXIT_CLASSES = new Set(["GREEN_ZERO", "NEGATIVE_PASS_ZERO"]);

function exitMatches(expectedClass, exitCode) {
  const expectsZero = ZERO_EXIT_CLASSES.has(expectedClass);
  return expectsZero ? exitCode === 0 : exitCode !== 0;
}

export async function runExactCommand(
  argv,
  source,
  evidenceRoot,
  dependencyRoot,
  tree,
  policy,
  expectedClass,
) {
  if (!["inherit", "deny"].includes(policy)) {
    throw new ReleaseInputError("network-policy must be inherit or deny");
  }
  if (
    typeof expectedClass !== "string"
    || ![
      "TDD_RED_NONZERO",
      "GREEN_ZERO",
      "NEGATIVE_PASS_ZERO",
      "MUTATION_CAUGHT_NONZERO",
    ].includes(expectedClass)
  ) {
    throw new ReleaseInputError("expected exit class is required");
  }
  const root = await mkdtemp("/var/tmp/somewhere-exact-tree.");
  const executionRoot = policy === "deny" ? "/workspace" : source;
  try {
    const emittedEvidence = resolve(root, "emitted-evidence");
    const privateHome = resolve(root, "private-home");
    const trace = resolve(root, "network.trace");
    await Promise.all([mkdir(emittedEvidence), mkdir(privateHome), writeFile(trace, "")]);
    let dependencies = null;
    if (dependencyRoot !== undefined) {
      const layer = resolve(root, "dependency-layer");
      await mkdir(layer, { recursive: true });
      dependencies = await prepareDependencyLayer(source, dependencyRoot, layer);
    }
    const environment = isolatedEnvironment(
      policy === "deny" ? "/home/sandbox" : privateHome,
      executionRoot,
      tree,
      policy === "deny" ? "/evidence" : emittedEvidence,
    );
    if (policy !== "deny") {
      environment.PATH = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
      await Promise.all(Object.values(environment)
        .filter((path) => path.startsWith(privateHome))
        .map((path) => mkdir(path, { recursive: true })));
    }
    const runtime = policy === "deny" ? await sandboxRuntime() : undefined;
    const sandbox = policy === "deny"
      ? sandboxCommand({
          argv,
          environment,
          source,
          emittedEvidence,
          dependencies,
          ephemeralPaths: dependencies === null ? [] : [
            ...dependencies.ephemeralCachePaths,
            ...dependencies.ephemeralWorkPaths,
          ],
          root,
          trace,
          runtime,
        })
      : { argv, cwd: source, spawnCwd: source };
    const child = spawn(sandbox.argv[0], sandbox.argv.slice(1), {
      cwd: sandbox.spawnCwd,
      env: policy === "deny" ? { PATH: environment.PATH } : environment,
      stdio: "inherit",
    });
    const exitCode = await new Promise((complete, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => complete(code ?? 255));
    });
    const data = policy === "deny" ? await readFile(trace) : Buffer.alloc(0);
    const externalConnectSucceeded = hasSuccessfulExternalConnect(data.toString());
    if (externalConnectSucceeded) {
      throw new ReleaseInputError("network-isolated command opened an external connection");
    }
    const artifacts = exitMatches(expectedClass, exitCode)
      ? await publishEvidence(emittedEvidence, evidenceRoot)
      : [];
    return {
      exitCode,
      artifacts,
      cwd: sandbox.cwd,
      dependencies,
      environment: {
        credentialsScrubbed: true,
        cachesIsolated: true,
        temporaryFilesystemIsolated: true,
        hostCredentialRootsMasked: policy === "deny",
        hostProcessNamespaceMasked: policy === "deny",
        preexistingEvidenceIsolated: true,
        temporaryRoot: root,
      },
      network: {
        policy,
        namespaceIsolated: policy === "deny",
        externalConnectSucceeded,
        traceSha256: `sha256:${createHash("sha256").update(data).digest("hex")}`,
        traceBytes: data.byteLength,
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
