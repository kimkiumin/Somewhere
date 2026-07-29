import { NAVIGATION_POLICY_V1 } from "@somewhere/contracts";
import { describe, expect, test } from "vitest";
import { decodeRouteGeometry, routeEndpointDigest, validateRouteGuidance } from "./polyline";

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

describe("trusted route decoding", () => {
  test("TASK16_ROUTE_DIGEST_VERSION_EXPIRY validates decoded endpoint identity", async () => {
    const geometry = [
      [127.0374, 37.5446],
      [127.038, 37.545],
    ];
    const routeDigest = await routeEndpointDigest({ latitude: 37.545, longitude: 127.038 });
    expect(routeDigest).not.toBeNull();
    const result = await validateRouteGuidance(
      {
        encodedPolyline: encode(geometry),
        routeDigest: routeDigest ?? "",
        routeVersion: "route-v1",
        expiresAt: 50_000,
      },
      {
        nowMs: 10_000,
        receivedAtMs: 9_000,
        routeAbsoluteMaxAgeMs: NAVIGATION_POLICY_V1.routeAbsoluteMaxAgeMs,
      },
    );
    expect(result).toMatchObject({
      ok: true,
      route: { routeVersion: "route-v1", expiresAt: 50_000 },
    });
  });

  test("TASK16_ROUTE_MALFORMED rejects corrupt, oversized, duplicate, and swapped-invalid geometry", () => {
    expect(decodeRouteGeometry("not+base64")).toBeNull();
    expect(decodeRouteGeometry(encode([[0, 0]]))).toBeNull();
    expect(
      decodeRouteGeometry(
        encode([
          [0, 0],
          [0, 0],
        ]),
      ),
    ).toBeNull();
    expect(
      decodeRouteGeometry(
        encode([
          [37, 127],
          [37.1, 127.1],
        ]),
      ),
    ).toBeNull();
  });

  test("TASK16_ROUTE_STALE_AND_TAMPERED is never trusted", async () => {
    const encodedPolyline = encode([
      [127, 37],
      [127.001, 37.001],
    ]);
    const common = {
      encodedPolyline,
      routeVersion: "route-v1",
      expiresAt: 100_000,
    };
    expect(
      await validateRouteGuidance(
        { ...common, routeDigest: `sha256:${"0".repeat(64)}` },
        { nowMs: 10_000, receivedAtMs: 0, routeAbsoluteMaxAgeMs: 20_000 },
      ),
    ).toEqual({ ok: false, reason: "route-digest-invalid" });
    const digest = await routeEndpointDigest({ latitude: 37.001, longitude: 127.001 });
    expect(
      await validateRouteGuidance(
        { ...common, routeDigest: digest ?? "", expiresAt: 10_000 },
        { nowMs: 10_000, receivedAtMs: 0, routeAbsoluteMaxAgeMs: 20_000 },
      ),
    ).toEqual({ ok: false, reason: "route-expired" });
    expect(
      await validateRouteGuidance(
        { ...common, routeDigest: digest ?? "", expiresAt: 2_000_000 },
        {
          nowMs: NAVIGATION_POLICY_V1.routeAbsoluteMaxAgeMs + 1,
          receivedAtMs: 0,
          routeAbsoluteMaxAgeMs: NAVIGATION_POLICY_V1.routeAbsoluteMaxAgeMs,
        },
      ),
    ).toEqual({ ok: false, reason: "route-too-old" });
  });
});
