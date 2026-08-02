import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const BLUEPRINT_TRACK_IDS = Object.freeze([
  "service-web-backend",
  "native-ios",
  "physical-product",
  "study-a",
  "study-b",
  "provider-legal",
  "public-operations",
]);

const REQUIRED_FOR_BLUEPRINT = new Set([
  "service-web-backend",
  "native-ios",
  "physical-product",
  "study-a",
  "study-b",
  "provider-legal",
]);
const GATES = new Set(["PASS", "BLOCK", "FAIL"]);
const DOCUMENT_KEYS = new Set(["schemaVersion", "statusAsOf", "tracks"]);
const TRACK_KEYS = new Set([
  "id",
  "requiredForBlueprint",
  "requiredForPublicRelease",
  "gate",
  "evidence",
  "reason",
]);

function object(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, keys, label) {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new TypeError(`unknown ${label} field: ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) throw new TypeError(`missing ${label} field: ${key}`);
  }
}

function nonemptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a nonempty string`);
  }
}

function gateOf(entries) {
  if (entries.some((entry) => entry.gate === "FAIL")) return "FAIL";
  if (entries.some((entry) => entry.gate === "BLOCK")) return "BLOCK";
  return "PASS";
}

export function validateBlueprintCompletion(value) {
  const document = object(value, "document");
  exactKeys(document, DOCUMENT_KEYS, "document");
  if (document.schemaVersion !== 1) throw new TypeError("schemaVersion must be 1");
  if (typeof document.statusAsOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(document.statusAsOf)) {
    throw new TypeError("statusAsOf must be an ISO date");
  }
  if (!Array.isArray(document.tracks)) throw new TypeError("tracks must be an array");
  const ids = document.tracks.map((entry) => entry?.id);
  if (JSON.stringify(ids) !== JSON.stringify(BLUEPRINT_TRACK_IDS)) {
    throw new TypeError("tracks must contain the exact ordered blueprint track registry");
  }
  for (const rawTrack of document.tracks) {
    const track = object(rawTrack, "track");
    exactKeys(track, TRACK_KEYS, "track");
    const expectedBlueprint = REQUIRED_FOR_BLUEPRINT.has(track.id);
    if (
      track.requiredForBlueprint !== expectedBlueprint
      || track.requiredForPublicRelease !== true
    ) {
      throw new TypeError(`${track.id} requirement flags contradict the canonical registry`);
    }
    if (!GATES.has(track.gate)) throw new TypeError(`${track.id}.gate must be PASS, BLOCK, or FAIL`);
    if (
      !Array.isArray(track.evidence)
      || track.evidence.length === 0
      || track.evidence.some((entry) => typeof entry !== "string" || entry.length === 0)
      || new Set(track.evidence).size !== track.evidence.length
    ) {
      throw new TypeError(`${track.id}.evidence must be a nonempty unique string array`);
    }
    nonemptyString(track.reason, `${track.id}.reason`);
  }
  return document;
}

export function deriveBlueprintCompletion(document) {
  const service = document.tracks.filter((entry) => entry.id === "service-web-backend");
  const blueprint = document.tracks.filter((entry) => entry.requiredForBlueprint);
  const publicRelease = document.tracks.filter((entry) => entry.requiredForPublicRelease);
  return {
    serviceSlice: gateOf(service),
    blueprintProject: gateOf(blueprint),
    publicRelease: gateOf(publicRelease),
  };
}

async function main(argv) {
  const inputIndex = argv.indexOf("--input");
  const input = inputIndex === -1
    ? resolve(import.meta.dir, "blueprint-completion-v1.json")
    : resolve(argv[inputIndex + 1] ?? "");
  const document = validateBlueprintCompletion(JSON.parse(await readFile(input, "utf8")));
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    statusAsOf: document.statusAsOf,
    ...deriveBlueprintCompletion(document),
    tracks: document.tracks.map(({ id, gate, reason }) => ({ id, gate, reason })),
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
