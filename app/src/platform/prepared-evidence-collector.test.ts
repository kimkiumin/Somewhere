import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { collectManualPreparedEvidence as collectPreparedEvidence } from "../../qa/browser/v2/collect-manual-evidence.mjs";
import { PREPARED_VISUAL_IDS } from "../../qa/browser/v2/prepared-evidence.mjs";
import { validateManualPreparedEvidence as validatePreparedEvidence } from "../../qa/browser/v2/validate-manual-evidence.mjs";
import {
  createPreparedFixture,
  fakePreparedBrowser,
  preparedAccessibilityObservation,
} from "./prepared-evidence-test-fixture";

describe("prepared-build manual evidence collector", () => {
  test("collects from the supplied build and server without mutating the repository", async () => {
    const item = await createPreparedFixture();
    try {
      // Given: an exact clean commit, prepared receipt, and matching served app assets.
      const before = await readFile(path.join(item.repo, "source.ts"), "utf8");

      // When: prepared mode uses injected read-only browser and asset transports.
      const collection = await collectPreparedEvidence(
        {
          baseUrl: "https://127.0.0.1:8788/",
          buildReceipt: item.receiptPath,
          output: item.output,
          outputDir: item.outputDir,
          repo: item.repo,
          sha: item.sha,
          sourceTree: item.tree,
          viewports: "320,390,430,wide",
        },
        {
          fetchServed: async () => item.index,
          runBrowser: () => fakePreparedBrowser(item.outputDir),
        },
      );

      // Then: exact prepared provenance passes and no source or app/dist output is written.
      expect(collection).toMatchObject({
        buildDigest: item.buildDigest,
        observations: {
          accessibility: preparedAccessibilityObservation(),
        },
        sourceSha: item.sha,
        sourceTree: item.tree,
        verdict: "PASS",
      });
      expect(
        collection.artifacts.filter((artifact: { path: string }) =>
          artifact.path.startsWith("accessibility/"),
        ),
      ).toHaveLength(8);
      expect(await readFile(path.join(item.repo, "source.ts"), "utf8")).toBe(before);
      await expect(readFile(path.join(item.repo, "app", "dist", "index.html"))).rejects.toThrow();
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });

  test.each([
    ["sha", { sha: "0".repeat(40) }, "FOREIGN_SHA"],
    ["tree", { sourceTree: "0".repeat(40) }, "FOREIGN_TREE"],
    ["base URL", { baseUrl: "http://127.0.0.1:8788/" }, "INVALID_BASE_URL"],
  ])("rejects a foreign %s", async (_, override, reason) => {
    const item = await createPreparedFixture();
    try {
      await expect(
        collectPreparedEvidence({
          baseUrl: "https://127.0.0.1:8788/",
          buildReceipt: item.receiptPath,
          output: item.output,
          outputDir: item.outputDir,
          repo: item.repo,
          sha: item.sha,
          sourceTree: item.tree,
          viewports: "320,390,430,wide",
          ...override,
        }),
      ).rejects.toThrow(reason);
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });

  test("rejects a foreign build receipt and served bundle", async () => {
    const item = await createPreparedFixture();
    try {
      await writeFile(
        path.join(item.finalRoot, "prepared", "build", "app", "dist", "index.html"),
        "foreign",
      );
      await expect(
        collectPreparedEvidence({
          baseUrl: "https://127.0.0.1:8788/",
          buildReceipt: item.receiptPath,
          output: item.output,
          outputDir: item.outputDir,
          repo: item.repo,
          sha: item.sha,
          sourceTree: item.tree,
          viewports: "320,390,430,wide",
        }),
      ).rejects.toThrow("FOREIGN_BUILD_RECEIPT");
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });

  test("rejects a foreign served base URL and stale receipt", async () => {
    const item = await createPreparedFixture();
    try {
      const options = {
        baseUrl: "https://127.0.0.1:8788/",
        buildReceipt: item.receiptPath,
        output: item.output,
        outputDir: item.outputDir,
        repo: item.repo,
        sha: item.sha,
        sourceTree: item.tree,
        viewports: "320,390,430,wide",
      };
      await expect(
        collectPreparedEvidence(options, {
          fetchServed: async () => Buffer.from("foreign"),
        }),
      ).rejects.toThrow("FOREIGN_BASE_URL");
      const receipt = JSON.parse(await readFile(item.receiptPath, "utf8"));
      receipt.builtAt = "2020-01-01T00:00:00.000Z";
      await writeFile(item.receiptPath, JSON.stringify(receipt));
      await expect(collectPreparedEvidence(options)).rejects.toThrow("STALE_BUILD_RECEIPT");
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });

  test("validates exact prepared evidence and emits FAIL after artifact tampering", async () => {
    const item = await createPreparedFixture();
    const verdict = path.join(item.finalRoot, "F3", "manual-browser-verdict.json");
    try {
      // Given: a complete prepared collection bound to its receipt and clean source.
      await collectPreparedEvidence(
        {
          baseUrl: "https://127.0.0.1:8788/",
          buildReceipt: item.receiptPath,
          output: item.output,
          outputDir: item.outputDir,
          repo: item.repo,
          sha: item.sha,
          sourceTree: item.tree,
          viewports: "320,390,430,wide",
        },
        {
          fetchServed: async () => item.index,
          runBrowser: () => fakePreparedBrowser(item.outputDir),
        },
      );
      const options = {
        buildReceipt: item.receiptPath,
        input: item.outputDir,
        output: verdict,
        repo: item.repo,
        sha: item.sha,
      };

      // When: the validator checks the exact collection, then a governed PNG is changed.
      const pass = await validatePreparedEvidence(options);
      await writeFile(
        path.join(item.outputDir, "visual", `${PREPARED_VISUAL_IDS[0]}.png`),
        "tampered",
      );
      const failure = validatePreparedEvidence(options);

      // Then: the exact set passes once, while tampering is nonzero-equivalent with FAIL output.
      expect(pass).toMatchObject({
        accessibilityProjects: ["chromium-mobile", "webkit-mobile"],
        artifactCount: 49,
        gate: "PASS",
        servedArtifactCount: 1,
      });
      await expect(failure).rejects.toThrow("ARTIFACT_MISMATCH");
      expect(JSON.parse(await readFile(verdict, "utf8"))).toMatchObject({ gate: "FAIL" });
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });

  test.each([
    ["200 percent text", "textResize200"],
    ["visible keyboard focus", "keyboardFocus"],
    ["reduced motion", "reducedMotion"],
  ] as const)("fails closed when %s evidence is omitted", async (_, criterion) => {
    const item = await createPreparedFixture();
    const verdict = path.join(item.finalRoot, "F3", "manual-browser-verdict.json");
    try {
      // Given: a collection whose governed artifacts and accessibility reports are otherwise complete.
      const collection = await collectPreparedEvidence(
        {
          baseUrl: "https://127.0.0.1:8788/",
          buildReceipt: item.receiptPath,
          output: item.output,
          outputDir: item.outputDir,
          repo: item.repo,
          sha: item.sha,
          sourceTree: item.tree,
          viewports: "320,390,430,wide",
        },
        {
          fetchServed: async () => item.index,
          runBrowser: () => fakePreparedBrowser(item.outputDir),
        },
      );
      for (const report of Object.values(collection.observations.accessibility)) {
        delete report[criterion];
      }
      await writeFile(item.output, `${JSON.stringify(collection, null, 2)}\n`);

      // When: validation consumes a collection missing one required exercised criterion.
      const validation = validatePreparedEvidence({
        buildReceipt: item.receiptPath,
        input: item.outputDir,
        output: verdict,
        repo: item.repo,
        sha: item.sha,
      });

      // Then: the release boundary rejects it and persists a machine-readable FAIL.
      await expect(validation).rejects.toThrow("INCOMPLETE_ACCESSIBILITY_EVIDENCE");
      expect(JSON.parse(await readFile(verdict, "utf8"))).toMatchObject({ gate: "FAIL" });
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });

  test("fails closed when a governed accessibility artifact is omitted", async () => {
    const item = await createPreparedFixture();
    const verdict = path.join(item.finalRoot, "F3", "manual-browser-verdict.json");
    try {
      // Given: complete observations whose governed artifact set omits the focus screenshot.
      const collection = await collectPreparedEvidence(
        {
          baseUrl: "https://127.0.0.1:8788/",
          buildReceipt: item.receiptPath,
          output: item.output,
          outputDir: item.outputDir,
          repo: item.repo,
          sha: item.sha,
          sourceTree: item.tree,
          viewports: "320,390,430,wide",
        },
        {
          fetchServed: async () => item.index,
          runBrowser: () => fakePreparedBrowser(item.outputDir),
        },
      );
      collection.artifacts = collection.artifacts.filter(
        (artifact) => artifact.path !== "accessibility/chromium-mobile-keyboard-focus.png",
      );
      await writeFile(item.output, `${JSON.stringify(collection, null, 2)}\n`);

      // When: validation consumes the incomplete artifact set.
      const validation = validatePreparedEvidence({
        buildReceipt: item.receiptPath,
        input: item.outputDir,
        output: verdict,
        repo: item.repo,
        sha: item.sha,
      });

      // Then: missing visual proof fails closed.
      await expect(validation).rejects.toThrow("INCOMPLETE_ACCESSIBILITY_ARTIFACTS");
      expect(JSON.parse(await readFile(verdict, "utf8"))).toMatchObject({ gate: "FAIL" });
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });

  test("removes the base PASS collection when browser accessibility proof is incomplete", async () => {
    const item = await createPreparedFixture();
    try {
      // Given: the real browser run succeeds but omits one required accessibility screenshot.
      const collection = collectPreparedEvidence(
        {
          baseUrl: "https://127.0.0.1:8788/",
          buildReceipt: item.receiptPath,
          output: item.output,
          outputDir: item.outputDir,
          repo: item.repo,
          sha: item.sha,
          sourceTree: item.tree,
          viewports: "320,390,430,wide",
        },
        {
          fetchServed: async () => item.index,
          runBrowser: async () => {
            const result = await fakePreparedBrowser(item.outputDir);
            await rm(
              path.join(item.outputDir, "accessibility", "chromium-mobile-keyboard-focus.png"),
            );
            return result;
          },
        },
      );

      // When: collector binding detects the incomplete governed proof.

      // Then: collection fails and no earlier base PASS remains consumable.
      await expect(collection).rejects.toThrow("INCOMPLETE_ACCESSIBILITY_ARTIFACTS");
      await expect(readFile(item.output)).rejects.toThrow();
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });

  test.each([
    [
      "staged",
      async (repo: string) => {
        await writeFile(path.join(repo, "source.ts"), "export const prepared = false;\n");
        spawnSync("git", ["-C", repo, "add", "source.ts"]);
      },
      "DIRTY_STAGED_SOURCE",
    ],
    [
      "unstaged",
      (repo: string) => writeFile(path.join(repo, "source.ts"), "export const prepared = false;\n"),
      "DIRTY_UNSTAGED_SOURCE",
    ],
    [
      "untracked",
      (repo: string) => writeFile(path.join(repo, "added.ts"), "export const added = true;\n"),
      "DIRTY_UNTRACKED_SOURCE",
    ],
  ] as const)("rejects a %s source race before collection emission", async (_, mutate, reason) => {
    const item = await createPreparedFixture();
    try {
      // Given: prepared evidence has passed receipt, served-asset, and browser checks.
      const collection = collectPreparedEvidence(
        {
          baseUrl: "https://127.0.0.1:8788/",
          buildReceipt: item.receiptPath,
          output: item.output,
          outputDir: item.outputDir,
          repo: item.repo,
          sha: item.sha,
          sourceTree: item.tree,
          viewports: "320,390,430,wide",
        },
        {
          beforeEmit: () => mutate(item.repo),
          fetchServed: async () => item.index,
          runBrowser: () => fakePreparedBrowser(item.outputDir),
        },
      );

      // When: source changes after collection but before PASS emission.

      // Then: every dirty class fails closed and leaves no PASS collection.
      await expect(collection).rejects.toThrow(reason);
      await expect(readFile(item.output)).rejects.toThrow();
    } finally {
      await rm(item.repo, { force: true, recursive: true });
      await rm(item.finalRoot, { force: true, recursive: true });
    }
  });
});
