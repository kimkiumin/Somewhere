import { describe, expect, it } from "vitest";

import { InMemoryObjectAuthorizer } from "../src/security/authorization";
import { validateMutationRequest } from "../src/security/request";
import { parseStrictBody } from "../src/security/schema";

const POLICY = {
  canonicalHost: "example.test",
  canonicalOrigin: "https://example.test",
} as const;

function mutation(headers: Readonly<Record<string, string>>, body = "{}"): Request {
  return new Request("https://example.test/api/v1/journeys", {
    body,
    headers: {
      "content-type": "application/json",
      host: "example.test",
      origin: "https://example.test",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    method: "POST",
  });
}

describe("security adversarial boundary", () => {
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
