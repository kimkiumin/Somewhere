import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { API_HEADERS } from "../src/api/http-response";

const staticHeadersUrl = new URL("../../app/public/_headers", import.meta.url);

describe("security headers", () => {
  it("keeps the static asset policy strict and same-origin", async () => {
    const headers = await readFile(staticHeadersUrl.pathname, "utf8");

    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("script-src 'self'");
    expect(headers).toContain("connect-src 'self'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).not.toContain("unsafe-inline");
    expect(headers).not.toContain("unsafe-eval");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Referrer-Policy: no-referrer");
    expect(headers).toContain("Permissions-Policy:");
  });

  it("keeps API responses non-sniffable and referrer-restricted", () => {
    expect(API_HEADERS["cache-control"]).toBe("no-store, private");
    expect(API_HEADERS["x-content-type-options"]).toBe("nosniff");
    expect(API_HEADERS["referrer-policy"]).toBe("no-referrer");
    expect(API_HEADERS["permissions-policy"]).toContain("geolocation=(self)");
  });
});
