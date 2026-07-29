import { validateSessionRequest } from "./security/request";
import { InMemorySessionRepository, SessionService } from "./security/session";
import { importHmacKey, randomBase64Url } from "./security/tokens";

const API_HEADERS = {
  "cache-control": "no-store, private",
  "content-type": "application/json; charset=utf-8",
} as const;

export type HttpBoundaryDependencies = Readonly<{
  now: () => number;
  sessionService: SessionService;
}>;

export function handleRequest(
  request: Request,
  dependencies?: HttpBoundaryDependencies,
): Response | Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/v1/health") {
    return new Response(JSON.stringify({ contractVersion: 1, status: "ok" }), {
      headers: API_HEADERS,
      status: 200,
    });
  }
  if (pathname === "/api/v1/session" && request.method === "GET") {
    return handleSession(request, dependencies);
  }
  return new Response(JSON.stringify({ error: { code: "not_found" } }), {
    headers: API_HEADERS,
    status: 404,
  });
}

async function handleSession(
  request: Request,
  dependencies: HttpBoundaryDependencies | undefined,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    !validateSessionRequest(request, {
      canonicalHost: url.host,
      canonicalOrigin: url.origin,
    })
  ) {
    return publicError(403, "request_forbidden");
  }
  const boundary = dependencies ?? (await createEphemeralDependencies());
  const session = await boundary.sessionService.issueOrRefresh(
    request.headers.get("cookie") ?? undefined,
    boundary.now(),
  );
  return new Response(
    JSON.stringify({
      contractVersion: 1,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    }),
    {
      headers: { ...API_HEADERS, "set-cookie": session.cookie },
      status: 200,
    },
  );
}

async function createEphemeralDependencies(): Promise<HttpBoundaryDependencies> {
  const key = await importHmacKey(crypto.getRandomValues(new Uint8Array(32)));
  return {
    now: Date.now,
    sessionService: new SessionService(new InMemorySessionRepository(), key),
  };
}

function publicError(status: number, code: string): Response {
  return new Response(
    JSON.stringify({
      contractVersion: 1,
      error: {
        code,
        message: "요청을 처리할 수 없어요.",
        requestId: `req_v1.${randomBase64Url(16)}`,
        retryable: false,
      },
    }),
    { headers: API_HEADERS, status },
  );
}
