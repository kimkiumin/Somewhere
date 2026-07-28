import { describe, expect, test } from "vitest";
import { createPwaUpdateController, type PwaUpdateSource } from "./pwa-update";

function updateSource() {
  let listener: ((applyUpdate: () => Promise<void>) => void) | null = null;
  let applyCount = 0;
  const source: PwaUpdateSource = {
    listen(next) {
      listener = next;
    },
  };
  return {
    source,
    emit() {
      listener?.(() => {
        applyCount += 1;
        return Promise.resolve();
      });
    },
    applyCount: () => applyCount,
  };
}

describe("PWA update policy", () => {
  test("offers a ready update while idle and applies only after acceptance", async () => {
    const fake = updateSource();
    const controller = createPwaUpdateController(fake.source, "idle");

    fake.emit();

    expect(controller.snapshot()).toEqual({ status: "available" });
    expect(fake.applyCount()).toBe(0);
    await controller.accept();
    expect(fake.applyCount()).toBe(1);
  });

  test("defers an update through every active journey phase", () => {
    const fake = updateSource();
    const controller = createPwaUpdateController(fake.source, "following");

    fake.emit();
    expect(controller.snapshot()).toEqual({ status: "deferred" });
    controller.setJourneyPhase("arrived");
    expect(controller.snapshot()).toEqual({ status: "deferred" });
    controller.setJourneyPhase("revealed");
    expect(controller.snapshot()).toEqual({ status: "deferred" });
    controller.setJourneyPhase("idle");
    expect(controller.snapshot()).toEqual({ status: "available" });
  });
});
