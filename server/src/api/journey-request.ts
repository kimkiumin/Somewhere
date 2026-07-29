import { validateMutationRequest } from "../security/request";
import { parseStrictBody } from "../security/schema";
import type { AuthenticatedSession, SessionService } from "../security/session";
import { hmacDigest } from "../security/tokens";
import { jsonResponse, publicError, type SliceErrorCode } from "./http-response";
import { type PreparedJourney, PreparedJourneySchema } from "./journey-composition";
import { type LifecycleSnapshot, projectLifecycleJourney } from "./journey-projection";
import { openForSession } from "./session-cipher";

export type JourneySnapshot = LifecycleSnapshot &
  Readonly<{
    expiresAt: number;
    phase: string;
    revealed: boolean;
    selectedSnapshot: Readonly<{
      createRequestDigest?: string;
      destinationSnapshotCiphertext: string;
      receiptDigest?: string;
      selectionReceiptId: string;
    }>;
    sequence: number;
  }>;

export type JourneyControllerDependencies = Readonly<{
  hmacKey: CryptoKey;
  now: () => number;
  sessionService: SessionService;
}>;

export async function projectSnapshot(
  snapshot: JourneySnapshot | undefined,
  session: AuthenticatedSession,
  status = 200,
): Promise<Response> {
  if (snapshot === undefined) {
    return publicError("not_found");
  }
  const prepared = await preparedFromSnapshot(snapshot, session);
  return jsonResponse(projectLifecycleJourney(prepared, snapshot), status);
}

export async function preparedFromSnapshot(
  snapshot: JourneySnapshot,
  session: AuthenticatedSession,
): Promise<PreparedJourney> {
  return PreparedJourneySchema.parse(
    await openForSession(
      snapshot.selectedSnapshot.destinationSnapshotCiphertext,
      session.sessionToken,
    ),
  );
}

export function authenticateMutation(
  request: Request,
  dependencies: JourneyControllerDependencies,
): Promise<AuthenticatedSession | undefined> {
  return dependencies.sessionService.authenticate(
    request.headers.get("cookie") ?? undefined,
    request.headers.get("x-csrf-token") ?? undefined,
    dependencies.now(),
  );
}

export async function parseMutationBody(
  request: Request,
  limit: number,
  allowedKeys: ReadonlySet<string>,
): Promise<
  | Readonly<{ body: string; value: Readonly<Record<string, unknown>> }>
  | Readonly<{ error: SliceErrorCode }>
> {
  const validation = await validateMutationRequest(request, requestPolicy(request), limit);
  if (typeof validation === "string") {
    return { error: validation };
  }
  if (limit === 0 && validation.body === "") {
    return { body: "", value: {} };
  }
  const parsed = parseStrictBody(validation.body, allowedKeys);
  return parsed.ok ? { body: validation.body, value: parsed.value } : { error: "invalid_request" };
}

export function authError(request: Request): Response {
  return request.headers.has("cookie")
    ? publicError("request_forbidden")
    : publicError("session_expired");
}

export function transitionError(kind: string): SliceErrorCode {
  if (kind === "idempotency_conflict") {
    return "idempotency_conflict";
  }
  if (kind === "sequence_conflict") {
    return "sequence_conflict";
  }
  if (kind === "expired") {
    return "journey_expired";
  }
  return "invalid_transition";
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deriveJourneyId(
  key: CryptoKey,
  bindingDigest: string,
  idempotencyKey: string,
): Promise<string> {
  const digest = await hmacDigest(key, `${bindingDigest}\0${idempotencyKey}`);
  return `j_v1.${Buffer.from(digest.slice(0, 32), "hex").toString("base64url")}`;
}

function requestPolicy(
  request: Request,
): Readonly<{ canonicalHost: string; canonicalOrigin: string }> {
  const url = new URL(request.url);
  return url.hostname === "127.0.0.1"
    ? { canonicalHost: "127.0.0.1:8787", canonicalOrigin: "http://127.0.0.1:8787" }
    : { canonicalHost: url.host, canonicalOrigin: url.origin };
}
