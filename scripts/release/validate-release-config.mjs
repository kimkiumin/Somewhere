import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../..");
const release = resolve(repo, "scripts/release");
const schemaNames = [
  "exact-tree-receipt-v1.schema.json",
  "planned-tree-receipt-v1.schema.json",
  "command-receipt-v1.schema.json",
  "check-manifest-v1.schema.json",
  "lane-verdict-v1.schema.json",
  "preparation-receipt-v1.schema.json",
  "external-gates-v1.schema.json",
  "reviewer-verdict-v1.schema.json",
  "reviewer-output-v1.schema.json",
  "final-cleanup-v1.schema.json",
  "final-lane-commands-v1.schema.json",
  "final-verdict-v1.schema.json",
];
const profileNames = [
  "reviewer-profile-f1-plan-v1.json",
  "reviewer-profile-f2-code-v1.json",
  "reviewer-profile-f2-runtime-v1.json",
  "reviewer-profile-f2-security-v1.json",
  "reviewer-profile-f3-visual-v1.json",
  "reviewer-profile-f4-scope-v1.json",
];
const canonicalDocs = [
  "README.md",
  "DESIGN.md",
  "AGENTS.md",
  "docs/README.md",
  "docs/operations/v2-pilot-backend.md",
  "docs/operations/v2-release.md",
];

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function requireFile(path, label) {
  try {
    await access(path);
  } catch {
    throw new TypeError(`missing ${label}: ${path}`);
  }
}

async function validateMarkdownLinks(path) {
  const text = await readFile(path, "utf8");
  const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(?:https?:|#|mailto:)/.test(target));
  for (const target of links) {
    const withoutAnchor = target.split("#", 1)[0];
    if (withoutAnchor !== "") {
      await requireFile(resolve(dirname(path), withoutAnchor), `link from ${path}`);
    }
  }
  return links.length;
}

async function validate() {
  for (const name of schemaNames) {
    const schema = await json(resolve(release, name));
    if (
      schema.$schema !== "https://json-schema.org/draft/2020-12/schema"
      || typeof schema.$id !== "string"
      || schema.type !== "object"
      || schema.additionalProperties !== false
    ) {
      throw new TypeError(`invalid strict schema: ${name}`);
    }
  }
  for (const name of profileNames) {
    const profile = await json(resolve(release, name));
    if (
      profile.schemaVersion !== 1
      || profile.runner?.binary !== "codex2"
      || profile.runner?.version !== "codex-cli 0.145.0"
      || profile.runner?.sandbox !== "read-only"
      || profile.runner?.ephemeral !== true
      || profile.runner?.model !== "gpt-5.6-sol"
    ) {
      throw new TypeError(`unsafe reviewer profile: ${name}`);
    }
  }
  const commands = await json(resolve(release, "final-lane-commands-v1.json"));
  const checks = await json(resolve(release, "final-lane-checks-v1.json"));
  for (const lane of ["F1", "F2", "F3", "F4"]) {
    const checkValue = checks.lanes[lane];
    const expected = Array.isArray(checkValue)
      ? checkValue
      : [...checkValue.repository, ...checkValue.external];
    const observed = commands.lanes[lane].map((entry) => entry.id);
    if (JSON.stringify(observed) !== JSON.stringify(expected)) {
      throw new TypeError(`command/check mismatch: ${lane}`);
    }
    if (new Set(observed).size !== observed.length) throw new TypeError(`duplicate command: ${lane}`);
  }
  const authority = await json(resolve(repo, "docs/authority-map-v2.json"));
  for (const [name, path] of Object.entries(authority.canonical)) {
    await requireFile(resolve(repo, path), `canonical authority ${name}`);
  }
  let linkCount = 0;
  for (const path of canonicalDocs) linkCount += await validateMarkdownLinks(resolve(repo, path));
  return {
    schemaVersion: 1,
    gate: "PASS",
    schemas: schemaNames.length,
    profiles: profileNames.length,
    commands: Object.values(commands.lanes).reduce((count, entries) => count + entries.length, 0),
    canonicalDocuments: canonicalDocs.length,
    checkedLinks: linkCount,
  };
}

try {
  console.log(JSON.stringify(await validate()));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
