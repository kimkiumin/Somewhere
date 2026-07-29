import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PREPARED_VISUAL_IDS } from "../../qa/browser/v2/prepared-evidence.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function createPreparedFixture() {
  const repo = await mkdtemp(path.join(os.tmpdir(), "somewhere-v2-prepared-repo."));
  const finalRoot = await mkdtemp(path.join(os.tmpdir(), "somewhere-v2-final."));
  const outputDir = path.join(finalRoot, "F3", "manual-browser");
  const output = path.join(outputDir, "collection.json");
  const receiptPath = path.join(finalRoot, "prepared", "build-receipt.json");
  const index = Buffer.from("<main>prepared</main>\n");
  const artifactPath = "prepared/build/app/dist/index.html";
  await writeFile(path.join(repo, ".gitignore"), "app/dist/\n");
  await writeFile(path.join(repo, "source.ts"), "export const prepared = true;\n");
  spawnSync("git", ["-C", repo, "init"]);
  spawnSync("git", ["-C", repo, "add", "."]);
  spawnSync("git", [
    "-C",
    repo,
    "-c",
    "user.name=Somewhere Test",
    "-c",
    "user.email=test@somewhere.invalid",
    "commit",
    "-m",
    "fixture",
  ]);
  const sha = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim();
  const tree = spawnSync("git", ["-C", repo, "rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).stdout.trim();
  const artifact = {
    bytes: index.length,
    kind: "app-asset",
    path: artifactPath,
    sha256: sha256(index),
  };
  const buildDigest = sha256(
    Buffer.from(`${artifact.sha256}\t${artifact.bytes}\t${artifact.path}\0`),
  );
  await mkdir(path.join(finalRoot, "prepared", "build", "app", "dist"), { recursive: true });
  await writeFile(path.join(finalRoot, artifactPath), index);
  await writeFile(
    receiptPath,
    `${JSON.stringify({
      artifacts: [artifact],
      buildDigest,
      builtAt: new Date().toISOString(),
      commands: [],
      config: {},
      entrypoint: "server/src/index.ts",
      finalSha: sha,
      policy: { kind: "test", path: "policy.json", sha256: sha256(Buffer.from("policy")) },
      schemaVersion: 2,
      sourceTree: tree,
      tools: {},
    })}\n`,
  );
  return { buildDigest, finalRoot, index, output, outputDir, receiptPath, repo, sha, tree };
}

export async function fakePreparedBrowser(outputDir: string) {
  await mkdir(path.join(outputDir, "visual"), { recursive: true });
  for (const id of PREPARED_VISUAL_IDS) {
    await writeFile(path.join(outputDir, "visual", `${id}.png`), PNG);
  }
  for (let trace = 0; trace < 8; trace += 1) {
    const directory = path.join(outputDir, "playwright-output", `trace-${trace}`);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "trace.zip"), `trace-${trace}`);
  }
  await writeFile(
    path.join(outputDir, "playwright-results.json"),
    JSON.stringify({ stats: { expected: 8, unexpected: 0 } }),
  );
  await writeFile(path.join(outputDir, "visual-metadata.json"), JSON.stringify({}));
  return { status: 0, stderr: "", stdout: "8 passed" };
}
