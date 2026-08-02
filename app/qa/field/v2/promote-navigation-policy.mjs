import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateStudyADirectory } from "../../../../research/study-a/validate-study-a.mjs";
import { verifyEd25519Attestation } from "./attestation.mjs";
import { canonicalJson } from "./canonical-json.mjs";
import { candidateEnvelopeIssues } from "./navigation-policy-envelope.mjs";
import { calibrationStudySchema, navigationPolicySchema } from "./schemas.mjs";
import { resolvePinnedRegistry } from "./trusted-authority.mjs";

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new TypeError("arguments must be --name value pairs");
    }
    result.set(key, value);
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJsonAtomic(output, value) {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, output);
}

async function readStudy(input) {
  const direct = path.resolve(input);
  const candidate = direct.endsWith(".json") ? direct : path.join(direct, "study-a-evidence.json");
  return readFile(candidate);
}

function blockedReceipt(reason) {
  return {
    schemaVersion: 1,
    promotionGate: "BLOCK",
    rcCreated: false,
    reason,
  };
}

function promotedPolicy(candidate, parentSha256, evidenceSha256) {
  return {
    ...candidate,
    policyVersion: "navigation-v2-rc-1",
    status: "release-candidate",
    parentPolicyVersion: "navigation-v2-calibration-1",
    parentPolicySha256: parentSha256,
    calibrationEvidenceSha256: evidenceSha256,
  };
}

function verifySupervisor(session, trustedSupervisors) {
  const { supervisorAttestationSha256, supervisorKeyId, supervisorSignatureBase64, ...payload } =
    session;
  if (supervisorKeyId === undefined || supervisorSignatureBase64 === undefined) {
    throw new TypeError("SUPERVISOR_ATTESTATION_MISSING");
  }
  const error = verifyEd25519Attestation({
    trustedRegistry: trustedSupervisors,
    keyId: supervisorKeyId,
    signedAt: session.endedAt,
    signatureBase64: supervisorSignatureBase64,
    signatureSha256: supervisorAttestationSha256,
    payload: { ...payload, supervisorKeyId },
    sha256,
  });
  if (error !== null) throw new TypeError(`SUPERVISOR_${error}`);
}

