import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { hex64 } from "./schemas.mjs";

const authorityPinsPath = fileURLToPath(new URL("./authority-pins.json", import.meta.url));
const isoDateTime = z.iso.datetime({ offset: true });

const trustedSignerRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.enum(["somewhere-v2-field-release", "somewhere-v2-study-a-supervision"]),
    signers: z
      .array(
        z
          .object({
            keyId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
            publicKeyPem: z.string().startsWith("-----BEGIN PUBLIC KEY-----"),
            validFrom: isoDateTime,
            validUntil: isoDateTime,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const authorityPinsSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(["BLOCK", "ACTIVE"]),
    fieldReleaseRegistrySha256: hex64.nullable(),
    studyASupervisorRegistrySha256: hex64.nullable(),
  })
  .strict()
  .superRefine((pins, context) => {
    if (
      pins.status === "ACTIVE" &&
      (pins.fieldReleaseRegistrySha256 === null || pins.studyASupervisorRegistrySha256 === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "active authority policy requires both registry digests",
      });
    }
  });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readAuthorityPins() {
  return authorityPinsSchema.parse(JSON.parse(await readFile(authorityPinsPath, "utf8")));
}

export async function resolvePinnedRegistry(registryPath, purpose, pins = undefined) {
  const authority = pins ?? (await readAuthorityPins());
  const pin =
    purpose === "somewhere-v2-field-release"
      ? authority.fieldReleaseRegistrySha256
      : authority.studyASupervisorRegistrySha256;
  if (authority.status !== "ACTIVE" || pin === null) {
    return {
      state: "BLOCK",
      reason:
        purpose === "somewhere-v2-field-release"
          ? "FIELD_RELEASE_AUTHORITY_NOT_PINNED"
          : "STUDY_A_AUTHORITY_NOT_PINNED",
    };
  }
  if (registryPath === undefined) {
    return {
      state: "BLOCK",
      reason:
        purpose === "somewhere-v2-field-release"
          ? "TRUSTED_FIELD_SIGNERS_MISSING"
          : "TRUSTED_STUDY_A_SUPERVISION_MISSING",
    };
  }
  const registryBytes = await readFile(registryPath);
  if (sha256(registryBytes) !== pin) throw new TypeError("TRUSTED_REGISTRY_DIGEST_MISMATCH");
  const registry = trustedSignerRegistrySchema.parse(JSON.parse(registryBytes.toString("utf8")));
  if (registry.purpose !== purpose) throw new TypeError("WRONG_SIGNER_REGISTRY_PURPOSE");
  return { state: "READY", registry, registrySha256: pin };
}
