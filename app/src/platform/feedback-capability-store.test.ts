import { FeedbackCapabilitySchema } from "@somewhere/contracts";
import { describe, expect, test } from "vitest";
import {
  createFeedbackCapabilityStore,
  type FeedbackCapabilityPersistence,
} from "./feedback-capability-store";

const CAPABILITY = FeedbackCapabilitySchema.parse(`fb_v1.${"A".repeat(43)}`);

function persistence(initial: unknown = null) {
  let value = initial;
  let clears = 0;
  const driver: FeedbackCapabilityPersistence = {
    async read() {
      return value;
    },
    async write(next) {
      value = structuredClone(next);
    },
    async clear() {
      value = null;
      clears += 1;
    },
  };
  return {
    driver,
    clears: () => clears,
    value: () => value,
  };
}

describe("feedback capability persistence", () => {
  test("persists only the raw bearer, due time, and bounded expiry", async () => {
    const memory = persistence();
    const store = createFeedbackCapabilityStore(memory.driver, () => 1_000);

    await store.save({
      feedbackCapability: CAPABILITY,
      dueAt: 2_000,
      expiresAt: 3_000,
    });

    expect(memory.value()).toEqual({
      feedbackCapability: CAPABILITY,
      dueAt: 2_000,
      expiresAt: 3_000,
    });
    expect(Object.keys(memory.value() ?? {})).toEqual(["feedbackCapability", "dueAt", "expiresAt"]);
  });

  test("deletes malformed, leaking, and expired records fail closed", async () => {
    const malformed = persistence({
      feedbackCapability: CAPABILITY,
      dueAt: 1,
      expiresAt: 2_000,
      journeyId: "leak",
    });
    const malformedStore = createFeedbackCapabilityStore(malformed.driver, () => 1_000);
    const expired = persistence({
      feedbackCapability: CAPABILITY,
      dueAt: 1,
      expiresAt: 999,
    });
    const expiredStore = createFeedbackCapabilityStore(expired.driver, () => 1_000);

    expect(await malformedStore.load()).toBeNull();
    expect(await expiredStore.load()).toBeNull();
    expect(malformed.clears()).toBe(1);
    expect(expired.clears()).toBe(1);
  });

  test("rejects records retained beyond seven days and clears the slot", async () => {
    const memory = persistence();
    const store = createFeedbackCapabilityStore(memory.driver, () => 10_000);

    await expect(
      store.save({
        feedbackCapability: CAPABILITY,
        dueAt: 20_000,
        expiresAt: 10_000 + 7 * 24 * 60 * 60 * 1_000 + 1,
      }),
    ).rejects.toThrow("retention");

    expect(memory.value()).toBeNull();
    expect(memory.clears()).toBe(1);
  });
});
