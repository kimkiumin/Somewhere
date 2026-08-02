import { NAVIGATION_POLICY_V1 } from "@somewhere/contracts";
import { describe, expect, test } from "vitest";
import { advanceRouteProgress, initialRouteProgressState } from "./route-progress";

const METERS_PER_DEGREE = (Math.PI / 180) * 6_371_000;
const latitudeForMeters = (meters: number) => meters / METERS_PER_DEGREE;
const longitudeForMeters = latitudeForMeters;

describe("route progress policy", () => {
  const eastbound = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: longitudeForMeters(400) },
  ] as const;

  test("TASK16_CORRIDOR_BOUNDARIES uses 35m acquire and 55m exit hysteresis", () => {
    const cannotAcquire = advanceRouteProgress(
      initialRouteProgressState(),
      eastbound,
      { latitude: latitudeForMeters(35.001), longitude: longitudeForMeters(10) },
      NAVIGATION_POLICY_V1,
    );
    expect(cannotAcquire.status).toBe("suppressed");

    const acquired = advanceRouteProgress(
      initialRouteProgressState(),
      eastbound,
      { latitude: latitudeForMeters(35), longitude: longitudeForMeters(10) },
      NAVIGATION_POLICY_V1,
    );
    expect(acquired.status).toBe("credible");
    if (acquired.status !== "credible") return;

    const retained = advanceRouteProgress(
      acquired.state,
      eastbound,
      { latitude: latitudeForMeters(45), longitude: longitudeForMeters(11) },
      NAVIGATION_POLICY_V1,
    );
    expect(retained.status).toBe("credible");
    if (retained.status !== "credible") return;

    const exited = advanceRouteProgress(
      retained.state,
      eastbound,
      { latitude: latitudeForMeters(55), longitude: longitudeForMeters(12) },
      NAVIGATION_POLICY_V1,
    );
    expect(exited).toMatchObject({ status: "suppressed", reason: "off-route" });
  });

  test("TASK16_FORWARD_TARGET follows 25m of route geometry around a turn", () => {
    const geometry = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: longitudeForMeters(20) },
      { latitude: latitudeForMeters(60), longitude: longitudeForMeters(20) },
    ] as const;
    const result = advanceRouteProgress(
      initialRouteProgressState(),
      geometry,
      { latitude: 0, longitude: longitudeForMeters(10) },
      NAVIGATION_POLICY_V1,
    );
    expect(result.status).toBe("credible");
    if (result.status !== "credible") return;
    expect(result.forwardTarget.longitude).toBeCloseTo(longitudeForMeters(20), 8);
    expect(result.forwardTarget.latitude).toBeCloseTo(latitudeForMeters(15), 8);
  });

  test("TASK16_PROGRESS_JUMP_GUARDS suppress >25m backward and >100m forward jumps", () => {
    const first = advanceRouteProgress(
      initialRouteProgressState(),
      eastbound,
      { latitude: 0, longitude: longitudeForMeters(100) },
      NAVIGATION_POLICY_V1,
    );
    expect(first.status).toBe("credible");
    if (first.status !== "credible") return;
    expect(
      advanceRouteProgress(
        first.state,
        eastbound,
        { latitude: 0, longitude: longitudeForMeters(74.999) },
        NAVIGATION_POLICY_V1,
      ),
    ).toMatchObject({ status: "suppressed", reason: "progress-jump" });
    expect(
      advanceRouteProgress(
        first.state,
        eastbound,
        { latitude: 0, longitude: longitudeForMeters(200.001) },
        NAVIGATION_POLICY_V1,
      ),
    ).toMatchObject({ status: "suppressed", reason: "progress-jump" });
  });

  test("TASK16_OFF_ROUTE_RECOVERY requires a credible sequence before restoring guidance", () => {
    const acquired = advanceRouteProgress(
      initialRouteProgressState(),
      eastbound,
      { latitude: 0, longitude: longitudeForMeters(20) },
      NAVIGATION_POLICY_V1,
    );
    expect(acquired.status).toBe("credible");
    if (acquired.status !== "credible") return;
    const outside = advanceRouteProgress(
      acquired.state,
      eastbound,
      { latitude: latitudeForMeters(55), longitude: longitudeForMeters(21) },
      NAVIGATION_POLICY_V1,
    );
    expect(outside).toMatchObject({ status: "suppressed", reason: "off-route" });
    const firstRecovery = advanceRouteProgress(
      outside.state,
      eastbound,
      { latitude: 0, longitude: longitudeForMeters(22) },
      NAVIGATION_POLICY_V1,
    );
    expect(firstRecovery).toMatchObject({
      status: "suppressed",
      reason: "route-recovering",
    });
    const recovered = advanceRouteProgress(
      firstRecovery.state,
      eastbound,
      { latitude: 0, longitude: longitudeForMeters(23) },
      NAVIGATION_POLICY_V1,
    );
    expect(recovered.status).toBe("credible");
  });

  test("TASK16_PROGRESS_PROPERTY keeps remaining distance monotone for credible forward samples", () => {
    let state = initialRouteProgressState();
    let previousRemainingM = Number.POSITIVE_INFINITY;
    for (let progressM = 0; progressM <= 300; progressM += 5) {
      const result = advanceRouteProgress(
        state,
        eastbound,
        {
          latitude: latitudeForMeters(((progressM * 17) % 11) - 5),
          longitude: longitudeForMeters(progressM),
        },
        NAVIGATION_POLICY_V1,
      );
      expect(result.status).toBe("credible");
      if (result.status !== "credible") return;
      expect(result.remainingM).toBeLessThanOrEqual(previousRemainingM);
      expect(result.progressM + result.remainingM).toBeCloseTo(400, 5);
      previousRemainingM = result.remainingM;
      state = result.state;
    }
  });
});
