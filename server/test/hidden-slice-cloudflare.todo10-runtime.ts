import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

describe("Todo10 Journey Durable Object activation", () => {
  it("atomically initializes ready state and its receipt activation outbox", async () => {
    // Given: a reviewed preparation carrying a sealed receipt digest.
    const stub = env.JOURNEYS.getByName("todo10-activation-outbox");
    const now = Date.now();

    // When: the journey is initialized in the real SQLite Durable Object.
    await stub.initialize({
      browserBindingDigest: DIGEST_A,
      expiresAt: now + 86_400_000,
      journeyId: "journey_todo10_activation_0001",
      preparedRoute: {
        geometry: [
          [127.03695, 37.54385],
          [127.05467, 37.542915],
        ],
        originZoneRef: "seoul-forest-main-gate",
        routeDigest: DIGEST_B,
      },
      selectedSnapshot: {
        destinationSnapshotCiphertext: "ciphertext.destination.runtime.todo10",
        disclosure: { category: "restaurant", hint: "Korean stew" },
        receiptDigest: DIGEST_B,
        selectionReceiptId: "receipt_todo10_activation_0001",
      },
      sequence: 1,
      writeEpoch: 1,
    });
    const inventory = await runInDurableObject(stub, (_instance, state) => ({
      outbox: state.storage.sql
        .exec<{ event_id: string; status: string }>("SELECT event_id, status FROM journey_outbox")
        .one(),
      stateCount: state.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM journey_state")
        .one().count,
    }));

    // Then: state and exactly one pending activation event are durable together.
    expect(inventory.stateCount).toBe(1);
    expect(inventory.outbox).toEqual({
      event_id: `activation_${DIGEST_B.slice(0, 48)}`,
      status: "pending",
    });
  });
});
