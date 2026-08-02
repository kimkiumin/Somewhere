import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");

type Fixture = Readonly<{
  evidence: string;
  repo: string;
  sha: string;
  tree: string;
}>;

async function createFixture(): Promise<Fixture> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "somewhere-v2-clean-source."));
  const evidence = `${repo}-evidence`;
  await mkdir(path.join(repo, "app", "dist"), { recursive: true });
  await writeFile(path.join(repo, ".gitignore"), "app/dist/\n.wrangler/\n");
  await writeFile(path.join(repo, "source.ts"), "export const value = 1;\n");
  await writeFile(path.join(repo, "app", "dist", "index.html"), "<main>generated</main>\n");
  git(repo, ["init"]);
  git(repo, ["add", ".gitignore", "source.ts"]);
  git(repo, [
    "-c",
    "user.name=Somewhere Test",
    "-c",
    "user.email=test@somewhere.invalid",
    "commit",
    "-m",
    "fixture",
  ]);
  return {
    evidence,
    repo,
    sha: git(repo, ["rev-parse", "HEAD"]),
    tree: git(repo, ["rev-parse", "HEAD^{tree}"]),
  };
}

function git(repo: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new TypeError(result.stderr.trim());
  return result.stdout.trim();
}

function guardedCommands(fixture: Fixture): readonly (readonly string[])[] {
  return [
    [
      path.join(PROJECT_ROOT, "scripts/release/write-v2-build-receipt.mjs"),
      fixture.repo,
      fixture.evidence,
    ],
    [
      path.join(PROJECT_ROOT, "app/qa/browser/v2/collect-manual-evidence.mjs"),
      "--repo",
      fixture.repo,
      "--evidence",
      fixture.evidence,
      "--expected-sha",
      fixture.sha,
    ],
    [
      path.join(PROJECT_ROOT, "app/qa/browser/v2/validate-manual-evidence.mjs"),
      "--manifest",
      path.join(fixture.evidence, "missing-manifest.json"),
      "--expected-sha",
      fixture.sha,
      "--expected-tree",
      fixture.tree,
      "--repo",
      fixture.repo,
    ],
  ];
}

async function expectDirtySourceRejected(
  mutate: (fixture: Fixture) => Promise<void>,
  reason: string,
): Promise<void> {
  const fixture = await createFixture();
  try {
    // Given: a committed source with ignored generated app/dist output.
    await mutate(fixture);

    // When: every evidence-certification entrypoint runs against the dirty source.
    const results = guardedCommands(fixture).map((args) =>
      spawnSync("bun", args, { encoding: "utf8" }),
    );

    // Then: each entrypoint rejects the same dirty-source class before doing its work.
    expect(results.map((result) => result.status)).toEqual([1, 1, 1]);
    expect(results.map((result) => result.stderr)).toEqual([
      expect.stringContaining(reason),
      expect.stringContaining(reason),
      expect.stringContaining(reason),
    ]);
  } finally {
    await rm(fixture.repo, { force: true, recursive: true });
    await rm(fixture.evidence, { force: true, recursive: true });
  }
}

describe("V2 evidence source cleanliness", () => {
  test("classifies Wrangler runtime bundles as ignored generated output", async () => {
    const fixture = await createFixture();
    try {
      // Given: an active prepared Worker generates its local bundle below server/.wrangler.

      // When: Git classifies the runtime bundle path without requiring the file to exist.
      const result = spawnSync(
        "git",
        [
          "-C",
          fixture.repo,
          "check-ignore",
          "--quiet",
          "--no-index",
          "server/.wrangler/tmp/dev/index.js",
        ],
        { encoding: "utf8" },
      );

      // Then: runtime output cannot false-block provenance while arbitrary untracked source still does.
      expect(result.status).toBe(0);
    } finally {
      await rm(fixture.repo, { force: true, recursive: true });
      await rm(fixture.evidence, { force: true, recursive: true });
    }
  });

  test("allows ignored generated production output", async () => {
    const fixture = await createFixture();
    try {
      // Given: a clean commit whose generated app/dist remains ignored.

      // When: the pre-build cleanliness guard runs.
      const result = spawnSync(
        "bun",
        [
          path.join(PROJECT_ROOT, "scripts/release/write-v2-build-receipt.mjs"),
          fixture.repo,
          "--check-only",
        ],
        { encoding: "utf8" },
      );

      // Then: ignored output does not make the committed source appear dirty.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("PASS clean source");
    } finally {
      await rm(fixture.repo, { force: true, recursive: true });
      await rm(fixture.evidence, { force: true, recursive: true });
    }
  });

  test("rejects staged source changes before certification", async () => {
    await expectDirtySourceRejected(async (fixture) => {
      await writeFile(path.join(fixture.repo, "source.ts"), "export const value = 2;\n");
      git(fixture.repo, ["add", "source.ts"]);
    }, "DIRTY_STAGED_SOURCE");
  });

  test("rejects unstaged source changes before certification", async () => {
    await expectDirtySourceRejected(async (fixture) => {
      await writeFile(path.join(fixture.repo, "source.ts"), "export const value = 2;\n");
    }, "DIRTY_UNSTAGED_SOURCE");
  });

  test("rejects relevant untracked source before certification", async () => {
    await expectDirtySourceRejected(async (fixture) => {
      await writeFile(
        path.join(fixture.repo, "untracked-source.ts"),
        "export const added = true;\n",
      );
    }, "DIRTY_UNTRACKED_SOURCE");
  });
});
