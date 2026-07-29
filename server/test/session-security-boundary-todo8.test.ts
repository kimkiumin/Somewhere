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
});
