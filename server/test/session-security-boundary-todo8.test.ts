import { describe, expect, it } from "vitest";

import { handleRequest } from "../src/http";

describe("security session boundary", () => {
  it("issues a protected anonymous session when the same-origin session route is requested", async () => {
    // Given: a canonical same-origin request without an attacker-selected cookie.
    const request = new Request("https://example.test/api/v1/session", {
      headers: {
        host: "example.test",
        origin: "https://example.test",
        "sec-fetch-site": "same-origin",
      },
    });

    // When: the real HTTP boundary handles session issuance.
    const response = await handleRequest(request);

    // Then: a fresh session and volatile CSRF value are issued without caching.
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^__Host-somewhere_session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Strict; Path=\/$/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toMatchObject({
      contractVersion: 1,
      csrfToken: expect.stringMatching(/^csrf_v1\.[A-Za-z0-9_-]{43}$/),
    });
  });

  it("accepts the exact same-origin browser GET shape when browsers omit Origin", async () => {
    // Given: Chromium or WebKit Fetch Metadata and an exact-origin Referer on a safe GET.
    const request = new Request("https://example.test/api/v1/session", {
      headers: {
        host: "example.test",
        referer: "https://example.test/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });

    // When: the real session boundary validates the browser-generated request.
    const response = await handleRequest(request);

    // Then: the safe bootstrap succeeds without weakening mutation validation.
    expect(response.status).toBe(200);
  });

  it("accepts the no-referrer browser GET shape when Referrer-Policy hides Referer", async () => {
    // Given: the Fetch Metadata emitted by a same-origin fetch under no-referrer.
    const request = new Request("https://example.test/api/v1/session", {
      headers: {
        host: "example.test",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });

    // When: the real session boundary validates the privacy-preserving browser request.
    const response = await handleRequest(request);

    // Then: the no-referrer policy does not break same-origin session bootstrap.
    expect(response.status).toBe(200);
  });

  it.each([
    [
      "foreign Referer",
      {
        host: "example.test",
        referer: "https://attacker.invalid/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    ],
    [
      "forged Host",
      {
        host: "attacker.invalid",
        referer: "https://example.test/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    ],
    [
      "same-site subdomain",
      {
        host: "example.test",
        referer: "https://example.test/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      },
    ],
    [
      "cross-site",
      {
        host: "example.test",
        referer: "https://example.test/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
      },
    ],
    [
      "navigate",
      {
        host: "example.test",
        referer: "https://example.test/",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
      },
    ],
    ["bare curl", { host: "example.test", referer: "https://example.test/" }],
  ])("rejects Origin-less %s session requests", async (_label, headers) => {
    // Given: an Origin-less request missing or contradicting one browser proof.
    const request = new Request("https://example.test/api/v1/session", { headers });

    // When: the real session boundary validates it.
    const response = await handleRequest(request);

    // Then: it fails closed without issuing a session.
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
