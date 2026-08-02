import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
export const APP_PREFIX = "prepared/build/app/dist/";

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function canonicalBuildDigest(artifacts) {
  return sha256(
    Buffer.from(artifacts.map((item) => `${item.sha256}\t${item.bytes}\t${item.path}\0`).join("")),
  );
}

export async function validatePreparedReceipt(options) {
  const bytes = await readFile(options.buildReceipt);
  const receipt = JSON.parse(bytes.toString("utf8"));
  if (
    receipt.schemaVersion !== 2 ||
    receipt.finalSha !== options.sha ||
    receipt.sourceTree !== options.sourceTree ||
    !DIGEST.test(receipt.buildDigest) ||
    !Array.isArray(receipt.artifacts) ||
    !Number.isFinite(Date.parse(receipt.builtAt))
  ) {
    throw new TypeError("FOREIGN_BUILD_RECEIPT");
  }
  const receiptAge = Date.now() - Date.parse(receipt.builtAt);
  if (receiptAge < 0 || receiptAge > 30 * 60_000) {
    throw new TypeError("STALE_BUILD_RECEIPT");
  }
  const finalRoot = path.dirname(path.dirname(options.buildReceipt));
  const seen = new Set();
  for (const item of receipt.artifacts) {
    const absolute = path.resolve(finalRoot, item.path ?? "");
    if (
      typeof item.path !== "string" ||
      !DIGEST.test(item.sha256) ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes <= 0 ||
      seen.has(item.path) ||
      !absolute.startsWith(`${finalRoot}${path.sep}`)
    ) {
      throw new TypeError("FOREIGN_BUILD_RECEIPT");
    }
    seen.add(item.path);
    const artifactBytes = await readFile(absolute);
    if (artifactBytes.length !== item.bytes || sha256(artifactBytes) !== item.sha256) {
      throw new TypeError("FOREIGN_BUILD_RECEIPT");
    }
  }
  if (canonicalBuildDigest(receipt.artifacts) !== receipt.buildDigest) {
    throw new TypeError("FOREIGN_BUILD_RECEIPT");
  }
  const appArtifacts = receipt.artifacts.filter(
    (item) => item.kind === "app-asset" && item.path.startsWith(APP_PREFIX),
  );
  if (!appArtifacts.some((item) => item.path === `${APP_PREFIX}index.html`)) {
    throw new TypeError("FOREIGN_BUILD_RECEIPT");
  }
  return { appArtifacts, bytes, receipt };
}
