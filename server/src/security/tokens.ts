export function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function isCanonicalToken(value: string, prefix: string, byteLength: number): boolean {
  const encodedLength = Math.ceil((byteLength * 8) / 6);
  if (!new RegExp(`^${prefix}\\.[A-Za-z0-9_-]{${encodedLength}}$`).test(value)) {
    return false;
  }
  const encoded = value.slice(prefix.length + 1);
  const decoded = Uint8Array.from(
    atob(
      encoded
        .replaceAll("-", "+")
        .replaceAll("_", "/")
        .padEnd(Math.ceil(encodedLength / 4) * 4, "="),
    ),
    (character) => character.charCodeAt(0),
  );
  return decoded.byteLength === byteLength;
}

export async function hmacDigest(secret: CryptoKey, value: string): Promise<string> {
  const digest = await crypto.subtle.sign("HMAC", secret, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", secret, { hash: "SHA-256", name: "HMAC" }, false, ["sign"]);
}
