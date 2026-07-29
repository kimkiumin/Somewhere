import { D1HttpSessionRepository, loadSessionHmacKey } from "./api/d1-session";
import { handleFeedbackApi } from "./api/feedback-controller";
import { API_HEADERS, jsonResponse, methodNotAllowed, publicError } from "./api/http-response";
import { handleJourneyApi } from "./api/journey-controller";
import type { Database } from "./db/database";
import { validateSessionRequest } from "./security/request";
import { InMemorySessionRepository, SessionService } from "./security/session";
import { importHmacKey, randomBase64Url } from "./security/tokens";

export type HttpBoundaryDependencies = Readonly<{
  now: () => number;
  sessionService: SessionService;
}>;

export function handleRequest(
  request: Request,
  env?: Env,
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
    return handleSession(request, env, dependencies);
  }
  if (env !== undefined && pathname === "/api/v1/session") {
    return methodNotAllowed("GET");
  }
  if (env !== undefined && pathname.startsWith("/api/v1/journeys")) {
    return handleRuntimeJourney(request, env, dependencies);
  }
  if (env !== undefined && pathname.startsWith("/api/v1/feedback")) {
    return handleRuntimeFeedback(request, env, dependencies);
  }
  if (env !== undefined) {
    return publicError("not_found");
  }
  return new Response(JSON.stringify({ error: { code: "not_found" } }), {
    headers: API_HEADERS,
    status: 404,
  });
}

async function handleRuntimeFeedback(
  request: Request,
  env: Env,
  dependencies: HttpBoundaryDependencies | undefined,
): Promise<Response> {
  const key = await loadSessionHmacKey(env.DB);
  const response = await handleFeedbackApi(request, env, key, dependencies?.now() ?? Date.now());
  return response ?? publicError("not_found");
}

async function handleSession(
  request: Request,
  env: Env | undefined,
  dependencies: HttpBoundaryDependencies | undefined,
): Promise<Response> {
  const url = new URL(request.url);
  const requestPolicy =
    env?.ENVIRONMENT === "local"
      ? {
          canonicalHost: "127.0.0.1:8787",
          canonicalOrigin: "http://127.0.0.1:8787",
        }
      : {
          canonicalHost: url.host,
          canonicalOrigin: url.origin,
        };
  if (!validateSessionRequest(request, requestPolicy)) {
    return legacyPublicError(403, "request_forbidden");
  }
  const boundary =
    dependencies ??
    (env === undefined
      ? await createEphemeralDependencies()
      : await createRuntimeDependencies(env));
  const session = await boundary.sessionService.issueOrRefresh(
    request.headers.get("cookie") ?? undefined,
    boundary.now(),
  );
  return new Response(
    JSON.stringify({
      contractVersion: 1,
      csrfToken: session.csrfToken,
      csrfExpiresAt: session.csrfExpiresAt,
      sessionExpiresAt: session.expiresAt,
    }),
    {
      headers: { ...API_HEADERS, "set-cookie": session.cookie },
      status: 200,
    },
  );
}

async function handleRuntimeJourney(
  request: Request,
  env: Env,
  dependencies: HttpBoundaryDependencies | undefined,
): Promise<Response> {
  const boundary = dependencies ?? (await createRuntimeDependencies(env));
  const key = await loadSessionHmacKey(env.DB);
  const response = await handleJourneyApi(request, env, {
    hmacKey: key,
    now: boundary.now,
    sessionService: boundary.sessionService,
  });
  return response ?? publicError("not_found");
}

async function createRuntimeDependencies(env: Env): Promise<HttpBoundaryDependencies> {
  const key = await loadSessionHmacKey(env.DB);
  return {
    now: Date.now,
    sessionService: new SessionService(new D1HttpSessionRepository(env.DB satisfies Database), key),
  };
}

async function createEphemeralDependencies(): Promise<HttpBoundaryDependencies> {
  const key = await importHmacKey(crypto.getRandomValues(new Uint8Array(32)));
  return {
    now: Date.now,
    sessionService: new SessionService(new InMemorySessionRepository(), key),
  };
}

function legacyPublicError(status: number, code: string): Response {
  return jsonResponse(
    {
      contractVersion: 1,
      error: {
        code,
        message: "요청을 처리할 수 없어요.",
        requestId: `req_v1.${randomBase64Url(16)}`,
        retryable: false,
      },
    },
    status,
  );
}
