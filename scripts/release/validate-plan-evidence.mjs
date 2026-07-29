import { resolve } from "node:path";
import { access } from "node:fs/promises";
import {
  digestFile,
  git,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  readJson,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: [
    "--plan",
    "--plan-sha256",
    "--criteria",
    "--evidence",
    "--sha",
    "--source-tree",
    "--policy-sha256",
    "--require-todos",
    "--output",
  ],
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
  normalizeDigest(options["policy-sha256"]);
  const criteria = await readJson(resolve(options.criteria));
  if (criteria.schemaVersion !== 1 || !Array.isArray(criteria.todos)) {
    throw new TypeError("invalid plan criteria registry");
  }
  const expectedIds = Array.from({ length: 22 }, (_, index) => index + 1);
  const observedIds = criteria.todos.map((todo) => todo.id);
  if (JSON.stringify(observedIds) !== JSON.stringify(expectedIds) || options["require-todos"] !== "1-22") {
    throw new TypeError("criteria must contain exact ordered Todos 1-22");
  }
  const planText = await Bun.file(planPath).text();
  const planIds = [...planText.matchAll(/^- \[ \] ([0-9]+)\./gm)].map((match) => Number(match[1]));
  if (JSON.stringify(planIds) !== JSON.stringify(expectedIds)) throw new TypeError("plan Todo set mismatch");
  const subjects = new Set((await git(repo, ["log", "--format=%s", options.sha])).split("\n"));
  const evidenceRoot = resolve(options.evidence);
  const missing = [];
  for (const todo of criteria.todos) {
    if (!subjects.has(todo.subject)) {
      missing.push({ id: todo.id, reason: "COMMIT_SUBJECT_ABSENT" });
      continue;
    }
    const candidates = todo.evidenceAny.map((path) => [resolve(evidenceRoot, path), resolve(repo, path)]).flat();
    if (!(await Promise.all(candidates.map(exists))).some(Boolean)) {
      missing.push({ id: todo.id, reason: "EVIDENCE_ABSENT" });
    }
  }
  const gate = missing.length === 0 ? "PASS" : "BLOCK";
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate,
    finalSha: options.sha,
    sourceTree: options["source-tree"],
    reviewedPlanSha256: normalizeDigest(options["plan-sha256"]),
    policySha256: normalizeDigest(options["policy-sha256"]),
    todoCount: criteria.todos.length,
    missing,
  });
  if (gate === "BLOCK") process.exitCode = 2;
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed), parsed.output);
