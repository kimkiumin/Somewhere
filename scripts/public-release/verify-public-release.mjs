import { createHash, verify } from "node:crypto";
import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "../../app/qa/field/v2/canonical-json.mjs";

export const PUBLIC_RELEASE_PURPOSES = Object.freeze([
  "cloudflare-production",
  "cloudflare-canonical-origin",
  "cloudflare-production-pitr",
  "provider-rights-quota",
  "korean-privacy-location-review",
  "study-a-rc",
  "physical-iphone",
  "native-distribution",
]);

const GATES = new Set(["PASS", "BLOCK", "FAIL"]);
const PAYLOAD_KEYS = new Set([
  "schemaVersion", "purpose", "authorityId", "issuedAt", "expiresAt", "finalSha",
  "sourceTree", "terminalManifestSha256", "decision", "evidenceDigests", "conditions",
]);

function object(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function exact(value, keys, label) {
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`unknown ${label} field: ${key}`);
  for (const key of keys) if (!(key in value)) throw new TypeError(`missing ${label} field: ${key}`);
}

function text(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a nonempty string`);
  return value;
}

function instant(value, label) {
  text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new TypeError(`${label} must be an ISO date-time`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be an ISO date-time`);
  return parsed;
}

function digest(value, label, prefixed = true) {
  const pattern = prefixed ? /^sha256:[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/;
  if (typeof value !== "string" || !pattern.test(value)) throw new TypeError(`${label} must be a SHA-256 digest`);
}

function stringArray(value, label, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.some((entry) => typeof entry !== "string" || entry.length === 0) || new Set(value).size !== value.length) {
    throw new TypeError(`${label} must be a unique string array`);
  }
}

function validateTrustStore(value) {
  const store = object(value, "trust store");
  exact(store, new Set(["schemaVersion", "authorities"]), "trust store");
  if (store.schemaVersion !== 1 || !Array.isArray(store.authorities)) throw new TypeError("invalid trust store");
  const ids = [];
  for (const raw of store.authorities) {
    const authority = object(raw, "authority");
    exact(authority, new Set(["authorityId", "purposes", "publicKeyPem", "validFrom", "validUntil"]), "authority");
    ids.push(text(authority.authorityId, "authorityId"));
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(authority.authorityId)) throw new TypeError("invalid authorityId");
    stringArray(authority.purposes, "authority.purposes", 1);
    if (authority.purposes.some((purpose) => !PUBLIC_RELEASE_PURPOSES.includes(purpose))) throw new TypeError("unknown authority purpose");
    if (typeof authority.publicKeyPem !== "string" || !authority.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")) throw new TypeError("invalid authority public key");
    if (instant(authority.validUntil, "authority.validUntil") <= instant(authority.validFrom, "authority.validFrom")) throw new TypeError("invalid authority validity window");
  }
  if (new Set(ids).size !== ids.length) throw new TypeError("duplicate authority");
  return store;
}

function validateReceipt(value) {
  const receipt = object(value, "receipt");
  exact(receipt, new Set(["schemaVersion", "payload", "signature"]), "receipt");
  if (receipt.schemaVersion !== 1) throw new TypeError("receipt schemaVersion must be 1");
  const payload = object(receipt.payload, "receipt payload");
  exact(payload, PAYLOAD_KEYS, "receipt payload");
  if (payload.schemaVersion !== 1 || !PUBLIC_RELEASE_PURPOSES.includes(payload.purpose)) throw new TypeError("invalid receipt purpose");
  text(payload.authorityId, "payload.authorityId");
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(payload.authorityId)) throw new TypeError("invalid payload.authorityId");
  instant(payload.issuedAt, "payload.issuedAt");
  instant(payload.expiresAt, "payload.expiresAt");
  if (!/^[a-f0-9]{40}$/.test(payload.finalSha) || !/^[a-f0-9]{40}$/.test(payload.sourceTree)) throw new TypeError("invalid receipt Git identity");
  digest(payload.terminalManifestSha256, "payload.terminalManifestSha256");
  if (!GATES.has(payload.decision)) throw new TypeError("invalid receipt decision");
  stringArray(payload.evidenceDigests, "payload.evidenceDigests", 1);
  for (const value of payload.evidenceDigests) digest(value, "payload.evidenceDigest");
  stringArray(payload.conditions, "payload.conditions");
  const signature = object(receipt.signature, "receipt signature");
  exact(signature, new Set(["algorithm", "signatureBase64", "signatureSha256"]), "receipt signature");
  if (signature.algorithm !== "Ed25519") throw new TypeError("signature algorithm must be Ed25519");
  text(signature.signatureBase64, "signatureBase64");
  digest(signature.signatureSha256, "signatureSha256", false);
  return receipt;
}

function outsideRepository(path, repoRoot) {
  const relation = relative(resolve(repoRoot), resolve(path));
  return relation.startsWith("..") || relation === "" ? relation.startsWith("..") : false;
}

