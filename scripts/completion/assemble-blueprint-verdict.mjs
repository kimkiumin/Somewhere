import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const BLUEPRINT_COMPONENT_IDS = Object.freeze([
  "service-repository",
  "native-field",
  "physical-package",
  "physical-handling",
  "provider-legal",
  "study-a",
  "study-b",
  "risk-ledger",
  "public-release-decision",
]);

const phaseDependencies = Object.freeze({
  "phase-0": ["service-repository", "provider-legal"],
  "phase-1": ["native-field", "physical-package"],
  "phase-2": ["native-field", "physical-package", "physical-handling"],
  "phase-3": ["study-a"],
  "phase-4": ["study-b"],
  "phase-5": [
    "service-repository",
    "native-field",
    "physical-package",
    "physical-handling",
    "provider-legal",
    "study-a",
    "study-b",
    "risk-ledger",
  ],
});

const gates = new Set(["PASS", "BLOCK", "FAIL"]);
const hex40 = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;

function fail(reason) {
  throw new TypeError(reason);
}

function exactKeys(value, keys, reason) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(reason);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(reason);
  }
}

function validDigestArray(value) {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((entry) => typeof entry === "string" && digest.test(entry))
  );
}

function gateOf(values) {
  if (values.includes("FAIL")) return "FAIL";
  if (values.includes("BLOCK")) return "BLOCK";
  return "PASS";
}

function outsideRepository(target, repoRoot) {
  const relation = path.relative(path.resolve(repoRoot), path.resolve(target));
  return relation.startsWith("..") && !path.isAbsolute(relation);
}

async function verifyArtifactFiles(artifacts, repoRoot) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    fail("ARTIFACT_REGISTRY_INVALID");
  }
  const evidenceDigests = new Set();
  const authorityReceiptDigests = new Set();
  const observedPaths = new Set();
  for (const artifact of artifacts) {
    exactKeys(artifact, ["kind", "path", "sha256"], "ARTIFACT_REGISTRY_INVALID");
    if (
      !["evidence", "authority-receipt"].includes(artifact.kind) ||
      typeof artifact.path !== "string" ||
      !path.isAbsolute(artifact.path) ||
      typeof artifact.sha256 !== "string" ||
      !digest.test(artifact.sha256) ||
      observedPaths.has(artifact.path)
    ) {
      fail("ARTIFACT_REGISTRY_INVALID");
    }
    observedPaths.add(artifact.path);
    const resolvedPath = await realpath(artifact.path);
    if (!outsideRepository(resolvedPath, await realpath(repoRoot))) {
      fail("FINAL_ARTIFACT_MUST_BE_OUTSIDE_REPOSITORY");
    }
    const bytes = await readFile(resolvedPath);
    const observedDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (observedDigest !== artifact.sha256) fail("FINAL_ARTIFACT_DIGEST_MISMATCH");
    const target =
      artifact.kind === "evidence" ? evidenceDigests : authorityReceiptDigests;
    target.add(observedDigest);
  }
  return { evidenceDigests, authorityReceiptDigests };
}

function effectiveComponent(component, finalSha, sourceTree, verifiedArtifacts) {
  exactKeys(
    component,
    [
      "id",
      "gate",
      "boundFinalSha",
      "boundSourceTree",
      "evidenceDigests",
      "authorityReceiptDigests",
      "reason",
    ],
    "COMPONENT_SCHEMA_INVALID",
  );
  if (
    !gates.has(component.gate) ||
    !validDigestArray(component.evidenceDigests) ||
    !validDigestArray(component.authorityReceiptDigests) ||
    typeof component.reason !== "string" ||
    component.reason.length === 0 ||
    !(
      component.boundFinalSha === null ||
      (typeof component.boundFinalSha === "string" && hex40.test(component.boundFinalSha))
    ) ||
    !(
      component.boundSourceTree === null ||
      (typeof component.boundSourceTree === "string" && hex40.test(component.boundSourceTree))
    )
  ) {
    fail("COMPONENT_SCHEMA_INVALID");
  }
  if (component.gate !== "PASS") return { ...component };
  if (component.boundFinalSha !== finalSha || component.boundSourceTree !== sourceTree) {
    return { ...component, gate: "FAIL", reason: "FOREIGN_RELEASE_IDENTITY" };
  }
  if (component.evidenceDigests.length === 0) {
    return { ...component, gate: "BLOCK", reason: "EVIDENCE_DIGEST_MISSING" };
  }
  if (component.authorityReceiptDigests.length === 0) {
    return { ...component, gate: "BLOCK", reason: "AUTHORITY_RECEIPT_MISSING" };
  }
  if (
    component.evidenceDigests.some((value) => !verifiedArtifacts.evidenceDigests.has(value))
  ) {
    return { ...component, gate: "BLOCK", reason: "EVIDENCE_ARTIFACT_UNVERIFIED" };
  }
  if (
    component.authorityReceiptDigests.some(
      (value) => !verifiedArtifacts.authorityReceiptDigests.has(value),
    )
  ) {
    return { ...component, gate: "BLOCK", reason: "AUTHORITY_RECEIPT_UNVERIFIED" };
  }
  return { ...component };
}