async function promote(options) {
  const input = options.get("--input");
  const parentPath = options.get("--parent-policy");
  const outputPolicy = options.get("--output-policy");
  const receiptPath = options.get("--receipt");
  if (
    input === undefined ||
    parentPath === undefined ||
    outputPolicy === undefined ||
    receiptPath === undefined
  ) {
    throw new TypeError("required: --input --parent-policy --output-policy --receipt");
  }
  const receipt = path.resolve(receiptPath);
  try {
    await access(path.resolve(outputPolicy));
    throw new TypeError("RC_POLICY_ALREADY_EXISTS");
  } catch (error) {
    if (error instanceof TypeError) throw error;
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  let studyBytes;
  try {
    studyBytes = await readStudy(input);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      await writeJsonAtomic(receipt, blockedReceipt("STUDY_A_EVIDENCE_MISSING"));
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const parentBytes = await readFile(path.resolve(parentPath));
  const parent = navigationPolicySchema.parse(JSON.parse(parentBytes.toString("utf8")));
  if (
    parent.policyVersion !== "navigation-v2-calibration-1" ||
    parent.status !== "calibration-only"
  ) {
    throw new TypeError("PARENT_POLICY_NOT_CALIBRATION");
  }
  const study = calibrationStudySchema.parse(JSON.parse(studyBytes.toString("utf8")));
  const parentSha256 = sha256(parentBytes);
  const evidenceSha256 = sha256(studyBytes);
  const sessionIds = new Set();
  const traces = new Set();
  const attestations = new Set();
  const candidates = new Map();
  for (const session of study.sessions) {
    if (
      sessionIds.has(session.sessionId) ||
      traces.has(session.traceSha256) ||
      attestations.has(session.supervisorAttestationSha256)
    ) {
      throw new TypeError("REUSED_STUDY_A_EVIDENCE");
    }
    sessionIds.add(session.sessionId);
    traces.add(session.traceSha256);
    attestations.add(session.supervisorAttestationSha256);
    if (session.parentPolicySha256 !== parentSha256) {
      throw new TypeError("FOREIGN_PARENT_POLICY");
    }
    const candidateDigest = sha256(canonicalJson(session.candidatePolicy));
    if (candidateDigest !== session.candidatePolicySha256) {
      throw new TypeError("CANDIDATE_DIGEST_MISMATCH");
    }
    candidates.set(candidateDigest, session.candidatePolicy);
  }
  if (candidates.size !== 1) throw new TypeError("MULTIPLE_CANDIDATES");
  if (
    new Set(study.sessions.map((session) => session.environment)).size !== 2 ||
    new Set(study.sessions.map((session) => session.browserMode)).size !== 2 ||
    study.sessions.some(
      (session) => Date.parse(session.endedAt) - Date.parse(session.startedAt) < 1_200_000,
    )
  ) {
    throw new TypeError("INCOMPLETE_STUDY_A_MATRIX");
  }
  const candidateEntry = candidates.entries().next().value;
  if (candidateEntry === undefined) throw new TypeError("CANDIDATE_MISSING");
  const [candidateSha256, candidate] = candidateEntry;
  if (candidateEnvelopeIssues(candidate, parent).length > 0) {
    throw new TypeError("CANDIDATE_OUTSIDE_STUDY_A_ENVELOPE");
  }
  const authority = await resolvePinnedRegistry(
    options.get("--trusted-supervisors"),
    "somewhere-v2-study-a-supervision",
  );
  if (authority.state === "BLOCK") {
    await writeJsonAtomic(receipt, blockedReceipt(authority.reason));
    process.exitCode = 2;
    return;
  }
  for (const session of study.sessions) verifySupervisor(session, authority.registry);
  let expandedStudy;
  try {
    expandedStudy = await validateStudyADirectory({
      input,
      trustedSupervisors: authority.registry,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      await writeJsonAtomic(receipt, blockedReceipt("EXPANDED_STUDY_A_EVIDENCE_MISSING"));
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  if (
    expandedStudy.navigationGate !== "PASS" ||
    expandedStudy.rcPromotionEligible !== true ||
    expandedStudy.sessionCount !== study.sessions.length
  ) {
    throw new TypeError("EXPANDED_STUDY_A_NOT_PROMOTABLE");
  }
  if (
    expandedStudy.bindings.navigationPolicySha256 !== candidateSha256 ||
    expandedStudy.bindings.calibrationEvidenceSha256 !== evidenceSha256
  ) {
    throw new TypeError("EXPANDED_STUDY_A_BINDING_MISMATCH");
  }
  const policy = promotedPolicy(candidate, parentSha256, evidenceSha256);
  navigationPolicySchema.parse(policy);
  const output = path.resolve(outputPolicy);
  await writeJsonAtomic(output, policy);
  const policyBytes = await readFile(output);
  await writeJsonAtomic(receipt, {
    schemaVersion: 1,
    promotionGate: "PASS",
    status: "PENDING_COMMIT",
    rcCreated: true,
    policyVersion: "navigation-v2-rc-1",
    policySha256: sha256(policyBytes),
    parentPolicySha256: parentSha256,
    candidatePolicySha256: candidateSha256,
    calibrationEvidenceSha256: evidenceSha256,
    expandedStudyAAggregateSha256: expandedStudy.aggregateSha256,
    nativeBuildReceiptSha256: expandedStudy.bindings.nativeBuildReceiptSha256,
    pwaBuildReceiptSha256: expandedStudy.bindings.pwaBuildReceiptSha256,
    routeContractSha256: expandedStudy.bindings.routeContractSha256,
    providerConfigSha256: expandedStudy.bindings.providerConfigSha256,
    sessionSchemaSha256: expandedStudy.bindings.sessionSchemaSha256,
    aggregateSchemaSha256: expandedStudy.bindings.aggregateSchemaSha256,
    physicalGate: expandedStudy.physicalGate,
    sessionCount: study.sessions.length,
    unsafeEventCount: 0,
    supervisorRegistrySha256: authority.registrySha256,
    introducedBySha: null,
  });
}

async function finalize(options) {
  const receiptPath = path.resolve(options.get("--receipt") ?? "");
  const policyPath = path.resolve(options.get("--output-policy") ?? "");
  const introducedBySha = options.get("--finalize-sha");
  if (
    receiptPath === path.resolve("") ||
    policyPath === path.resolve("") ||
    introducedBySha === undefined ||
    !/^[a-f0-9]{40}$/.test(introducedBySha)
  ) {
    throw new TypeError("finalize requires --receipt --output-policy --finalize-sha");
  }
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const policyBytes = await readFile(policyPath);
  if (receipt.status !== "PENDING_COMMIT" || receipt.policySha256 !== sha256(policyBytes)) {
    throw new TypeError("PROMOTION_RECEIPT_MISMATCH");
  }
  await writeJsonAtomic(receiptPath, {
    ...receipt,
    status: "FINAL",
    introducedBySha,
    finalizedAt: new Date().toISOString(),
  });
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  try {
    if (options.has("--finalize-sha")) await finalize(options);
    else await promote(options);
  } catch (error) {
    const receipt = options.get("--receipt");
    if (receipt !== undefined) {
      await writeJsonAtomic(path.resolve(receipt), {
        schemaVersion: 1,
        promotionGate: "FAIL",
        rcCreated: false,
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
    }
    process.exitCode = 1;
  }
}

await main();
