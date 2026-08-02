import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runtimeSemanticFixture } from "./runtime-semantic-fixtures.mjs";

export const runtimePaths = [
  "app-build.txt",
  "async-do-runtime-report.json",
  "canary-scan.json",
  "export-restore.txt",
  "journey-do-runtime-report.json",
  "legal-gates.json",
  "live-cleanup-receipt.json",
  "live-custom-log.json",
  "live-d1.json",
  "live-dlq-delivery.txt",
  "live-dlq.txt",
  "live-do-fence-runtime.json",
  "live-do-namespaces.json",
  "live-do.json",
  "live-failure-cleanup-tests.txt",
  "live-hidden-lifecycle.txt",
  "live-http-schema.txt",
  "live-queue-attempts.txt",
  "live-queue-chain.json",
  "live-queue.txt",
  "live-runtime-state-files.txt",
  "live-scheduled-http.txt",
  "live-scheduled-state.json",
  "live-start-receipt.json",
  "live-worker-log.txt",
  "local-recovery-scope.json",
  "production-build.json",
  "rollback-dry-run.txt",
  "rollback-receipts.json",
  "summary.txt",
  "task14-tests.txt",
  "typecheck.txt",
  "wrangler-dry-run.txt",
  "write-fence-runtime-report.json",
];

export async function writeFixtureCommand(root) {
  const path = resolve(root, "write-runtime-fixture.mjs");
  await writeFile(path, `
    import { mkdir, symlink, writeFile } from "node:fs/promises";
    import { resolve } from "node:path";
    import { runtimePaths, runtimeSemanticFixture } from ${JSON.stringify(resolve(import.meta.dir, "runtime-semantic-fixture.mjs"))};
    const evidence = process.env.SOMEWHERE_OPS_EVIDENCE_DIR;
    const mode = process.env.RUNTIME_FIXTURE_MODE;
    const sourceRepo = ${JSON.stringify(resolve(import.meta.dir, "../../.."))};
    await mkdir(evidence, { recursive: true });
    const doFixture = structuredClone(runtimeSemanticFixture("live-do-fence-runtime.json"));
    const runtimeReports = new Map();
    for (const suite of doFixture.suites) {
      const report = structuredClone(runtimeSemanticFixture(suite.rawReport.path));
      report.testResults[0].name = resolve(process.cwd(), suite.path);
      const bytes = JSON.stringify(report);
      runtimeReports.set(suite.rawReport.path, bytes);
      suite.sourceSha256 = "sha256:" + new Bun.CryptoHasher("sha256")
        .update(await Bun.file(resolve(sourceRepo, suite.path)).arrayBuffer()).digest("hex");
      suite.rawReport.sha256 = "sha256:" + new Bun.CryptoHasher("sha256")
        .update(bytes).digest("hex");
    }
    for (const artifact of runtimePaths) {
      if (mode === "missing" && artifact === "live-d1.json") continue;
      const target = resolve(evidence, artifact);
      if (mode === "symlink" && artifact === "live-d1.json") {
        const outside = resolve(evidence, "..", "outside-live-d1.json");
        await writeFile(outside, "foreign\\n");
        await symlink(outside, target);
      } else if (runtimeReports.has(artifact)) {
        await writeFile(target, runtimeReports.get(artifact));
      } else if (artifact === "live-do-fence-runtime.json") {
        await writeFile(target, JSON.stringify(doFixture));
      } else if (runtimeSemanticFixture(artifact) !== undefined) {
        await writeFile(target, JSON.stringify(runtimeSemanticFixture(artifact)));
      } else if (artifact === "production-build.json") {
        if (process.env.SOMEWHERE_PREPARED_BUILD_RECEIPT) {
          const receiptBytes = await Bun.file(process.env.SOMEWHERE_PREPARED_BUILD_RECEIPT)
            .arrayBuffer();
          const sourceBytes = await Bun.file(process.env.SOMEWHERE_PREPARED_SOURCE_ARCHIVE)
            .arrayBuffer();
          const receipt = JSON.parse(new TextDecoder().decode(receiptBytes));
          await writeFile(target, JSON.stringify({
            schemaVersion: 1,
            artifactRole: "prepared-release-candidate-reference",
            sourceSha: process.env.SOMEWHERE_SOURCE_SHA,
            sourceTree: process.env.SOMEWHERE_SOURCE_TREE,
            preparedBuild: {
              receiptSha256: "sha256:" + new Bun.CryptoHasher("sha256")
                .update(receiptBytes).digest("hex"),
              buildDigest: receipt.buildDigest,
              artifactCount: receipt.artifacts.length,
            },
            sourceArchive: {
              sha256: "sha256:" + new Bun.CryptoHasher("sha256")
                .update(sourceBytes).digest("hex"),
            },
          }));
        } else {
          await writeFile(target, JSON.stringify({
            artifactRole: mode === "release-build-role"
              ? "release-candidate"
              : "local-diagnostic",
            sourceSha: process.env.SOMEWHERE_SOURCE_SHA ?? null,
            sourceTree: process.env.SOMEWHERE_SOURCE_TREE ?? null,
          }));
        }
      } else {
        await writeFile(target, \`runtime:\${artifact}\\n\`);
      }
    }
    console.log("fixture verify:v2 PASS");
  `);
  return path;
}
