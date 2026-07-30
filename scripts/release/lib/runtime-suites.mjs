import { resolve } from "node:path";
import { ReleaseInputError, digestFile, sha256 } from "./release-core.mjs";
import { readSourceArchiveFile, verifyPreparedBuild } from "./prepared-build.mjs";

export const requiredRuntimeSuites = [
  {
    key: "alarmRestart",
    path: "server/test/async-alarm-todo12.runtime.ts",
    rawReport: "async-do-runtime-report.json",
    assertionCount: 2,
  },
  {
    key: "journeyState",
    path: "server/test/journey-do-cloudflare.runtime.ts",
    rawReport: "journey-do-runtime-report.json",
    assertionCount: 2,
  },
  {
    key: "writeFence",
    path: "server/test/task14-feedback-epoch.test.ts",
    rawReport: "write-fence-runtime-report.json",
    assertionCount: 4,
  },
];

export async function runtimeSuiteBindingsFromArchive(sourceArchive, repo) {
  return Promise.all(requiredRuntimeSuites.map(async (suite) => ({
    ...suite,
    sourceSha256: sha256(await readSourceArchiveFile(sourceArchive, suite.path)),
    executedPath: resolve(repo, suite.path),
  })));
}

export async function runtimeSuiteBindingsFromDirectory(repo) {
  return Promise.all(requiredRuntimeSuites.map(async (suite) => ({
    ...suite,
    sourceSha256: await digestFile(resolve(repo, suite.path)),
    executedPath: resolve(repo, suite.path),
  })));
}

export async function exactRuntimeValidationContext(options) {
  const verified = await verifyPreparedBuild({
    sha: options.sha,
    sourceTree: options.sourceTree,
    repo: options.repo,
    buildRoot: options.buildRoot,
    receipt: options.receipt,
    sourceArchive: options.sourceArchive,
  });
  const runtimeSuites = await runtimeSuiteBindingsFromArchive(options.sourceArchive, options.repo);
  const currentSuites = await runtimeSuiteBindingsFromDirectory(options.repo);
  if (runtimeSuites.some((suite, index) =>
    suite.sourceSha256 !== currentSuites[index].sourceSha256
    || suite.executedPath !== currentSuites[index].executedPath
  )) {
    throw new ReleaseInputError("runtime suite source differs from prepared source archive");
  }
  return {
    runtimeSuites,
    preparedBuild: {
      receiptSha256: verified.receiptSha256,
      buildDigest: verified.receipt.buildDigest,
      artifactCount: verified.artifactCount,
      sourceArchiveSha256: verified.sourceArchiveSha256,
    },
  };
}
