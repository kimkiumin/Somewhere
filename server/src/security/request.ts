import type { DeploymentEnvironment } from "../environment";

export type RequestPolicy =
  | Readonly<{
      canonicalHost: string;
      canonicalOrigin: string;
      kind: "valid";
    }>
  | Readonly<{ kind: "invalid" }>;

export function localLoopbackRequestPolicy(url: URL): RequestPolicy | undefined {
  const port = Number(url.port);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.hostname !== "127.0.0.1" ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65_535
  ) {
    return undefined;
  }
  return { canonicalHost: url.host, canonicalOrigin: url.origin, kind: "valid" };
}

export function requestPolicyForEnvironment(
  url: URL,
  environment: DeploymentEnvironment,
  canonicalOrigin: string | undefined,
): RequestPolicy {
  if (environment === "local") {
    return localLoopbackRequestPolicy(url) ?? { kind: "invalid" };
  }
  if (canonicalOrigin === undefined) {
    return { kind: "invalid" };
  }
  try {
    const parsed = new URL(canonicalOrigin);
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.origin === canonicalOrigin
      ? {
          canonicalHost: parsed.host,
          canonicalOrigin: parsed.origin,
          kind: "valid",
        }
      : { kind: "invalid" };
  } catch (error) {
    if (error instanceof TypeError) {
      return { kind: "invalid" };
    }
    throw error;
  }
}

export type RequestRejection =
  | "request_forbidden"
  | "payload_too_large"
  | "unsupported_media_type"
  | "invalid_request";

export async function validateMutationRequest(
  request: Request,
  policy: RequestPolicy,
  bodyLimitBytes: number,
): Promise<Readonly<{ body: string }> | RequestRejection> {
  if (
    policy.kind !== "valid" ||
    request.headers.get("host") !== policy.canonicalHost ||
    request.headers.get("origin") !== policy.canonicalOrigin ||
    (request.headers.has("sec-fetch-site") &&
      request.headers.get("sec-fetch-site") !== "same-origin")
  ) {
    return "request_forbidden";
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(contentLength) || Number(contentLength) > bodyLimitBytes)
  ) {
    return "payload_too_large";
  }
  if (request.headers.get("content-type") !== "application/json") {
    return "unsupported_media_type";
  }
  const reader = request.body?.getReader();
  if (reader === undefined) {
    return { body: "" };
  }
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    bytesRead += chunk.value.byteLength;
    if (bytesRead > bodyLimitBytes) {
      await reader.cancel();
      return "payload_too_large";
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes) };
  } catch (error) {
    if (error instanceof TypeError) {
      return "invalid_request";
    }
    throw error;
  }
}

export function validateSessionRequest(request: Request, policy: RequestPolicy): boolean {
  if (
    policy.kind !== "valid" ||
    request.headers.get("host") !== policy.canonicalHost ||
    request.method !== "GET"
  ) {
    return false;
  }
  const origin = request.headers.get("origin");
  if (origin !== null) {
    return (
      origin === policy.canonicalOrigin &&
      (!request.headers.has("sec-fetch-site") ||
        request.headers.get("sec-fetch-site") === "same-origin")
    );
  }
  return (
    request.headers.get("sec-fetch-site") === "same-origin" &&
    request.headers.get("sec-fetch-mode") === "cors" &&
    request.headers.get("sec-fetch-dest") === "empty" &&
    isExactOriginReferer(request.headers.get("referer"), policy.canonicalOrigin)
  );
}

function isExactOriginReferer(referer: string | null, canonicalOrigin: string): boolean {
  if (referer === null) {
    return false;
  }
  try {
    return new URL(referer).origin === canonicalOrigin;
  } catch {
    return false;
  }
}
