import { D1HttpSessionRepository, loadSessionHmacKey } from "./api/d1-session";
import { handleFeedbackApi } from "./api/feedback-controller";
import { API_HEADERS, jsonResponse, methodNotAllowed, publicError } from "./api/http-response";
import { handleJourneyApi } from "./api/journey-controller";
import type { Database } from "./db/database";
import { OPERATIONS_SCHEMA } from "./operations/health";
import { OperationsHealthRepository } from "./operations/health-repository";
import { OperationsRuntimeControl } from "./operations/runtime-control";
import { localLoopbackRequestPolicy, validateSessionRequest } from "./security/request";
import { InMemorySessionRepository, SessionService } from "./security/session";
import { importHmacKey, randomBase64Url } from "./security/tokens";
import { handleV2LocalControl, v2RuntimeNow } from "./testing/v2-local-control";

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
  if (pathname === "/api/v1/operations/schema") {
    return request.method === "GET"
      ? jsonResponse(OPERATIONS_SCHEMA, 200)
      : methodNotAllowed("GET");
  }
  if (pathname === "/api/v1/operations/health") {
    return request.method === "GET"
      ? handleOperationsHealth(env, dependencies?.now() ?? Date.now())
      : methodNotAllowed("GET");
  }
  if (env !== undefined && pathname === "/api/test/v2-control") {
    return handleV2LocalControl(request, env.ENVIRONMENT, env.DB).then(
      (response) => response ?? publicError("not_found"),
    );
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

async function handleOperationsHealth(env: Env | undefined, now: number): Promise<Response> {
  if (env === undefined) {
    return jsonResponse(
      {
        ...OPERATIONS_SCHEMA,
        admissionState: "BOOT_BLOCKED",
        externalGates: "BLOCK",
        generatedAt: now,
        status: "blocked",
        writeEpoch: null,
        writeFenceMode: null,
      },
      200,
    );
  }
  const health = await new OperationsHealthRepository(env.DB satisfies Database).load(
    env.ENVIRONMENT,
    now,
  );
  return jsonResponse(health, 200);
}

async function handleRuntimeFeedback(
  request: Request,
  env: Env,
  dependencies: HttpBoundaryDependencies | undefined,
): Promise<Response> {
  const now = dependencies?.now() ?? v2RuntimeNow(env.ENVIRONMENT);
  const operations = await new OperationsRuntimeControl(env.DB satisfies Database).authorize(
    request,
    env.ENVIRONMENT,
    now,
  );
  if (!operations.allowed) {
    return publicError("service_unavailable");
  }
  const key = await loadSessionHmacKey(env.DB);
  const response = await handleFeedbackApi(request, env, key, now, operations.writeEpoch);
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
      ? (localLoopbackRequestPolicy(url) ?? {
          canonicalHost: "invalid.local",
          canonicalOrigin: "http://invalid.local",
        })
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
  const now = boundary.now();
  if (env !== undefined) {
    const boundSession = await boundary.sessionService.authenticateCookie(
      request.headers.get("cookie") ?? undefined,
      now,
    );
    const operations = await new OperationsRuntimeControl(env.DB satisfies Database).authorizeClass(
      boundSession === undefined ? "NEW_WORK" : "SAFETY_SERVER",
      request,
      env.ENVIRONMENT,
      now,
    );
    if (!operations.allowed) {
      return publicError("service_unavailable");
    }
  }
  const session = await boundary.sessionService.issueOrRefresh(
    request.headers.get("cookie") ?? undefined,
    now,
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
  const operations = await new OperationsRuntimeControl(env.DB satisfies Database).authorize(
    request,
    env.ENVIRONMENT,
    boundary.now(),
  );
  if (!operations.allowed) {
    return publicError("service_unavailable");
  }
  const key = await loadSessionHmacKey(env.DB);
  const response = await handleJourneyApi(request, env, {
    hmacKey: key,
    now: boundary.now,
    ...(operations.reserveNewWork === undefined
      ? {}
      : { reserveNewWork: operations.reserveNewWork }),
    sessionService: boundary.sessionService,
    writeEpoch: operations.writeEpoch,
  });
  return response ?? publicError("not_found");
}

async function createRuntimeDependencies(env: Env): Promise<HttpBoundaryDependencies> {
  const key = await loadSessionHmacKey(env.DB);
  return {
    now: () => v2RuntimeNow(env.ENVIRONMENT),
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
