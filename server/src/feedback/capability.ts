import { hmacDigest, isCanonicalToken, randomBase64Url } from "../security/tokens";

export type IssuedFeedbackCapability = Readonly<{
  digest: string;
  feedbackId: string;
  raw: string;
}>;

export async function issueFeedbackCapability(key: CryptoKey): Promise<IssuedFeedbackCapability> {
  const raw = `fb_v1.${randomBase64Url(32)}`;
  return describeFeedbackCapability(raw, key);
}

export async function describeFeedbackCapability(
  raw: string,
  key: CryptoKey,
): Promise<IssuedFeedbackCapability> {
  const digest = await hmacDigest(key, raw);
  return {
    digest,
    feedbackId: `fid_v1.${Buffer.from(digest.slice(0, 32), "hex").toString("base64url")}`,
    raw,
  };
}

export async function authorizeFeedbackCapability(
  authorization: string | null,
  key: CryptoKey,
): Promise<string | undefined> {
  if (authorization === null || !authorization.startsWith("Feedback ")) {
    return undefined;
  }
  const raw = authorization.slice("Feedback ".length);
  if (!isCanonicalToken(raw, "fb_v1", 32)) {
    return undefined;
  }
  return hmacDigest(key, raw);
}
