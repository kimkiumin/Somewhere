import { describe, expect, it } from "vitest";

import { InMemoryObjectAuthorizer } from "../src/security/authorization";
import {
  requestPolicyForEnvironment,
  validateMutationRequest,
  validateSessionRequest,
} from "../src/security/request";
import { parseStrictBody } from "../src/security/schema";

const POLICY = {
  canonicalHost: "example.test",
  canonicalOrigin: "https://example.test",
  kind: "valid",
} as const;

function mutation(headers: Readonly<Record<string, string>>, body = "{}"): Request {
  return mutationAt("https://example.test", headers, body);
}

function mutationAt(
  origin: string,
  headers: Readonly<Record<string, string>>,
  body = "{}",
): Request {
  return new Request(`${origin}/api/v1/journeys`, {
    body,
    headers: {
      "content-type": "application/json",
      host: new URL(origin).host,
      origin,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    method: "POST",
  });
}

describe("security adversarial boundary", () => {
  it("binds deployed requests only to one normalized configured HTTPS origin", async () => {
    // Given: one trusted deployment origin and an attacker-selected paired Host and Origin.
    const configured = requestPolicyForEnvironment(
      new URL("https://attacker.test/api/v1/journeys"),
      "production",
      "https://api.example.test",
    );
    const attacker = mutationAt("https://attacker.test", {});
    const exact = mutationAt("https://api.example.test", {});

    // When: both requests cross the same deployment-bound policy.
    const [attackerResult, exactResult] = await Promise.all([
      validateMutationRequest(attacker, configured, 4_096),
      validateMutationRequest(exact, configured, 4_096),
    ]);
    const sessionHeaders = { origin: "https://api.example.test" };
    const attackerSession = new Request("https://attacker.test/api/v1/session", {
      headers: { host: "attacker.test", ...sessionHeaders },
    });
    const exactSession = new Request("https://api.example.test/api/v1/session", {
      headers: { host: "api.example.test", ...sessionHeaders },
    });

    // Then: paired attacker headers fail while the exact configured origin succeeds.
    expect(attackerResult).toBe("request_forbidden");
    expect(exactResult).toEqual({ body: "{}" });
    expect(validateSessionRequest(attackerSession, configured)).toBe(false);
    expect(validateSessionRequest(exactSession, configured)).toBe(true);
  });

  it.each([
    undefined,
    "http://api.example.test",
    "https://user@api.example.test",
    "https://api.example.test/",
    "https://api.example.test/path",
    "https://api.example.test?query=1",
    "https://api.example.test#fragment",
  ])("fails closed for a missing or malformed deployed canonical origin: %s", async (origin) => {
    // Given: a non-local deployment without one normalized HTTPS origin.
    const policy = requestPolicyForEnvironment(
      new URL("https://attacker.test/api/v1/journeys"),
      "staging",
      origin,
    );

    // When: an attacker pairs Host and Origin with the request URL.
    const result = await validateMutationRequest(
      mutationAt("https://attacker.test", {}),
      policy,
      4_096,
    );

    // Then: invalid deployment configuration cannot authorize any mutation.
    expect(result).toBe("request_forbidden");
    expect(
      validateSessionRequest(
        new Request("https://attacker.test/api/v1/session", {
          headers: {
            host: "attacker.test",
            origin: "https://attacker.test",
          },
        }),
        policy,
      ),
    ).toBe(false);
  });

  it.each([
    ["foreign Origin", { origin: "https://attacker.test" }],
    ["null Origin", { origin: "null" }],
    ["wrong Host", { host: "attacker.test" }],
    ["cross-site Fetch Metadata", { "sec-fetch-site": "cross-site" }],
  ])("FI-CSRF-01 rejects %s before reading a mutation", async (_case, headers) => {
    // Given: a mutation with one request-confusion signal.
    const request = mutation(headers);

    // When: the canonical request gate evaluates it.
    const result = await validateMutationRequest(request, POLICY, 4_096);

    // Then: the request is forbidden before schema or side effects.
    expect(result).toBe("request_forbidden");
  });

  it("FI-COST-02 rejects an oversized streamed body before parsing", async () => {
    // Given: a body larger than the journey-create ceiling.
    const request = mutation({}, "x".repeat(4_097));

    // When: the bounded reader evaluates it.
    const result = await validateMutationRequest(request, POLICY, 4_096);

    // Then: no oversized body is returned for parsing.
    expect(result).toBe("payload_too_large");
  });

  it("FI-CSRF-01 rejects simple media types", async () => {
    // Given: a same-origin form-style mutation.
    const request = mutation({ "content-type": "text/plain" });

    // When: the exact media-type gate evaluates it.
    const result = await validateMutationRequest(request, POLICY, 4_096);

    // Then: the simple request is rejected.
    expect(result).toBe("unsupported_media_type");
  });

  it("FI-IDOR-01 authorizes every object independently of identifier entropy", async () => {
    // Given: one journey bound to session A.
    const authorizer = new InMemoryObjectAuthorizer();
    authorizer.bind("session-a", "j_v1.object");

    // When: session B presents the journey identifier.
    const authorized = await authorizer.authorize("session-b", "j_v1.object");

    // Then: possession of the identifier does not authorize access.
    expect(authorized).toBe(false);
  });

  it("rejects duplicate and unknown JSON fields at the strict schema gate", () => {
    // Given: duplicate and unknown contract fields.
    const allowed = new Set(["contractVersion", "action"]);

    // When: each body crosses the strict schema boundary.
    const duplicate = parseStrictBody(
      '{"contractVersion":1,"action":"reveal","action":"stop"}',
      allowed,
    );
    const unknown = parseStrictBody(
      '{"contractVersion":1,"action":"reveal","debug":true}',
      allowed,
    );

    // Then: neither body reaches typed mutation logic.
    expect(duplicate.ok).toBe(false);
    expect(unknown.ok).toBe(false);
  });
});
