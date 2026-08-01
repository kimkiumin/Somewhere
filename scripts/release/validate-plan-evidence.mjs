import { resolve } from "node:path";
import {
  digestFile,
  git,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  readJson,
  snapshotRegularFile,
  writeJson,
} from "./lib/release-core.mjs";
import { verifyPatchEquivalentEvidenceIdentity } from "./lib/evidence-commit-identity.mjs";
import { collectPlanReviewBindings } from "./lib/plan-review-bindings.mjs";

const specification = {
  required: [
    "--plan",
    "--plan-sha256",
    "--criteria",
    "--evidence",
    "--sha",
    "--source-tree",
    "--policy",
    "--policy-sha256",
    "--require-todos",
    "--output",
  ],
};

async function snapshotIfPresent(path) {
  try {
    return await snapshotRegularFile(path, "plan evidence");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function validate(options) {
  const repo = resolve(".");
  const planPath = resolve(options.plan);
  if (await digestFile(planPath) !== normalizeDigest(options["plan-sha256"])) {
    throw new TypeError("reviewed plan digest mismatch");
  }
  if (
    await git(repo, ["rev-parse", "HEAD"]) !== options.sha
    || await git(repo, ["rev-parse", "HEAD^{tree}"]) !== options["source-tree"]
  ) {
    throw new TypeError("plan evidence source identity mismatch");
  }
  const policyPath = resolve(options.policy);
  const policySnapshot = await snapshotRegularFile(policyPath, "selected navigation policy");
  if (policySnapshot.sha256 !== normalizeDigest(options["policy-sha256"])) {
    throw new TypeError("selected navigation policy digest mismatch");
  }
  const criteria = await readJson(resolve(options.criteria));
  if (criteria.schemaVersion !== 1 || !Array.isArray(criteria.todos)) {
    throw new TypeError("invalid plan criteria registry");
  }
  const expectedIds = Array.from({ length: 22 }, (_, index) => index + 1);
  const observedIds = criteria.todos.map((todo) => todo.id);
  if (JSON.stringify(observedIds) !== JSON.stringify(expectedIds) || options["require-todos"] !== "1-22") {
    throw new TypeError("criteria must contain exact ordered Todos 1-22");
  }
  for (const todo of criteria.todos) {
    if (
      !Array.isArray(todo.dependsOn)
      || new Set(todo.dependsOn).size !== todo.dependsOn.length
      || todo.dependsOn.some((id) => !expectedIds.includes(id) || id === todo.id)
      || (todo.reviewEvidence !== undefined && (
        !Array.isArray(todo.reviewEvidence)
        || new Set(todo.reviewEvidence).size !== todo.reviewEvidence.length
        || todo.reviewEvidence.some((path) =>
          typeof path !== "string"
          || path === ""
          || path.startsWith("/")
          || path.split("/").includes("..")
        )
      ))
      || (todo.evidenceIdentity !== undefined && (
        typeof todo.evidenceIdentity !== "object"
        || todo.evidenceIdentity === null
        || todo.evidenceIdentity.commitField !== "headSha"
        || todo.evidenceIdentity.mode !== "PATCH_EQUIVALENT"
      ))
    ) {
      throw new TypeError(`invalid plan criteria registry for Todo ${todo.id}`);
    }
  }
  const planText = await Bun.file(planPath).text();
  const planIds = [...planText.matchAll(/^- \[ \] ([0-9]+)\./gm)].map((match) => Number(match[1]));
  if (JSON.stringify(planIds) !== JSON.stringify(expectedIds)) throw new TypeError("plan Todo set mismatch");
  const history = (await git(repo, [
    "log",
    "--reverse",
    "--format=%H%x09%s",
    options.sha,
  ])).split("\n").filter(Boolean).map((line, index) => {
    const separator = line.indexOf("\t");
    return {
      sha: line.slice(0, separator),
      subject: line.slice(separator + 1),
      index,
    };
  });
  const evidenceRoot = resolve(options.evidence);
  const missing = [];
  const todos = [];
  const landedById = new Map(criteria.todos.map((todo) => [
    todo.id,
    history.find((entry) => entry.subject === todo.subject),
  ]));
  const [planSnapshot, criteriaSnapshot] = await Promise.all([
    snapshotRegularFile(planPath, "reviewed plan"),
    snapshotRegularFile(resolve(options.criteria), "plan criteria"),
  ]);
  const reviewBindings = [
    { path: planPath, sha256: planSnapshot.sha256 },
    { path: resolve(options.criteria), sha256: criteriaSnapshot.sha256 },
    { path: policyPath, sha256: policySnapshot.sha256 },
  ];
  for (const todo of criteria.todos) {
    const landed = landedById.get(todo.id);
    if (landed === undefined) {
      missing.push({ id: todo.id, reason: "COMMIT_SUBJECT_ABSENT" });
      continue;
    }
    if (todo.dependsOn.some((id) => {
      const dependency = landedById.get(id);
      return dependency === undefined || dependency.index >= landed.index;
    })) {
      missing.push({ id: todo.id, reason: "DEPENDENCY_ORDER_INVALID" });
      continue;
    }
    let evidence;
    let evidenceSnapshot;
    for (const relativePath of todo.evidenceAny) {
      for (const root of [evidenceRoot, repo]) {
        const path = resolve(root, relativePath);
        const snapshot = await snapshotIfPresent(path);
        if (snapshot !== undefined) {
          evidenceSnapshot = snapshot;
          evidence = {
            path,
            sha256: snapshot.sha256,
            bytes: snapshot.bytes,
          };
          break;
        }
      }
      if (evidence !== undefined) break;
    }
    if (evidence === undefined) {
      missing.push({ id: todo.id, reason: "EVIDENCE_ABSENT" });
      continue;
    }
    let evidenceIdentity;
    if (todo.evidenceIdentity !== undefined) {
      try {
        evidenceIdentity = await verifyPatchEquivalentEvidenceIdentity({
          repo,
          evidenceSnapshot,
          commitField: todo.evidenceIdentity.commitField,
          landedCommitSha: landed.sha,
        });
      } catch (error) {
        missing.push({
          id: todo.id,
          reason: "EVIDENCE_IDENTITY_INVALID",
          detail: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }
    todos.push({
      id: todo.id,
      subject: todo.subject,
      dependsOn: todo.dependsOn,
      landedCommitSha: landed.sha,
      historyIndex: landed.index,
      evidence,
      ...(evidenceIdentity === undefined ? {} : { evidenceIdentity }),
      reviewEvidence: [],
    });
    if (!reviewBindings.some((entry) => entry.path === evidence.path)) {
      reviewBindings.push({ path: evidence.path, sha256: evidence.sha256 });
    }
    for (const relativePath of todo.reviewEvidence ?? []) {
      let reviewEvidence;
      for (const root of [evidenceRoot, repo]) {
        const path = resolve(root, relativePath);
        const snapshot = await snapshotIfPresent(path);
        if (snapshot !== undefined) {
          reviewEvidence = { path, sha256: snapshot.sha256, bytes: snapshot.bytes };
          break;
        }
      }
      if (reviewEvidence === undefined) {
        missing.push({ id: todo.id, reason: "REVIEW_EVIDENCE_ABSENT", path: relativePath });
        continue;
      }
      todos.at(-1).reviewEvidence.push(reviewEvidence);
      if (!reviewBindings.some((entry) => entry.path === reviewEvidence.path)) {
        reviewBindings.push({ path: reviewEvidence.path, sha256: reviewEvidence.sha256 });
      }
    }
  }
  const expandedBindings = await collectPlanReviewBindings({
    anchors: todos.flatMap((todo) => [
      todo.evidence.path,
      ...todo.reviewEvidence.map((evidence) => evidence.path),
    ]),
    evidenceRoot,
    repo,
  });
  for (const binding of expandedBindings) {
    const existing = reviewBindings.find((entry) => entry.path === binding.path);
    if (existing !== undefined && existing.sha256 !== binding.sha256) {
      throw new TypeError(`plan review binding digest mismatch: ${binding.path}`);
    }
    if (existing === undefined) reviewBindings.push(binding);
  }
  const gate = missing.length === 0 ? "PASS" : "BLOCK";
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate,
    finalSha: options.sha,
    sourceTree: options["source-tree"],
    reviewedPlanSha256: normalizeDigest(options["plan-sha256"]),
    policySha256: normalizeDigest(options["policy-sha256"]),
    policy: {
      path: policyPath,
      sha256: policySnapshot.sha256,
      bytes: policySnapshot.bytes,
    },
    todoCount: criteria.todos.length,
    dependencyOrderVerified: gate === "PASS",
    rawReviewBindingCount: reviewBindings.length,
    todos,
    reviewBindings,
    missing,
  });
  if (gate === "BLOCK") process.exitCode = 2;
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed), parsed.output);
