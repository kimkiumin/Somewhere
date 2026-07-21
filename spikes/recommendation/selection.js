"use strict";

const crypto = require("node:crypto");

const REQUIRED_METADATA_FIELDS = [
  "requestId",
  "provider",
  "providerQueryVersion",
  "paginationVersion",
  "coverageVersion",
  "canonicalizationVersion",
  "ruleVersion",
  "modelVersion",
  "promptVersion",
  "evidencePolicyVersion",
  "snapshotTimestamp",
];

const UINT32_RANGE = 0x100000000;

function digestIds(ids) {
  return crypto.createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}

function defaultUint32() {
  return crypto.randomBytes(4).readUInt32BE(0);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSnapshotTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    return false;
  }

  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return false;

  const normalizedValue = value.includes(".") ? value : value.replace("Z", ".000Z");
  return timestamp.toISOString() === normalizedValue;
}

function validateMetadata(metadata) {
  if (!isPlainObject(metadata)) throw new TypeError("metadata must be an object");

  const receiptMetadata = {};
  for (const field of REQUIRED_METADATA_FIELDS) {
    const value = metadata[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`metadata.${field} must be a non-empty string`);
    }
    receiptMetadata[field] = value;
  }

  if (!isSnapshotTimestamp(receiptMetadata.snapshotTimestamp)) {
    throw new TypeError("metadata.snapshotTimestamp must be an ISO UTC timestamp");
  }

  return receiptMetadata;
}

function compareCanonicalIds(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;

  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key], seen);
  }
  return Object.freeze(value);
}

function createFrozenSnapshot(candidate) {
  try {
    return deepFreeze(structuredClone(candidate));
  } catch {
    throw new TypeError("candidate must be deep-cloneable and immutable");
  }
}

function validateAndOrderCandidates(candidates) {
  if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");

  const ids = new Set();
  const ordered = candidates.map((candidate) => {
    if (!isPlainObject(candidate)) {
      throw new TypeError("candidate must be an object with canonicalVenueId");
    }

    const id = candidate.canonicalVenueId;
    if (typeof id !== "string" || id === "" || id.trim() !== id) {
      throw new TypeError("candidate.canonicalVenueId must be a non-empty canonical string");
    }
    if (ids.has(id)) throw new TypeError("candidate.canonicalVenueId must be unique");

    ids.add(id);
    return createFrozenSnapshot(candidate);
  });

  return ordered.sort((left, right) => compareCanonicalIds(
    left.canonicalVenueId,
    right.canonicalVenueId,
  ));
}

function drawUniformIndex(poolSize, nextUint32) {
  if (!Number.isInteger(poolSize) || poolSize <= 0 || poolSize > UINT32_RANGE) {
    throw new RangeError("poolSize must be a positive integer no larger than uint32 range");
  }
  if (typeof nextUint32 !== "function") throw new TypeError("nextUint32 must be a function");

  const acceptanceLimit = Math.floor(UINT32_RANGE / poolSize) * poolSize;
  const rawDraws = [];
  while (true) {
    const raw = nextUint32();
    if (!Number.isInteger(raw) || raw < 0 || raw >= UINT32_RANGE) {
      throw new TypeError("nextUint32 must return a uint32");
    }

    rawDraws.push(raw);
    if (raw < acceptanceLimit) {
      return { selectedIndex: raw % poolSize, rawDraws };
    }
  }
}

function normalizeFinalValidation(finalValidate, candidate) {
  try {
    const result = finalValidate(candidate);
    if (
      !isPlainObject(result) ||
      typeof result.pass !== "boolean" ||
      !Array.isArray(result.reasons) ||
      !result.reasons.every((reason) => typeof reason === "string" && reason.trim() !== "")
    ) {
      return { pass: false, reasons: ["final-validation-malformed"] };
    }

    return { pass: result.pass, reasons: [...result.reasons] };
  } catch {
    return { pass: false, reasons: ["final-validation-threw"] };
  }
}

function selectUniformly(
  candidates,
  metadata,
  nextUint32 = defaultUint32,
  finalValidate = () => ({ pass: true, reasons: [] }),
) {
  if (typeof finalValidate !== "function") throw new TypeError("finalValidate must be a function");

  const receiptMetadata = validateMetadata(metadata);
  const ordered = validateAndOrderCandidates(candidates);
  const pool = [...ordered];
  const receipt = {
    ...receiptMetadata,
    rngAlgorithm: "uint32-rejection-v1",
    qualifiedPoolSize: ordered.length,
    orderedQualifiedSetDigest: digestIds(ordered.map((candidate) => candidate.canonicalVenueId)),
    attempts: [],
  };

  while (pool.length > 0) {
    const { selectedIndex, rawDraws } = drawUniformIndex(pool.length, nextUint32);
    const candidate = pool[selectedIndex];
    const selectedCanonicalVenueId = candidate.canonicalVenueId;
    const finalValidation = normalizeFinalValidation(finalValidate, candidate);

    receipt.attempts.push({
      rawDraws,
      remainingPoolSize: pool.length,
      selectedIndex,
      selectedCanonicalVenueId,
      finalValidation,
    });

    if (finalValidation.pass) return { selected: candidate, receipt };
    pool.splice(selectedIndex, 1);
  }

  return { selected: null, receipt: { ...receipt, noFit: true } };
}

module.exports = {
  digestIds,
  drawUniformIndex,
  selectUniformly,
};
