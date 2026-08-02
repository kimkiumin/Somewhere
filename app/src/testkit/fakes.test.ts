import { describe, expect, test } from "vitest";
import { createScriptedSensorRig } from "./fakes";

describe("scripted deadline scheduler", () => {
  test("fires due callbacks deterministically and honors cancellation", () => {
    const rig = createScriptedSensorRig();
    const events: string[] = [];
    const cancel = rig.ports.scheduler.schedule(10_001, () => events.push("cancelled"));
    rig.ports.scheduler.schedule(10_000, () => events.push("first"));
    rig.ports.scheduler.schedule(10_001, () => events.push("second"));
    cancel();

    rig.advanceMs(9_999);
    expect(events).toEqual([]);
    rig.advanceMs(1);
    expect(events).toEqual(["first"]);
    rig.advanceMs(1);
    expect(events).toEqual(["first", "second"]);
  });
});