export async function verifyPublicRelease(input) {
  const trustStore = validateTrustStore(input.trustStore);
  const trustStoreSha256 = `sha256:${createHash("sha256").update(canonicalJson(trustStore)).digest("hex")}`;
  if (!Array.isArray(input.receipts)) throw new TypeError("receipts must be an array");
  const validated = input.receipts.map((entry) => ({ path: text(entry.path, "receipt.path"), value: validateReceipt(entry.value) }));
  const purposes = validated.map((entry) => entry.value.payload.purpose);
  if (JSON.stringify(purposes) !== JSON.stringify(PUBLIC_RELEASE_PURPOSES)) throw new TypeError("receipts must contain the exact ordered public release purposes");
  const now = instant(input.now, "now");
  for (const entry of validated) {
    if (!outsideRepository(entry.path, input.repoRoot)) throw new TypeError("receipt path must be outside the repository");
    if (!outsideRepository(await realpath(entry.path), await realpath(input.repoRoot))) {
      throw new TypeError("receipt path must be outside the repository");
    }
    const { payload, signature } = entry.value;
    if (payload.finalSha !== input.finalSha || payload.sourceTree !== input.sourceTree || payload.terminalManifestSha256 !== input.terminalManifestSha256) throw new TypeError("release identity mismatch");
    if (now < instant(payload.issuedAt, "payload.issuedAt") || now > instant(payload.expiresAt, "payload.expiresAt")) throw new TypeError("receipt expired");
    const authority = trustStore.authorities.find((candidate) => candidate.authorityId === payload.authorityId);
    if (authority === undefined) throw new TypeError("untrusted authority");
    if (!authority.purposes.includes(payload.purpose)) throw new TypeError("authority purpose not granted");
    const issuedAt = Date.parse(payload.issuedAt);
    if (issuedAt < Date.parse(authority.validFrom) || issuedAt > Date.parse(authority.validUntil)) throw new TypeError("authority outside validity");
    const signatureBytes = Buffer.from(signature.signatureBase64, "base64");
    if (createHash("sha256").update(signatureBytes).digest("hex") !== signature.signatureSha256) throw new TypeError("signature digest mismatch");
    if (!verify(null, Buffer.from(canonicalJson(payload)), authority.publicKeyPem, signatureBytes)) throw new TypeError("invalid receipt signature");
  }
  const receiptResults = validated.map(({ value }) => ({
    purpose: value.payload.purpose,
    authorityId: value.payload.authorityId,
    decision: value.payload.decision,
    receiptSha256: `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`,
    evidenceDigests: value.payload.evidenceDigests,
  }));
  const publicRelease = receiptResults.some((entry) => entry.decision === "FAIL") ? "FAIL" : receiptResults.some((entry) => entry.decision === "BLOCK") ? "BLOCK" : "PASS";
  return { schemaVersion: 1, finalSha: input.finalSha, sourceTree: input.sourceTree, terminalManifestSha256: input.terminalManifestSha256, trustStoreSha256, decidedAt: input.now, publicRelease, receipts: receiptResults };
}

function parseOptions(argv) {
  if (argv.includes("--help")) {
    return { help: true };
  }
  const allowed = new Set([
    "--trust-store", "--receipts", "--final-sha", "--source-tree",
    "--terminal-manifest-sha256", "--repo", "--output",
  ]);
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || value === undefined || value.startsWith("--")) {
      throw new TypeError(`invalid option: ${flag ?? "<missing>"}`);
    }
    if (Object.hasOwn(options, flag)) throw new TypeError(`duplicate option: ${flag}`);
    options[flag] = value;
  }
  for (const flag of allowed) {
    if (!Object.hasOwn(options, flag)) throw new TypeError(`missing option: ${flag}`);
  }
  return options;
}

async function main(argv) {
  const options = parseOptions(argv);
  if (options.help) {
    process.stdout.write("Usage: bun scripts/public-release/verify-public-release.mjs --trust-store <json> --receipts <dir> --final-sha <sha> --source-tree <tree> --terminal-manifest-sha256 <sha256:hex> --repo <path> --output <external-json>\n");
    return;
  }
  const repoRoot = resolve(options["--repo"]);
  const output = resolve(options["--output"]);
  if (!outsideRepository(output, repoRoot)) throw new TypeError("output path must be outside the repository");
  if (!outsideRepository(await realpath(dirname(output)), await realpath(repoRoot))) throw new TypeError("output path must be outside the repository");
  const trustPath = resolve(options["--trust-store"]);
  if (!outsideRepository(await realpath(trustPath), await realpath(repoRoot))) throw new TypeError("trust store must be outside the repository");
  const trustStore = JSON.parse(await readFile(trustPath, "utf8"));
  const receiptRoot = resolve(options["--receipts"]);
  const expectedFiles = PUBLIC_RELEASE_PURPOSES.map((purpose) => `${purpose}.json`).sort();
  const observedFiles = (await readdir(receiptRoot)).sort();
  if (JSON.stringify(observedFiles) !== JSON.stringify(expectedFiles)) throw new TypeError("receipt directory must contain exactly eight canonical files");
  const receipts = await Promise.all(PUBLIC_RELEASE_PURPOSES.map(async (purpose) => {
    const path = resolve(receiptRoot, `${purpose}.json`);
    return { path, value: JSON.parse(await readFile(path, "utf8")) };
  }));
  const decision = await verifyPublicRelease({
    trustStore,
    receipts,
    finalSha: options["--final-sha"],
    sourceTree: options["--source-tree"],
    terminalManifestSha256: options["--terminal-manifest-sha256"],
    now: new Date().toISOString(),
    repoRoot,
  });
  await writeFile(output, `${JSON.stringify(decision, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  process.stdout.write(`${JSON.stringify({ gate: decision.publicRelease, output })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
