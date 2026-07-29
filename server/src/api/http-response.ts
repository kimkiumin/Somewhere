import { randomBase64Url } from "../security/tokens";

export const API_HEADERS = {
  "cache-control": "no-store, private",
  "content-type": "application/json; charset=utf-8",
} as const;

const ERROR_STATUS = {
  idempotency_conflict: 409,
  invalid_request: 400,
  invalid_transition: 409,
  journey_expired: 410,
  method_not_allowed: 405,
  no_fit: 422,
  not_found: 404,
  payload_too_large: 413,
  provider_unavailable: 503,
  request_forbidden: 403,
  route_unavailable: 503,
  schema_invalid: 422,
  sequence_conflict: 409,
  session_expired: 401,
  unsupported_media_type: 415,
} as const;

export type SliceErrorCode = keyof typeof ERROR_STATUS;

export function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    headers: { ...API_HEADERS, ...headers },
    status,
  });
}

export function publicError(code: SliceErrorCode): Response {
  const retryable = code === "provider_unavailable" || code === "route_unavailable";
  const error = {
    code,
    message: "요청을 처리할 수 없어요.",
    requestId: `req_v1.${randomBase64Url(16)}`,
    retryable,
    ...(retryable ? { retryAfterSeconds: 5 } : {}),
  };
  return jsonResponse(
    { contractVersion: 1, error },
    ERROR_STATUS[code],
    retryable ? { "retry-after": "5" } : undefined,
  );
}

export function methodNotAllowed(allow: string): Response {
  const response = publicError("method_not_allowed");
  response.headers.set("allow", allow);
  return response;
}
