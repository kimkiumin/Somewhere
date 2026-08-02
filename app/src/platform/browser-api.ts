import {
  ArrivalMutationResponseV1Schema,
  FeedbackPromptV1Schema,
  JourneyProjectionV1Schema,
  parseStrictJsonV1,
  ReactionRecordedV1Schema,
} from "@somewhere/contracts";
import type { z } from "zod";
import {
  apiErrorFrom,
  createIdempotencyKeySource,
  type IdempotencyKeySource,
  type JourneyMutation,
  type JourneyMutationResult,
  mutationPath,
  RecoveryGrantSchema,
  RecoveryIntentSchema,
  type V2Api,
  V2ProtocolError,
  type V2Session,
  V2SessionSchema,
} from "../application/v2-api";

type FetchRequest = (input: string, init: RequestInit) => Promise<Response>;

export type BrowserV2ApiOptions = Readonly<{
  fetchRequest?: FetchRequest;
  now?: () => number;
}>;

export interface RandomValuesSource {
  getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
}

export function createBrowserIdempotencyKeySource(
  cryptoSource: RandomValuesSource = {
    getRandomValues: (array) => crypto.getRandomValues(array),
  },
): IdempotencyKeySource {
  return createIdempotencyKeySource(() => cryptoSource.getRandomValues(new Uint8Array(32)));
}

export function createBrowserV2Api(options: BrowserV2ApiOptions = {}): V2Api {
  const fetchRequest = options.fetchRequest ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  let session: V2Session | null = null;

  async function bootstrapSession(): Promise<V2Session> {
    const parsed = await requestJson(
      fetchRequest,
      "/api/v1/session",
      { method: "GET" },
      V2SessionSchema,
      "journey",
    );
    session = parsed;
    return parsed;
  }

  async function mutationHeaders(
    expectedSequence: number | undefined,
    idempotencyKey: string,
  ): Promise<Headers> {
    if (session === null || session.csrfExpiresAt <= now() || session.sessionExpiresAt <= now()) {
      await bootstrapSession();
    }
    if (session === null) {
      throw new V2ProtocolError("Session bootstrap did not produce a session");
    }
    const headers = new Headers({
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-csrf-token": session.csrfToken,
    });
    if (expectedSequence !== undefined) {
      headers.set("x-expected-sequence", String(expectedSequence));
    }
    return headers;
  }

  async function mutateJourney(
    journeyId: string,
    expectedSequence: number,
    idempotencyKey: string,
    mutation: JourneyMutation,
  ): Promise<JourneyMutationResult> {
    const response = await request(
      fetchRequest,
      `/api/v1/journeys/${encodeURIComponent(journeyId)}/${mutationPath(mutation.action)}`,
      {
        body: JSON.stringify(mutation.body),
        headers: await mutationHeaders(expectedSequence, idempotencyKey),
        method: "POST",
      },
      "journey",
    );
    const value = await parseUnknownJson(response);
    const arrival = ArrivalMutationResponseV1Schema.safeParse(value);
    if (arrival.success) {
      return { kind: "arrival", response: arrival.data };
    }
    const projection = JourneyProjectionV1Schema.safeParse(value);
    if (projection.success) {
      return { kind: "projection", projection: projection.data };
    }
    throw new V2ProtocolError("Journey mutation returned an invalid contract");
  }

  return {
    bootstrapSession,
    clearVolatile() {
      session = null;
    },
    async createJourney(body, idempotencyKey) {
      return requestJson(
        fetchRequest,
        "/api/v1/journeys",
        {
          body: JSON.stringify(body),
          headers: await mutationHeaders(undefined, idempotencyKey),
          method: "POST",
        },
        JourneyProjectionV1Schema,
        "journey",
      );
    },
    getJourney(journeyId) {
      return requestJson(
        fetchRequest,
        `/api/v1/journeys/${encodeURIComponent(journeyId)}`,
        { method: "GET" },
        JourneyProjectionV1Schema,
        "journey",
      );
    },
    mutateJourney,
    async deleteJourney(journeyId, expectedSequence, idempotencyKey) {
      const response = await request(
        fetchRequest,
        `/api/v1/journeys/${encodeURIComponent(journeyId)}`,
        {
          headers: await mutationHeaders(expectedSequence, idempotencyKey),
          method: "DELETE",
        },
        "journey",
      );
      if (response.status !== 204) {
        throw new V2ProtocolError("Journey deletion did not return 204");
      }
    },
    async requestRecovery(journeyId, expectedSequence, idempotencyKey) {
      return requestJson(
        fetchRequest,
        `/api/v1/journeys/${encodeURIComponent(journeyId)}/recovery`,
        {
          body: JSON.stringify({ action: "new-recommendation", contractVersion: 1 }),
          headers: await mutationHeaders(expectedSequence, idempotencyKey),
          method: "POST",
        },
        RecoveryIntentSchema,
        "journey",
      );
    },
    async confirmRecovery(journeyId, expectedSequence, idempotencyKey, input) {
      return requestJson(
        fetchRequest,
        `/api/v1/journeys/${encodeURIComponent(journeyId)}/recovery/confirm`,
        {
          body: JSON.stringify({ ...input, contractVersion: 1 }),
          headers: await mutationHeaders(expectedSequence, idempotencyKey),
          method: "POST",
        },
        RecoveryGrantSchema,
        "journey",
      );
    },
    async eligibleFeedback(feedbackCapability) {
      const path = "/api/v1/feedback/eligible";
      const response = await request(
        fetchRequest,
        path,
        { headers: { authorization: `Feedback ${feedbackCapability}` }, method: "GET" },
        "feedback",
      );
      if (response.status === 204) {
        return null;
      }
      const parsed = FeedbackPromptV1Schema.safeParse(await parseUnknownJson(response));
      if (!parsed.success) {
        throw new V2ProtocolError(`${path} returned an invalid contract`);
      }
      return parsed.data;
    },
    recordReaction(feedbackCapability, feedbackId, idempotencyKey, body) {
      return requestJson(
        fetchRequest,
        `/api/v1/feedback/${encodeURIComponent(feedbackId)}/reaction`,
        {
          body: JSON.stringify(body),
          headers: {
            authorization: `Feedback ${feedbackCapability}`,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          method: "POST",
        },
        ReactionRecordedV1Schema,
        "feedback",
      );
    },
  };
}

async function requestJson<T>(
  fetchRequest: FetchRequest,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  scope: "journey" | "feedback",
): Promise<T> {
  const response = await request(fetchRequest, path, init, scope);
  const parsed = schema.safeParse(await parseUnknownJson(response));
  if (!parsed.success) {
    throw new V2ProtocolError(`${path} returned an invalid contract`);
  }
  return parsed.data;
}

async function request(
  fetchRequest: FetchRequest,
  path: string,
  init: RequestInit,
  scope: "journey" | "feedback",
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  if (scope === "journey" && headers.has("authorization")) {
    throw new V2ProtocolError("Feedback capability cannot authorize a journey request");
  }
  const response = await fetchRequest(path, {
    ...init,
    cache: "no-store",
    credentials: scope === "journey" ? "same-origin" : "omit",
    headers,
  });
  if (response.ok) {
    return response;
  }
  throw apiErrorFrom(response.status, await parseUnknownJson(response));
}

async function parseUnknownJson(response: Response): Promise<unknown> {
  const parsed = parseStrictJsonV1(await response.text());
  if (!parsed.ok) {
    throw new V2ProtocolError(`API returned unsafe JSON: ${parsed.code}`);
  }
  return parsed.value;
}
