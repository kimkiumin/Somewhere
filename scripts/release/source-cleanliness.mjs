import { spawnSync } from "node:child_process";

function git(repo, values) {
  return spawnSync("git", ["-C", repo, ...values], { encoding: "utf8" });
}

function requireCleanDiff(repo, values, reason) {
  const result = git(repo, values);
  if (result.status === 1) throw new TypeError(reason);
  if (result.status !== 0) throw new TypeError(result.stderr.trim());
}

export function assertCleanSource(repo) {
  requireCleanDiff(repo, ["diff", "--cached", "--quiet", "--exit-code", "HEAD", "--"], "DIRTY_STAGED_SOURCE");
  requireCleanDiff(repo, ["diff", "--quiet", "--exit-code", "--"], "DIRTY_UNSTAGED_SOURCE");
  const untracked = git(repo, ["ls-files", "--others", "--exclude-standard"]);
  if (untracked.status !== 0) throw new TypeError(untracked.stderr.trim());
  if (untracked.stdout.trim() !== "") throw new TypeError("DIRTY_UNTRACKED_SOURCE");
}

function revision(repo, value) {
  const result = git(repo, ["rev-parse", value]);
  if (result.status !== 0) throw new TypeError(result.stderr.trim());
  return result.stdout.trim();
}

export function captureCleanSource(repo) {
  assertCleanSource(repo);
  return {
    sha: revision(repo, "HEAD"),
    tree: revision(repo, "HEAD^{tree}"),
  };
}

export function assertSameCleanSource(repo, expected) {
  assertCleanSource(repo);
  if (revision(repo, "HEAD") !== expected.sha) throw new TypeError("FOREIGN_SHA");
  if (revision(repo, "HEAD^{tree}") !== expected.tree) throw new TypeError("FOREIGN_TREE");
}
