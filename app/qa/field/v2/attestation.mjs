import { verify } from "node:crypto";
import { canonicalJson } from "./canonical-json.mjs";

export function verifyEd25519Attestation(input) {
  const signer = input.trustedRegistry.signers.find((entry) => entry.keyId === input.keyId);
  if (signer === undefined) return "UNTRUSTED_SIGNER";
  const signedAt = Date.parse(input.signedAt);
  if (signedAt < Date.parse(signer.validFrom) || signedAt > Date.parse(signer.validUntil)) {
    return "SIGNER_OUTSIDE_VALIDITY";
  }
  const signature = Buffer.from(input.signatureBase64, "base64");
  if (input.sha256(signature) !== input.signatureSha256) {
    return "ATTESTATION_DIGEST_MISMATCH";
  }
  return verify(null, Buffer.from(canonicalJson(input.payload)), signer.publicKeyPem, signature)
    ? null
    : "ATTESTATION_SIGNATURE_INVALID";
}
