import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  assertHex,
  digestFile,
  parseArguments,
  readJson,
  run,
  sha256,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--manifest", "--state-dir", "--sha", "--output"],
};
const parsed = parseArguments(process.argv.slice(2), specification);
assertHex(parsed.sha, 40, "sha");
const manifest = await readJson(resolve(parsed.manifest));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases)) throw new TypeError("invalid red-team registry");
const ids = manifest.cases.map((entry) => entry.id);
if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string")) {
  throw new TypeError("duplicate or invalid red-team case");
}
await mkdir(resolve(parsed["state-dir"]), { recursive: true });
const results = [];
for (const testCase of manifest.cases) {
  const observed = await run(testCase.argv, {
    cwd: resolve("."),
    env: {
      PATH: process.env.PATH,
      LANG: process.env.LANG,
      CI: "1",
      SOMEWHERE_RED_TEAM_STATE: resolve(parsed["state-dir"], testCase.id),
    },
  });
  results.push({
    id: testCase.id,
    expectedExit: testCase.expectedExit,
    exitCode: observed.exitCode,
    result: observed.exitCode === testCase.expectedExit ? "NEGATIVE_PASS" : "FAIL",
    stdoutSha256: sha256(observed.stdout),
    stderrSha256: sha256(observed.stderr),
  });
}
await writeJson(resolve(parsed.output), {
  schemaVersion: 1,
  sourceSha: parsed.sha,
  registrySha256: await digestFile(resolve(parsed.manifest)),
  executedIds: ids,
  results,
});
if (results.some((entry) => entry.result === "FAIL")) process.exitCode = 1;
