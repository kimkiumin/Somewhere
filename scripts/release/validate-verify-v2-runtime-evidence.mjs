import { resolve } from "node:path";
import {
  mainBoundary,
  parseArguments,
  writeJson,
} from "./lib/release-core.mjs";
import { validateVerifyV2RuntimeEvidence } from "./lib/verify-v2-runtime-evidence.mjs";

const specification = {
  required: ["--input", "--sha", "--source-tree", "--registry", "--output"],
};

async function validate(options) {
  const result = await validateVerifyV2RuntimeEvidence({
    input: options.input,
    sha: options.sha,
    sourceTree: options["source-tree"],
    registry: options.registry,
  });
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    finalSha: options.sha,
    sourceTree: options["source-tree"],
    input: {
      path: result.primarySnapshot.path,
      sha256: result.primarySnapshot.sha256,
    },
    artifactCount: result.artifacts.length,
    artifactSetSha256: result.primary.runtimeEvidence.artifactSetSha256,
    artifacts: result.artifacts.map((entry) => ({
      path: entry.absolutePath,
      sha256: entry.sha256,
      bytes: entry.bytes,
      kind: entry.kind,
    })),
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
if (parsed.help === true) {
  console.log("validate-verify-v2-runtime-evidence.mjs --input PATH --sha SHA --source-tree TREE --registry PATH --output PATH");
} else {
  await mainBoundary(() => validate(parsed), parsed.output);
}