export function assembleBlueprintVerdict(
  input,
  verifiedArtifacts = { evidenceDigests: new Set(), authorityReceiptDigests: new Set() },
) {
  exactKeys(
    input,
    ["schemaVersion", "finalSha", "sourceTree", "statusAsOf", "components"],
    "BLUEPRINT_SYNTHESIS_INPUT_INVALID",
  );
  if (
    input.schemaVersion !== 1 ||
    typeof input.finalSha !== "string" ||
    !hex40.test(input.finalSha) ||
    typeof input.sourceTree !== "string" ||
    !hex40.test(input.sourceTree) ||
    typeof input.statusAsOf !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.statusAsOf) ||
    !Array.isArray(input.components)
  ) {
    fail("BLUEPRINT_SYNTHESIS_INPUT_INVALID");
  }
  if (
    !(verifiedArtifacts.evidenceDigests instanceof Set) ||
    !(verifiedArtifacts.authorityReceiptDigests instanceof Set)
  ) {
    fail("VERIFIED_ARTIFACT_REGISTRY_INVALID");
  }
  const componentIds = input.components.map((component) => component?.id);
  if (JSON.stringify(componentIds) !== JSON.stringify(BLUEPRINT_COMPONENT_IDS)) {
    fail("COMPONENT_REGISTRY_INVALID");
  }
  const components = input.components.map((component) =>
    effectiveComponent(component, input.finalSha, input.sourceTree, verifiedArtifacts),
  );
  const byId = new Map(components.map((component) => [component.id, component]));
  const phases = Object.entries(phaseDependencies).map(([id, dependencies]) => ({
    id,
    gate: gateOf(dependencies.map((dependency) => byId.get(dependency).gate)),
  }));
  const blueprintProject = gateOf(phases.map((phase) => phase.gate));
  const publicDecision = byId.get("public-release-decision").gate;
  const publicRelease = gateOf([blueprintProject, publicDecision]);
  return {
    schemaVersion: 1,
    statusAsOf: input.statusAsOf,
    finalSha: input.finalSha,
    sourceTree: input.sourceTree,
    phases,
    components,
    finalNarrativeGate: phases[5].gate,
    blueprintProject,
    publicRelease,
  };
}

function argumentsMap(values) {
  if (values.includes("--help")) return new Map([["--help", "true"]]);
  const allowed = new Set(["--input", "--output", "--repo"]);
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (
      key === undefined ||
      value === undefined ||
      !allowed.has(key) ||
      result.has(key)
    ) {
      fail("arguments must be --name value pairs");
    }
    result.set(key, value);
  }
  return result;
}

async function writeJsonAtomic(output, value) {
  try {
    await access(output);
    fail("OUTPUT_ALREADY_EXISTS");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, output);
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  if (options.has("--help")) {
    console.log(
      "Usage: bun scripts/completion/assemble-blueprint-verdict.mjs " +
        "--input EXTERNAL_FILE --output EXTERNAL_FILE --repo DIR",
    );
    return;
  }
  const inputPath = options.get("--input");
  const outputPath = options.get("--output");
  const repoPath = options.get("--repo");
  if (inputPath === undefined || outputPath === undefined || repoPath === undefined) {
    fail("required: --input --output --repo");
  }
  let safeOutput = null;
  try {
    const repoRoot = await realpath(path.resolve(repoPath));
    const resolvedInput = await realpath(path.resolve(inputPath));
    const resolvedOutput = path.resolve(outputPath);
    await mkdir(path.dirname(resolvedOutput), { recursive: true });
    if (
      !outsideRepository(resolvedInput, repoRoot) ||
      !outsideRepository(await realpath(path.dirname(resolvedOutput)), repoRoot)
    ) {
      fail("FINAL_SYNTHESIS_IO_MUST_BE_OUTSIDE_REPOSITORY");
    }
    safeOutput = resolvedOutput;
    const manifest = JSON.parse(await readFile(resolvedInput, "utf8"));
    exactKeys(
      manifest,
      ["schemaVersion", "finalSha", "sourceTree", "statusAsOf", "components", "artifacts"],
      "BLUEPRINT_SYNTHESIS_MANIFEST_INVALID",
    );
    const { artifacts, ...input } = manifest;
    const verifiedArtifacts = await verifyArtifactFiles(artifacts, repoRoot);
    const verdict = assembleBlueprintVerdict(input, verifiedArtifacts);
    await writeJsonAtomic(resolvedOutput, verdict);
    process.exitCode = verdict.publicRelease === "FAIL" ? 1 : verdict.publicRelease === "BLOCK" ? 2 : 0;
  } catch (error) {
    if (
      safeOutput !== null &&
      !(error instanceof Error && error.message === "OUTPUT_ALREADY_EXISTS")
    ) {
      await writeJsonAtomic(safeOutput, {
        schemaVersion: 1,
        blueprintProject: "FAIL",
        publicRelease: "FAIL",
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
    } else {
      console.error(error instanceof Error ? error.message : "UNKNOWN_ERROR");
    }
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
