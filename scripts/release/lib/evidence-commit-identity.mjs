import {
  ReleaseInputError,
  git,
  run,
} from "./release-core.mjs";

async function stablePatchId(repo, commit) {
  const patch = await run([
    "git",
    "-C",
    repo,
    "show",
    "--format=",
    "--no-ext-diff",
    "--binary",
    commit,
  ], { cwd: repo, env: process.env });
  if (patch.exitCode !== 0) {
    throw new ReleaseInputError("evidence identity commit is not readable");
  }
  const result = await run(["git", "patch-id", "--stable"], {
    cwd: repo,
    env: process.env,
    input: patch.stdout,
  });
  const match = /^([a-f0-9]{40})\s/u.exec(result.stdout.toString());
  if (result.exitCode !== 0 || match === null) {
    throw new ReleaseInputError("evidence identity patch could not be calculated");
  }
  return match[1];
}

export async function verifyPatchEquivalentEvidenceIdentity({
  repo,
  evidenceSnapshot,
  commitField,
  landedCommitSha,
}) {
  let evidenceDocument;
  try {
    evidenceDocument = JSON.parse(evidenceSnapshot.data.toString());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ReleaseInputError("evidence identity is not valid JSON");
    }
    throw error;
  }
  const reviewedCommitSha = evidenceDocument[commitField];
  if (typeof reviewedCommitSha !== "string" || !/^[a-f0-9]{40}$/u.test(reviewedCommitSha)) {
    throw new ReleaseInputError("evidence identity commit is invalid");
  }
  const [reviewedTree, landedTree, reviewedPatchId, landedPatchId] = await Promise.all([
    git(repo, ["rev-parse", `${reviewedCommitSha}^{tree}`]),
    git(repo, ["rev-parse", `${landedCommitSha}^{tree}`]),
    stablePatchId(repo, reviewedCommitSha),
    stablePatchId(repo, landedCommitSha),
  ]);
  if (reviewedPatchId !== landedPatchId) {
    throw new ReleaseInputError("evidence identity patch does not match the landed commit");
  }
  return {
    mode: "PATCH_EQUIVALENT",
    reviewedCommitSha,
    reviewedTree,
    landedCommitSha,
    landedTree,
    stablePatchId: reviewedPatchId,
  };
}
