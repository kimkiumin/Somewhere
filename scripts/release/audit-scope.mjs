import { resolve } from "node:path";
import {
  mainBoundary,
  parseArguments,
  readJson,
  writeJson,
} from "./lib/release-core.mjs";
import { assertObject } from "./lib/release-contracts.mjs";

const specification = {
  required: ["--root", "--must-not", "--sha", "--output"],
  optional: ["--authority", "--build-receipt", "--final-root", "--contracts", "--docs"],
};

function compareObject(actual, expected, prefix, failures) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const label = `${prefix}.${key}`;
    if (typeof expectedValue === "object" && expectedValue !== null && !Array.isArray(expectedValue)) {
      const nested = actual[key];
      if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
        failures.push(`${label}:missing`);
      } else {
        compareObject(nested, expectedValue, label, failures);
      }
    } else if (actual[key] !== expectedValue) {
      failures.push(`${label}:expected=${JSON.stringify(expectedValue)}:actual=${JSON.stringify(actual[key])}`);
    }
  }
}

async function audit(options) {
  const root = resolve(options.root);
  const authorityPath = resolve(options.authority ?? resolve(root, "docs/authority-map-v2.json"));
  const authority = assertObject(await readJson(authorityPath), "authority");
  const mustNot = assertObject(await readJson(resolve(root, options["must-not"])), "must-not");
  const failures = [];
  if (authority.schemaVersion !== 1 || authority.productVersion !== "v2") {
    failures.push("authority-version");
  }
  compareObject(authority.product, mustNot.product, "product", failures);
  if (
    authority.backend.productionDeployed !== false
    || authority.backend.koreaResidencyClaim !== false
    || authority.backend.fixedZeroCostClaim !== false
    || authority.backend.providerMode !== "reviewed fixture until external rights gate passes"
  ) {
    failures.push("false-release-or-infrastructure-claim");
  }
  const operations = await readJson(resolve(root, authority.canonical.operationsPolicy));
  if (
    authority.costPolicy.warningFraction !== operations.warnFraction
    || authority.costPolicy.admissionCloseFraction !== operations.closeFraction
  ) {
    failures.push("cost-policy-drift");
  }
  compareObject(authority.retention, operations.retention, "retention", failures);
  const canonicalPaths = Object.values(authority.canonical);
  for (const path of canonicalPaths) {
    if (!(await Bun.file(resolve(root, path)).exists())) failures.push(`missing-canonical:${path}`);
  }
  const gate = failures.length === 0 ? "PASS" : "FAIL";
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate,
    sourceSha: options.sha,
    authority: authorityPath,
    failures,
    checkedCanonicalPaths: canonicalPaths,
  });
  if (gate !== "PASS") process.exitCode = 1;
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => audit(parsed), parsed.output);
