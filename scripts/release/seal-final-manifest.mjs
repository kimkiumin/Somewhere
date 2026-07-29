import { resolve, sep } from "node:path";
import { lstat, readdir, writeFile } from "node:fs/promises";
import {
  digestFile,
  mainBoundary,
  parseArguments,
  readJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--preparation", "--verdict", "--cleanup-receipt", "--aggregate-receipt", "--lanes", "--output"],
};

async function regularFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await regularFiles(directory, path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

async function seal(options) {
  const preparation = resolve(options.preparation);
  const finalRoot = resolve(preparation, "..");
  const output = resolve(options.output);
  if (!output.startsWith(`${finalRoot}${sep}`)) throw new TypeError("terminal manifest must be inside final root");
  const verdict = await readJson(resolve(options.verdict));
  if (verdict.repositoryReady !== "PASS" || !["PASS", "BLOCK"].includes(verdict.releaseReady)) {
    throw new TypeError("cannot seal failing final verdict");
  }
  const required = [
    preparation,
    resolve(options.verdict),
    resolve(options["cleanup-receipt"]),
    resolve(options["aggregate-receipt"]),
    resolve(finalRoot, "external-gates.json"),
  ];
  const laneRoots = options.lanes.split(",").map((path) => resolve(path));
  if (laneRoots.length !== 4 || new Set(laneRoots).size !== 4) throw new TypeError("exactly four unique lanes required");
  for (const laneRoot of laneRoots) {
    if (!laneRoot.startsWith(`${finalRoot}${sep}`)) throw new TypeError("lane escapes final root");
    for (const path of await regularFiles(laneRoot)) required.push(resolve(laneRoot, path));
  }
  const unique = [...new Set(required)].sort();
  const lines = [];
  for (const path of unique) {
    const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink()) throw new TypeError(`not a regular evidence file: ${path}`);
    lines.push(`${(await digestFile(path)).slice(7)}  ${path.slice(finalRoot.length + 1)}`);
  }
  await writeFile(output, `${lines.join("\n")}\n`, { flag: "wx" });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => seal(parsed), parsed.output);
