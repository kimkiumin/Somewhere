import { readFile } from "node:fs/promises";
import {
  CANARY_SURFACES,
  scanCanarySurface,
  type CanarySurface,
} from "../../server/src/observability/canary-scanner";

const requested = process.argv.slice(2);
const findings = [];
const seen = new Set<CanarySurface>();
for (const request of requested) {
  const separator = request.indexOf(":");
  const surface = request.slice(0, separator);
  const path = request.slice(separator + 1);
  if (!isSurface(surface) || separator < 1 || path.length === 0) {
    throw new Error(`TASK14_CANARY_ARGUMENT_INVALID:${request}`);
  }
  const artifact = await readFile(path, "utf8");
  if (artifact.trim().length === 0) {
    throw new Error(`TASK14_CANARY_ARTIFACT_EMPTY:${surface}`);
  }
  if (seen.has(surface)) {
    throw new Error(`TASK14_CANARY_SURFACE_DUPLICATE:${surface}`);
  }
  seen.add(surface);
  findings.push(...scanCanarySurface(surface, artifact));
}
if (
  seen.size !== CANARY_SURFACES.length ||
  CANARY_SURFACES.some((surface) => !seen.has(surface))
) {
  throw new Error("TASK14_CANARY_SURFACES_INCOMPLETE");
}
if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ findings })}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ scanned: requested.length, status: "PASS" })}\n`);

function isSurface(value: string): value is CanarySurface {
  return CANARY_SURFACES.some((surface) => surface === value);
}
