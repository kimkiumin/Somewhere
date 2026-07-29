import { readdir, readFile, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";

const [productionArgument = "dist", harnessArgument = "dist-e2e", fieldArgument = "dist-field"] =
  process.argv.slice(2);
const outputArguments = [productionArgument, harnessArgument, fieldArgument];
const outputDirectories = await Promise.all(
  outputArguments.map((directory) => realpath(resolve(directory))),
);

if (new Set(outputDirectories).size !== outputDirectories.length) {
  throw new Error("Production, harness, and field outputs must use distinct directories.");
}

async function artifactPaths(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(directory, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    )
    .sort();
}

const productionDirectory = outputDirectories[0];
const harnessDirectory = outputDirectories[1];
const [productionFiles, harnessFiles, fieldFiles] = await Promise.all(
  outputDirectories.map(artifactPaths),
);
const sourceMaps = [
  ...productionFiles.map((path) => `production:${path}`),
  ...harnessFiles.map((path) => `harness:${path}`),
  ...fieldFiles.map((path) => `field:${path}`),
].filter((entry) => entry.endsWith(".map"));
if (sourceMaps.length > 0) {
  throw new Error(`Source maps are forbidden in emitted builds: ${sourceMaps.join(", ")}`);
}

const privateProductionFiles = productionFiles.filter((path) =>
  /(?:^|[./_-])(?:api|constraint|diagnostic|feedback|field|harness|journey|route|showcase|source.?map|testkit|trace)(?:[./_-]|$)/i.test(
    path,
  ),
);
if (privateProductionFiles.length > 0) {
  throw new Error(`Private production artifacts: ${privateProductionFiles.join(", ")}`);
}

const productionTextArtifacts = productionFiles.filter((path) => /\.(?:css|html|js)$/.test(path));
const productionText = await Promise.all(
  productionTextArtifacts.map(async (path) => ({
    path,
    text: await readFile(resolve(productionDirectory, path), "utf8"),
  })),
);
const fieldCodeMarkers =
  /(?:field-(?:discard|export|retry|start)|Somewhere Field Diagnostics|somewhere-field-trace|Field diagnostics root|#field(?:\W|$))/i;
const productionFieldCode = productionText
  .filter((artifact) => fieldCodeMarkers.test(artifact.text))
  .map((artifact) => artifact.path);
if (productionFieldCode.length > 0) {
  throw new Error(`Field-only code in production artifacts: ${productionFieldCode.join(", ")}`);
}

const forbiddenFieldPwaFiles = fieldFiles.filter(
  (path) =>
    path === "sw.js" ||
    path === "manifest.webmanifest" ||
    /(?:^|\/)(?:registerSW|workbox)[^/]*\.js$/i.test(path),
);
if (forbiddenFieldPwaFiles.length > 0) {
  throw new Error(`Field build must not emit PWA artifacts: ${forbiddenFieldPwaFiles.join(", ")}`);
}

const [productionWorker, harnessWorker] = await Promise.all([
  readFile(resolve(productionDirectory, "sw.js"), "utf8"),
  readFile(resolve(harnessDirectory, "sw.js"), "utf8"),
]);
if (
  !productionWorker.includes("somewhere-consumer") ||
  productionWorker.includes("somewhere-test-harness")
) {
  throw new Error("Production service worker does not own only the consumer cache namespace.");
}
if (
  !harnessWorker.includes("somewhere-test-harness") ||
  harnessWorker.includes("somewhere-consumer")
) {
  throw new Error("Harness service worker does not own only the test cache namespace.");
}

console.log(
  `Verified disjoint production (${productionFiles.length}), harness (${harnessFiles.length}), and field (${fieldFiles.length}) outputs.`,
);
