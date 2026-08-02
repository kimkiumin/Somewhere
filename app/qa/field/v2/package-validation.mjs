import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { verifyEd25519Attestation } from "./attestation.mjs";
import {
  expectedRun,
  requiredRunDirectories,
  supportsHomeScreenWakeLock,
} from "./release-run-matrix.mjs";
import { evidenceSchema, hex64, releaseRunSchema } from "./schemas.mjs";
import { screenManifestMatches } from "./screen-manifest.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function directoryEntries(directory) {
  return (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function addZodErrors(errors, prefix, result) {
  if (result.success) return;
  for (const issue of result.error.issues) {
    errors.push(`${prefix}:${issue.path.join(".") || "root"}:${issue.code}`);
  }
}

function verifyAttestation(metadata, trustedSigners, errors, directory) {
  if (metadata.evidenceOrigin !== "physical" || trustedSigners === undefined) return false;
  const { keyId, signatureBase64, signatureSha256, ...attestation } = metadata.testerAttestation;
  if (keyId === undefined || signatureBase64 === undefined) {
    errors.push(`PHYSICAL_ATTESTATION_MISSING:${directory}`);
    return false;
  }
  const payload = {
    ...metadata,
    testerAttestation: {
      ...attestation,
      keyId,
    },
  };
  const error = verifyEd25519Attestation({
    trustedRegistry: trustedSigners,
    keyId,
    signedAt: attestation.signedAt,
    signatureBase64,
    signatureSha256,
    payload,
    sha256,
  });
  if (error !== null) {
    errors.push(`${error}:${directory}`);
    return false;
  }
  return true;
}

async function validateRun(context) {
  const { root, directory, candidate, origin, traceDigests, errors, trustedSigners } = context;
  const runRoot = path.join(root, directory);
  const entries = await directoryEntries(runRoot);
  const names = entries.map((entry) => entry.name);
  if (
    names.join("\n") !== ["checklist.md", "metadata.json", "screens", "trace.sha256"].join("\n")
  ) {
    errors.push(`UNEXPECTED_RUN_ARTIFACTS:${directory}`);
    return;
  }
  if (!entries.find((entry) => entry.name === "screens")?.isDirectory()) {
    errors.push(`SCREENS_NOT_DIRECTORY:${directory}`);
    return;
  }

  const metadataResult = releaseRunSchema.safeParse(
    JSON.parse(await readFile(path.join(runRoot, "metadata.json"), "utf8")),
  );
  addZodErrors(errors, `METADATA:${directory}`, metadataResult);
  if (!metadataResult.success) return;
  const metadata = metadataResult.data;
  const expected = expectedRun(directory, candidate.buildSha);
  if (
    expected === undefined ||
    metadata.browserMode !== expected[0] ||
    metadata.environment !== expected[1] ||
    metadata.runId !== expected[2]
  ) {
    errors.push(`RUN_DIRECTORY_MISMATCH:${directory}`);
  }
  if (
    metadata.evidenceOrigin !== origin ||
    metadata.buildSha !== candidate.buildSha ||
    metadata.navigationPolicySha256 !== candidate.navigationPolicySha256 ||
    metadata.deployedUrl !== candidate.deployedUrl ||
    metadata.routeId !== candidate.routeId ||
    metadata.routeVersion !== candidate.routeVersion ||
    metadata.routeDigest !== candidate.routeDigest ||
    metadata.providerId !== candidate.providerId ||
    metadata.providerVersion !== candidate.providerVersion ||
    metadata.providerRightsDigest !== candidate.providerRightsDigest
  ) {
    errors.push(`FOREIGN_RELEASE_BINDING:${directory}`);
  }

  const startedAt = Date.parse(metadata.startedAt);
  const endedAt = Date.parse(metadata.endedAt);
  if (
    startedAt < Date.parse(candidate.builtAt) ||
    endedAt <= startedAt ||
    endedAt - startedAt < 1_200_000
  ) {
    errors.push(`PREBUILD_OR_SHORT_RUN:${directory}`);
  }
  if (
    startedAt > Date.parse(metadata.routeExpiresAt) ||
    startedAt > Date.parse(metadata.providerExpiresAt) ||
    metadata.routeExpiresAt !== candidate.routeExpiresAt ||
    metadata.providerExpiresAt !== candidate.providerExpiresAt
  ) {
    errors.push(`STALE_ROUTE_OR_PROVIDER:${directory}`);
  }
  if (
    (metadata.browserMode === "home-screen" &&
      (!supportsHomeScreenWakeLock(metadata.iosVersion) ||
        !metadata.wakeLockSupported ||
        !metadata.wakeLockSustained ||
        metadata.displayMode !== "standalone")) ||
    (metadata.browserMode === "safari" && metadata.displayMode !== "browser")
  ) {
    errors.push(`UNSUPPORTED_MODE:${directory}`);
  }

  const trace = (await readFile(path.join(runRoot, "trace.sha256"), "utf8")).trim();
  if (!hex64.safeParse(trace).success || trace !== metadata.traceSha256) {
    errors.push(`TRACE_DIGEST_MISMATCH:${directory}`);
  } else if (traceDigests.has(trace)) {
    errors.push(`REUSED_TRACE:${directory}`);
  } else {
    traceDigests.add(trace);
  }

  const checklist = await readFile(path.join(runRoot, "checklist.md"), "utf8");
  if (sha256(checklist) !== metadata.checklistSha256) {
    errors.push(`CHECKLIST_DIGEST_MISMATCH:${directory}`);
  }
  for (const gate of ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]) {
    if (!checklist.includes(`- [x] ${gate} PASS`))
      errors.push(`CHECKLIST_INCOMPLETE:${directory}:${gate}`);
  }
  if (
    !checklist.includes(`Signature SHA-256: ${metadata.testerAttestation.signatureSha256}`) ||
    !checklist.includes("Raw trace: private or discarded; never public")
  ) {
    errors.push(`CHECKLIST_ATTESTATION_INVALID:${directory}`);
  }

  const screenEntries = await directoryEntries(path.join(runRoot, "screens"));
  if (screenEntries.some((entry) => !entry.isFile())) {
    errors.push(`SCREEN_ARTIFACT_INVALID:${directory}`);
  }
  if (!(await screenManifestMatches(runRoot, screenEntries, metadata.screensSha256, sha256))) {
    errors.push(`SCREEN_MANIFEST_MISMATCH:${directory}`);
  }
  if (origin === "physical") {
    if (
      screenEntries.length === 0 ||
      screenEntries.some((entry) => !/^[A-Za-z0-9._-]+\.png$/.test(entry.name))
    ) {
      errors.push(`PHYSICAL_SCREENS_MISSING:${directory}`);
    }
  } else if (screenEntries.some((entry) => !/^[A-Za-z0-9._-]+\.(?:png|txt)$/.test(entry.name))) {
    errors.push(`SCREEN_ARTIFACT_INVALID:${directory}`);
  }
  if (verifyAttestation(metadata, trustedSigners, errors, directory)) {
    context.verifiedAttestations += 1;
  }
}

