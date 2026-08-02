import { describe, expect, test } from "vitest";
import { createPwaConnectivityController, type PwaGuidanceConfidence } from "./pwa-connectivity";

describe("PWA offline journey policy", () => {
  test("blocks a new journey while offline", () => {
    // Given a freshly loaded client with no in-memory journey
    const controller = createPwaConnectivityController(false);

    // When the client checks whether a journey can start
    const snapshot = controller.snapshot();

    // Then offline mode is honestly idle and cannot start a journey
    expect(snapshot).toEqual({
      network: "offline",
      journey: "idle",
      canStart: false,
    });
  });

  test("continues only the active in-memory journey while guidance is live", () => {
    // Given an online journey whose current sensor and route confidence is valid
    const controller = createPwaConnectivityController(true);
    controller.setJourneyActive(true);
    controller.setGuidanceConfidence("live");

    // When connectivity is lost
    controller.setOnline(false);

    // Then the already-active in-memory guidance can continue
    expect(controller.snapshot()).toEqual({
      network: "offline",
      journey: "continuing",
      canStart: false,
    });
  });

  test.each<PwaGuidanceConfidence>(["acquiring", "paused", "inactive"])(
    "pauses offline continuation when confidence is %s",
    (confidence) => {
      // Given an active journey that has lost valid guidance confidence
      const controller = createPwaConnectivityController(true);
      controller.setJourneyActive(true);
      controller.setGuidanceConfidence(confidence);

      // When connectivity is lost
      controller.setOnline(false);

      // Then the client does not imply that guidance remains trustworthy
      expect(controller.snapshot().journey).toBe("paused");
    },
  );

  test("does not resurrect a journey in a new controller after reload", () => {
    // Given an offline active journey held by the current page only
    const beforeReload = createPwaConnectivityController(true);
    beforeReload.setJourneyActive(true);
    beforeReload.setGuidanceConfidence("live");
    beforeReload.setOnline(false);
    expect(beforeReload.snapshot().journey).toBe("continuing");

    // When a reload constructs a new controller without persisted journey input
    const afterReload = createPwaConnectivityController(false);

    // Then the new page is offline-idle rather than restoring the journey
    expect(afterReload.snapshot()).toEqual({
      network: "offline",
      journey: "idle",
      canStart: false,
    });
  });
});
