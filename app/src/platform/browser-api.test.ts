import { PROJECTION_EXAMPLES_V1 } from "@somewhere/contracts";
import { describe, expect, test } from "vitest";
import { V2ApiError, V2ProtocolError } from "../application/v2-api";
import { createBrowserIdempotencyKeySource, createBrowserV2Api } from "./browser-api";

const SESSION = {
  contractVersion: 1,
  csrfToken: `csrf_v1.${"A".repeat(43)}`,
  csrfExpiresAt: 20_000,
  sessionExpiresAt: 30_000,
};

function projection(phase: string) {
  const found = PROJECTION_EXAMPLES_V1.find((candidate) => candidate.phase === phase);
  if (found === undefined) {
    throw new TypeError(`Missing ${phase} projection fixture`);
  }
  return found;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status,
  });
}

describe("browser V2 API boundary", () => {
  test("uses volatile CSRF with same-origin credentials and exact mutation controls", async () => {
    const requests: Array<Readonly<{ input: string; init: RequestInit }>> = [];
    const responses = [
      json(SESSION),
      json(projection("ready"), 201),
      json(projection("committed")),
    ];
    const api = createBrowserV2Api({
      fetchRequest: async (input, init) => {
        requests.push({ input, init });
        const response = responses.shift();
        if (response === undefined) {
          throw new TypeError("Unexpected request");
        }
        return response;
      },
      now: () => 1_000,
    });

    const created = await api.createJourney(
      {
        contractVersion: 1,
        constraints: {
          accessibility: [],
          allergies: [],
          budgetBand: "medium",
          category: "cafe",
          dietary: [],
          maxWalkMinutes: 20,
        },
        disclosureLevel: "standard",
        origin: { accuracyM: 8, capturedAt: 1_000, latitude: 37.5, longitude: 127 },
        recoveryCapability: null,
      },
      `ik_v1.${"A".repeat(43)}`,
    );
    await api.mutateJourney(created.journeyId, created.sequence, `ik_v1.${"B".repeat(43)}`, {
      action: "commit",
      body: { contractVersion: 1 },
    });

    expect(requests.map((request) => request.input)).toEqual([
      "/api/v1/session",
      "/api/v1/journeys",
      `/api/v1/journeys/${created.journeyId}/commit`,
    ]);
    expect(requests.every((request) => request.init.credentials === "same-origin")).toBe(true);
    expect(requests.every((request) => request.init.cache === "no-store")).toBe(true);
    const mutationHeaders = new Headers(requests[2]?.init.headers);
    expect(mutationHeaders.get("x-csrf-token")).toBe(SESSION.csrfToken);
    expect(mutationHeaders.get("x-expected-sequence")).toBe(String(created.sequence));
    expect(mutationHeaders.get("idempotency-key")).toBe(`ik_v1.${"B".repeat(43)}`);
    expect(mutationHeaders.has("authorization")).toBe(false);
  });

  test("confines a feedback bearer to cookieless feedback requests", async () => {
    const calls: RequestInit[] = [];
    const api = createBrowserV2Api({
      fetchRequest: async (_input, init) => {
        calls.push(init);
        return new Response(null, { headers: { "cache-control": "no-store" }, status: 204 });
      },
    });

    await api.eligibleFeedback(`fb_v1.${"A".repeat(43)}`);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.credentials).toBe("omit");
    expect(new Headers(calls[0]?.headers).get("authorization")).toBe(
      `Feedback fb_v1.${"A".repeat(43)}`,
    );
    expect(new Headers(calls[0]?.headers).has("cookie")).toBe(false);
  });

  test("fails closed on malformed or leaking projections", async () => {
    const api = createBrowserV2Api({
      fetchRequest: async () => json({ ...projection("ready"), secretVenue: "leak" }),
    });

    await expect(api.getJourney(projection("ready").journeyId)).rejects.toBeInstanceOf(
      V2ProtocolError,
    );
  });

  test("rejects duplicate JSON keys before schema validation", async () => {
    const api = createBrowserV2Api({
      fetchRequest: async () =>
        new Response(
          `{"contractVersion":1,"journeyId":"j_v1.AAAAAAAAAAAAAAAAAAAAAA","sequence":1,"phase":"expired","phase":"ready","actions":[]}`,
          { headers: { "cache-control": "no-store" } },
        ),
    });

    await expect(api.getJourney(projection("ready").journeyId)).rejects.toThrow("DUPLICATE_KEY");
  });

  test("maps strict retryable public errors without losing retry metadata", async () => {
    const api = createBrowserV2Api({
      fetchRequest: async () =>
        json(
          {
            contractVersion: 1,
            error: {
              code: "service_unavailable",
              message: "잠시 후 다시 시도해 주세요.",
              requestId: `req_v1.${"A".repeat(22)}`,
              retryable: true,
              retryAfterSeconds: 5,
            },
          },
          503,
        ),
    });

    const failure = await api
      .getJourney(projection("ready").journeyId)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(V2ApiError);
    expect(failure).toMatchObject({
      code: "service_unavailable",
      retryable: true,
      retryAfterSeconds: 5,
      status: 503,
    });
  });

  test("creates canonical 256-bit idempotency keys", () => {
    const source = createBrowserIdempotencyKeySource({
      getRandomValues(array) {
        array.fill(255);
        return array;
      },
    });

    expect(source.next()).toMatch(/^ik_v1\.[A-Za-z0-9_-]{43}$/);
  });
});
