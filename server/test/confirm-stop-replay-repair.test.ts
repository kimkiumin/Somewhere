import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { mutateJourney } from "../src/api/journey-lifecycle-mutation";
import { storeRecoveryDigest } from "../src/api/journey-persistence";
import type { JourneySnapshot } from "../src/api/journey-request";
import { sealForSession } from "../src/api/session-cipher";
import { SessionRepository } from "../src/db";
import type { Database, PreparedQuery } from "../src/db/database";
import type { JourneyDurableObject } from "../src/journey/durable-object";
import { InMemorySessionRepository, SessionService } from "../src/security/session";
import { hmacDigest, importHmacKey } from "../src/security/tokens";
import { migratedDatabase, preparedJourney } from "./support/deletion-fence-fixture";

const NOW = 2_000_000_000_000;
const STOP_CONFIRMATION_ID = "sc_v1.AAAAAAAAAAAAAAAAAAAAAA";
const IDEMPOTENCY_KEY = `ik_v1.${"A".repeat(43)}`;

describe("confirm-stop replay guard repair", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("repairs a failed stopped guard write when the identical confirm-stop replays", async () => {
    // Given: confirm-stop commits in the Durable Object while its first D1 guard write fails.
    const fixture = migratedDatabase(temporaryPaths);
    const hmacKey = await importHmacKey(new Uint8Array(32).fill(7));
    const sessions = new SessionService(new InMemorySessionRepository(), hmacKey);
    const issued = await sessions.issueOrRefresh(undefined, NOW);
    const journey = preparedJourney();
    const journeyDigest = await hmacDigest(hmacKey, journey.journeyId);
    await new SessionRepository(fixture.database, 1).putGuard({
      active_journey_digest: journeyDigest,
      create_request_digest: "a".repeat(64),
      expires_at: NOW + 86_400_000,
      guard_version: 1,
      last_stopped_at: null,
      previous_candidate_digest: null,
      recovery_capability_digest: null,
      recovery_consumed_at: null,
      session_binding_digest: issued.bindingDigest,
    });
    let snapshot: JourneySnapshot = {
      activeRoute: {},
      expiresAt: NOW + 86_400_000,
      feedback: undefined,
      openStop: { confirmationId: STOP_CONFIRMATION_ID, phaseBeforePause: "following" },
      phase: "paused",
      revealed: false,
      routeRepair: undefined,
      selectedSnapshot: {
        destinationSnapshotCiphertext: await sealForSession(journey, sessionToken(issued.cookie)),
        receiptDigest: journey.receipt.receiptDigest,
        selectionReceiptId: journey.receipt.receiptId,
      },
      sequence: 6,
    };
    let outcomeCiphertext: string | undefined;
    const stub = {
      snapshot: async () => snapshot,
      transition: async (value: unknown) => {
        if (typeof value !== "object" || value === null || !("outcomeCiphertext" in value)) {
          throw new TypeError("confirm-stop transition omitted outcome ciphertext");
        }
        const ciphertext = value.outcomeCiphertext;
        if (typeof ciphertext !== "string") {
          throw new TypeError("confirm-stop transition ciphertext is invalid");
        }
        if (outcomeCiphertext === undefined) {
          outcomeCiphertext = ciphertext;
          snapshot = {
            ...snapshot,
            activeRoute: undefined,
            phase: "stopped",
            sequence: 7,
            stoppedAt: NOW,
          };
          return {
            kind: "applied",
            outcomeCiphertext: undefined,
            phase: "stopped",
            revealed: false,
            sequence: 7,
          };
        }
        return {
          kind: "replay",
          outcomeCiphertext,
          phase: "stopped",
          revealed: false,
          sequence: 7,
        };
      },
    } as unknown as DurableObjectStub<JourneyDurableObject>;
    const database = failFirstStoppedGuardMutation(fixture.database);
    const env = {
      DB: database,
      JOURNEYS: { getByName: () => stub },
    } as unknown as Env;
    const dependencies = {
      hmacKey,
      now: () => NOW,
      requestPolicy: {
        canonicalHost: "example.test",
        canonicalOrigin: "https://example.test",
        kind: "valid" as const,
      },
      sessionService: sessions,
      writeEpoch: 1,
    };

    // When: the same valid command is retried after the initial D1 failure.
    const first = await mutateJourney(
      confirmRequest(journey.journeyId, issued),
      env,
      dependencies,
      journey.journeyId,
      "confirm-stop",
    );
    const retained = await new SessionRepository(fixture.database, 1).findGuard(
      issued.bindingDigest,
      NOW,
    );
    const second = await mutateJourney(
      confirmRequest(journey.journeyId, issued),
      env,
      dependencies,
      journey.journeyId,
      "confirm-stop",
    );
    const secondBody = await second.text();
    await storeRecoveryDigest({
      bindingDigest: issued.bindingDigest,
      database: fixture.database as unknown as D1Database,
      digest: "f".repeat(64),
      issuedAt: NOW + 1,
    });
    const third = await mutateJourney(
      confirmRequest(journey.journeyId, issued),
      env,
      dependencies,
      journey.journeyId,
      "confirm-stop",
    );

    // Then: retry repairs D1 and all later exact replays retain the original bytes.
    expect(first.status).toBe(410);
    expect(retained?.active_journey_digest).toBe(journeyDigest);
    expect(second.status).toBe(200);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(
      await new SessionRepository(fixture.database, 1).findGuard(issued.bindingDigest, NOW),
    ).toMatchObject({
      active_journey_digest: null,
      last_stopped_at: NOW + 1,
      previous_candidate_digest: journey.receipt.receiptDigest,
      recovery_capability_digest: "f".repeat(64),
    });
    expect(await third.text()).toBe(secondBody);
  });
});

function confirmRequest(
  journeyId: string,
  issued: Readonly<{ cookie: string; csrfToken: string }>,
): Request {
  return new Request(`https://example.test/api/v1/journeys/${journeyId}/stop/confirm`, {
    body: JSON.stringify({ contractVersion: 1, stopConfirmationId: STOP_CONFIRMATION_ID }),
    headers: {
      "content-type": "application/json",
      cookie: issued.cookie.split(";")[0] ?? "",
      host: "example.test",
      "idempotency-key": IDEMPOTENCY_KEY,
      origin: "https://example.test",
      "x-csrf-token": issued.csrfToken,
      "x-expected-sequence": "6",
    },
    method: "POST",
  });
}

function sessionToken(cookie: string): string {
  return (cookie.split(";")[0] ?? "").replace("__Host-somewhere_session=", "");
}

function failFirstStoppedGuardMutation(database: Database): D1Database {
  let failed = false;
  return {
    prepare(query: string) {
      const statement = database.prepare(query);
      return query.includes("UPDATE browser_session_guards")
        ? failedStatement(statement, () => {
            if (failed) {
              return false;
            }
            failed = true;
            return true;
          })
        : statement;
    },
  } as unknown as D1Database;
}

function failedStatement(statement: PreparedQuery, fail: () => boolean): PreparedQuery {
  return {
    all: () => statement.all(),
    bind(...values) {
      const bound = statement.bind(...values);
      return {
        all: () => bound.all(),
        bind: (...nested) => failedStatement(bound.bind(...nested), fail),
        first: () => bound.first(),
        run: async () => (fail() ? { meta: { changes: 0 } } : bound.run()),
      };
    },
    first: () => statement.first(),
    run: async () => (fail() ? { meta: { changes: 0 } } : statement.run()),
  };
}
