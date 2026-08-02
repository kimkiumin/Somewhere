import { describe, expect, test } from "vitest";
import { createScriptedSensorRig } from "../testkit/fakes";
import { createSensorController } from "./controller";

describe("sensor controller characterization", () => {
  test("starts with inactive guidance and no sensor subscriptions", () => {
    const rig = createScriptedSensorRig();
    const controller = createSensorController(rig.ports);

    expect(controller.snapshot()).toMatchObject({
      started: false,
      visibility: "visible",
      location: { status: "idle" },
      heading: { status: "idle" },
      wakeLock: { status: "idle" },
      guidance: { status: "inactive" },
      subscriptionCounts: {
        location: 0,
        heading: 0,
        visibility: 1,
        wakeRelease: 1,
      },
    });
  });

  test("stops notifying a subscriber after unsubscribe", async () => {
    const rig = createScriptedSensorRig();
    const controller = createSensorController(rig.ports);
    let notificationCount = 0;
    const unsubscribe = controller.subscribe(() => {
      notificationCount += 1;
    });
    await controller.startFromUserGesture();
    const countBeforeUnsubscribe = notificationCount;

    unsubscribe();
    rig.setVisibility("hidden");
    await controller.settle();

    expect(notificationCount).toBe(countBeforeUnsubscribe);
  });

  test("destroy is idempotent and removes every owned subscription", async () => {
    const rig = createScriptedSensorRig();
    const controller = createSensorController(rig.ports);
    await controller.startFromUserGesture();

    await controller.destroy();
    await controller.destroy();

    expect(controller.snapshot().subscriptionCounts).toEqual({
      location: 0,
      heading: 0,
      visibility: 0,
      wakeRelease: 0,
    });
  });
});