export async function validateEvidencePackage(input, options = {}) {
  const errors = [];
  const root = path.resolve(input);
  const evidenceBytes = await readFile(path.join(root, "evidence.json"));
  const evidenceResult = evidenceSchema.safeParse(JSON.parse(evidenceBytes.toString("utf8")));
  addZodErrors(errors, "EVIDENCE", evidenceResult);
  if (!evidenceResult.success) {
    return {
      evidenceOrigin: "unknown",
      errors,
    };
  }

  const evidence = evidenceResult.data;
  const required = requiredRunDirectories(evidence.releaseCandidate.buildSha);
  if (
    (evidence.evidenceOrigin === "physical" || evidence.runDirectories.length > 0) &&
    (evidence.runDirectories.length !== required.length ||
      [...evidence.runDirectories].sort().join("\n") !== [...required].sort().join("\n"))
  ) {
    errors.push("INCOMPLETE_RUN_MATRIX");
  }
  const rootEntries = await directoryEntries(root);
  const allowedRoot = new Set(["evidence.json", ...required]);
  if (
    rootEntries.some(
      (entry) =>
        !allowedRoot.has(entry.name) ||
        (entry.name === "evidence.json" ? !entry.isFile() : !entry.isDirectory()),
    )
  ) {
    errors.push("UNEXPECTED_ROOT_ARTIFACTS");
  }
  const traceDigests = new Set();
  const context = {
    root,
    directory: "",
    candidate: evidence.releaseCandidate,
    origin: evidence.evidenceOrigin,
    traceDigests,
    errors,
    trustedSigners: options.trustedSigners,
    verifiedAttestations: 0,
  };
  for (const directory of evidence.runDirectories) {
    if (!required.includes(directory)) {
      errors.push(`INVALID_RUN_DIRECTORY:${directory}`);
      continue;
    }
    try {
      context.directory = directory;
      await validateRun(context);
    } catch (error) {
      errors.push(`UNREADABLE_RUN:${directory}:${error instanceof Error ? error.name : "unknown"}`);
    }
  }

  return {
    evidenceOrigin: evidence.evidenceOrigin,
    releaseCandidate: evidence.releaseCandidate,
    evidenceSha256: sha256(evidenceBytes),
    physicalAttestationsVerified:
      evidence.evidenceOrigin === "physical" && context.verifiedAttestations === required.length,
    errors,
  };
}
