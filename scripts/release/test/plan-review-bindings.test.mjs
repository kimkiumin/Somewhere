import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectPlanReviewBindings } from "../lib/plan-review-bindings.mjs";
import { removeTemporaryDirectory, temporaryDirectory, writeJson } from "./release-testkit.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Plan review raw evidence bindings", () => {
  test("expands referenced transcripts and digest-bound companion receipts", async () => {
    const root = await temporaryDirectory("plan-review-bindings");
    try {
      const evidence = resolve(root, "evidence");
      const repo = resolve(root, "repo");
      const task = resolve(evidence, "task-19");
      await mkdir(task, { recursive: true });
      await mkdir(repo, { recursive: true });
      const raw = Buffer.from("exact raw transcript\n");
      await writeFile(resolve(task, "raw.log"), raw);
      await writeFile(resolve(task, "unreferenced.txt"), "must not be swept in\n");
      const anchor = resolve(task, "EVIDENCE.md");
      await writeFile(anchor, "# Evidence\n\n- Artifacts: `raw.log`, `command-receipt.json`, `manifest.sha256`\n");
      await writeJson(resolve(task, "command-receipt.json"), {
        artifacts: [{
          path: "task-19/raw.log",
          sha256: sha256(raw),
          bytes: raw.byteLength,
        }],
      });
      await writeFile(
        resolve(task, "manifest.sha256"),
        `${sha256(raw)}  ${resolve(task, "raw.log")}\n`,
      );

      const bindings = await collectPlanReviewBindings({
        anchors: [anchor],
        evidenceRoot: evidence,
        repo,
      });
      const paths = bindings.map((binding) => binding.path);
      expect(paths).toContain(anchor);
      expect(paths).toContain(resolve(task, "raw.log"));
      expect(paths).toContain(resolve(task, "command-receipt.json"));
      expect(paths).toContain(resolve(task, "manifest.sha256"));
      expect(paths).not.toContain(resolve(task, "unreferenced.txt"));
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a companion receipt whose raw artifact digest is forged", async () => {
    const root = await temporaryDirectory("plan-review-binding-forgery");
    try {
      const evidence = resolve(root, "evidence");
      const repo = resolve(root, "repo");
      const task = resolve(evidence, "task-3");
      await mkdir(task, { recursive: true });
      await mkdir(repo, { recursive: true });
      const anchor = resolve(task, "EvidenceEnvelopeV1.json");
      await writeFile(resolve(task, "raw.log"), "actual\n");
      await writeJson(anchor, {
        artifacts: [{
          path: "task-3/raw.log",
          sha256: "0".repeat(64),
          bytes: 7,
        }],
      });

      await expect(collectPlanReviewBindings({
        anchors: [anchor],
        evidenceRoot: evidence,
        repo,
      })).rejects.toThrow("plan review evidence digest mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("does not bind ambient repository or external files", async () => {
    const root = await temporaryDirectory("plan-review-binding-boundary");
    try {
      const evidence = resolve(root, "evidence");
      const repo = resolve(root, "repo");
      const task = resolve(evidence, "task-4");
      await mkdir(task, { recursive: true });
      await mkdir(repo, { recursive: true });
      const repoArtifact = resolve(repo, "ambient.log");
      const externalArtifact = resolve(root, "external.log");
      await writeFile(repoArtifact, "ambient repository output\n");
      await writeFile(externalArtifact, "ambient external output\n");
      const anchor = resolve(task, "EVIDENCE.md");
      await writeFile(
        anchor,
        `# Evidence\n\n- Artifacts: \`${repoArtifact}\`, \`${externalArtifact}\`\n`,
      );

      const bindings = await collectPlanReviewBindings({
        anchors: [anchor],
        evidenceRoot: evidence,
        repo,
      });
      expect(bindings.map((binding) => binding.path)).toEqual([anchor]);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a referenced symbolic link instead of silently omitting it", async () => {
    const root = await temporaryDirectory("plan-review-binding-symlink");
    try {
      const evidence = resolve(root, "evidence");
      const repo = resolve(root, "repo");
      const task = resolve(evidence, "task-5");
      await mkdir(task, { recursive: true });
      await mkdir(repo, { recursive: true });
      await writeFile(resolve(task, "raw.log"), "raw evidence\n");
      await symlink("raw.log", resolve(task, "linked.log"));
      const anchor = resolve(task, "EVIDENCE.md");
      await writeFile(anchor, "# Evidence\n\n- Artifact: `linked.log`\n");

      await expect(collectPlanReviewBindings({
        anchors: [anchor],
        evidenceRoot: evidence,
        repo,
      })).rejects.toThrow("plan review reference must not be a symbolic link");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
