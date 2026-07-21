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

  const metadataSnapshot = cloneJsonDto(metadata, "metadata");
  const receiptMetadata = {};
  for (const field of REQUIRED_METADATA_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(metadataSnapshot, field);
    const value = descriptor?.value;
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`metadata.${field} must be a non-empty string`);
    }
    Object.defineProperty(receiptMetadata, field, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
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

function rejectNonJsonDto(name) {
  throw new TypeError(`${name} must be recursively JSON-like`);
}

function cloneJsonDto(value, name, ancestors = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) rejectNonJsonDto(name);
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) rejectNonJsonDto(name);

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) rejectNonJsonDto(name);
    const propertyNames = Object.getOwnPropertyNames(value);
    if (propertyNames.length !== value.length + 1 || !propertyNames.includes("length")) {
      rejectNonJsonDto(name);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) rejectNonJsonDto(name);

    ancestors.add(value);
    const clone = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        rejectNonJsonDto(name);
      }
      Object.defineProperty(clone, String(index), {
        value: cloneJsonDto(descriptor.value, name, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    ancestors.delete(value);
    return clone;
  }

  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    rejectNonJsonDto(name);
  }

  ancestors.add(value);
  const clone = Object.create(Object.getPrototypeOf(value));
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      rejectNonJsonDto(name);
    }
    Object.defineProperty(clone, key, {
      value: cloneJsonDto(descriptor.value, name, ancestors),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  ancestors.delete(value);
  return clone;
}

function jsonDtosEqual(left, right) {
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return Object.is(left, right);
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => {
    if (!Object.hasOwn(right, key)) return false;
    const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
    const rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
    return jsonDtosEqual(leftDescriptor.value, rightDescriptor.value);
  });
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;

  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key], seen);
  }
  return Object.freeze(value);
}

function createCandidateSnapshot(candidate) {
  return deepFreeze(cloneJsonDto(candidate, "candidate"));
}

function validateAndOrderCandidates(candidates) {
  if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");

  const ids = new Set();
  const ordered = candidates.map((candidate) => {
    const snapshot = createCandidateSnapshot(candidate);
    const id = Object.getOwnPropertyDescriptor(snapshot, "canonicalVenueId")?.value;
    if (typeof id !== "string" || id === "" || id.trim() !== id) {
      throw new TypeError("candidate.canonicalVenueId must be a non-empty canonical string");
    }
    if (ids.has(id)) throw new TypeError("candidate.canonicalVenueId must be unique");

    ids.add(id);
    return snapshot;
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
    const validationCandidate = cloneJsonDto(candidate, "candidate");
    const result = finalValidate(validationCandidate);
    const sanitizedCandidate = cloneJsonDto(validationCandidate, "candidate");
    if (!jsonDtosEqual(sanitizedCandidate, candidate)) {
      return { pass: false, reasons: ["final-validation-threw"] };
    }

    const validationSnapshot = cloneJsonDto(result, "final validation result");
    const passDescriptor = Object.getOwnPropertyDescriptor(validationSnapshot, "pass");
    const reasonsDescriptor = Object.getOwnPropertyDescriptor(validationSnapshot, "reasons");
    if (
      !isPlainObject(validationSnapshot) ||
      !passDescriptor ||
      !("value" in passDescriptor) ||
      typeof passDescriptor.value !== "boolean" ||
      !reasonsDescriptor ||
      !("value" in reasonsDescriptor) ||
      !Array.isArray(reasonsDescriptor.value) ||
      !reasonsDescriptor.value.every(
        (reason) => typeof reason === "string" && reason.trim() !== "",
      )
    ) {
      return { pass: false, reasons: ["final-validation-malformed"] };
    }

    return { pass: passDescriptor.value, reasons: [...reasonsDescriptor.value] };
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
    const finalValidation = normalizeFinalValidation(
      finalValidate,
      candidate,
    );

    receipt.attempts.push({
      rawDraws,
      remainingPoolSize: pool.length,
      selectedIndex,
      selectedCanonicalVenueId,
      finalValidation,
    });

    if (finalValidation.pass) return { selected: candidate, receipt: deepFreeze(receipt) };
    pool.splice(selectedIndex, 1);
  }

  receipt.noFit = true;
  return { selected: null, receipt: deepFreeze(receipt) };
}

module.exports = {
  digestIds,
  drawUniformIndex,
  selectUniformly,
};
