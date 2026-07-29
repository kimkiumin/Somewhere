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

  test("defers updates for every non-idle V2 projection phase", () => {
    // Given an update that arrived before a V2 journey projection
    const fake = updateSource();
    const controller = createPwaUpdateController(fake.source, "idle");
    fake.emit();
    const nonIdlePhases = [
      "finding",
      "ready",
      "committed",
      "following",
      "route-recovery",
      "near",
      "paused",
      "stopped",
      "completed",
      "arrived",
      "expired",
    ] as const;

    // When every non-idle V2 phase becomes current
    const statuses = nonIdlePhases.map((phase) => {
      controller.setJourneyPhase(phase);
      return controller.snapshot().status;
    });

    // Then none can surface or apply the waiting update
    expect(statuses).toEqual(nonIdlePhases.map(() => "deferred"));
    expect(fake.applyCount()).toBe(0);
  });
});
