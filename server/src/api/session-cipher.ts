import { z } from "zod";

const SealedSchema = z
  .object({
    ciphertext: z.string().min(1),
    iv: z.string().min(1),
    version: z.literal(1),
  })
  .strict()
  .readonly();

async function keyFromSessionToken(sessionToken: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    Buffer.from(sessionToken, "base64url"),
    { name: "AES-GCM" },
    false,
    ["decrypt", "encrypt"],
  );
}

export async function sealForSession(value: unknown, sessionToken: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { iv, name: "AES-GCM" },
    await keyFromSessionToken(sessionToken),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    ciphertext: Buffer.from(ciphertext).toString("base64url"),
    iv: Buffer.from(iv).toString("base64url"),
    version: 1,
  });
}

export async function openForSession(value: string, sessionToken: string): Promise<unknown> {
  const sealed = SealedSchema.parse(JSON.parse(value));
  const plaintext = await crypto.subtle.decrypt(
    { iv: Buffer.from(sealed.iv, "base64url"), name: "AES-GCM" },
    await keyFromSessionToken(sessionToken),
    Buffer.from(sealed.ciphertext, "base64url"),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}
