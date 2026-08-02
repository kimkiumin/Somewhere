import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { writeBuildReceipt } from "../../../scripts/release/write-v2-build-receipt.mjs";

function git(repo: string, args: readonly string[]): void {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new TypeError(result.stderr.trim());
}

async function fixture() {
  const repo = await mkdtemp(path.join(os.tmpdir(), "somewhere-v2-emission."));
  const output = path.join(`${repo}-evidence`, "build-receipt.json");
  await mkdir(path.join(repo, "app", "dist"), { recursive: true });
  await writeFile(path.join(repo, ".gitignore"), "app/dist/\n");
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
  return { output, repo };
}

describe("V2 receipt emission", () => {
  test.each([
    [
      "staged",
      async (repo: string) => {
        await writeFile(path.join(repo, "source.ts"), "export const value = 2;\n");
        git(repo, ["add", "source.ts"]);
      },
      "DIRTY_STAGED_SOURCE",
    ],
    [
      "unstaged",
      async (repo: string) => {
        await writeFile(path.join(repo, "source.ts"), "export const value = 2;\n");
      },
      "DIRTY_UNSTAGED_SOURCE",
    ],
    [
      "untracked",
      async (repo: string) => {
        await writeFile(path.join(repo, "added.ts"), "export const added = true;\n");
      },
      "DIRTY_UNTRACKED_SOURCE",
    ],
  ] as const)("rejects a %s source race", async (_, mutate, reason) => {
    const { output, repo } = await fixture();
    try {
      // Given: a clean exact source snapshot has already been hashed for a receipt.

      // When: source becomes dirty immediately before receipt emission.
      const result = writeBuildReceipt({
        beforeEmit: () => mutate(repo),
        output,
        repo,
      });

      // Then: no PASS receipt is emitted for any dirty-source class.
      await expect(result).rejects.toThrow(reason);
      await expect(access(output)).rejects.toThrow();
    } finally {
      await rm(repo, { force: true, recursive: true });
      await rm(path.dirname(output), { force: true, recursive: true });
    }
  });
});
