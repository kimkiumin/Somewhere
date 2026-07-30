import { DeletionRepository } from "../deletion/repository";
import { runDeletionSaga } from "../deletion/saga";
import { parseExpectedSequence } from "../security/sequence";
import { hmacDigest, isCanonicalToken } from "../security/tokens";
import { publicError } from "./http-response";
import { findDeleteReplayWindow } from "./journey-persistence";
import {
  authError,
  authenticateMutation,
  type JourneyControllerDependencies,
  parseMutationBody,
} from "./journey-request";

export async function deleteJourney(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
  journeyId: string,
): Promise<Response> {
  const parsed = await parseMutationBody(request, dependencies.requestPolicy, 0, new Set());
  if ("error" in parsed) {
    return publicError(parsed.error);
  }
  const session = await authenticateMutation(request, dependencies);
  if (session === undefined) {
    return authError(request);
  }
  const expectedSequence = parseExpectedSequence(
    request.headers.get("x-expected-sequence") ?? undefined,
  );
  const rawKey = request.headers.get("idempotency-key");
  if (expectedSequence === undefined || rawKey === null || !isCanonicalToken(rawKey, "ik_v1", 32)) {
    return publicError(
      expectedSequence === undefined ? "sequence_conflict" : "idempotency_conflict",
    );
  }
  const journeyDigest = await hmacDigest(dependencies.hmacKey, journeyId);
  const deleteRequestDigest = await hmacDigest(dependencies.hmacKey, rawKey);
  const now = dependencies.now();
  const repository = new DeletionRepository(env.DB);
  const stub = env.JOURNEYS.getByName(journeyId);
  try {
    let intent = await repository.find(journeyDigest, now);
    if (intent === undefined) {
      const replay = await findDeleteReplayWindow(env.DB, journeyDigest, now);
      if (replay !== undefined) {
        return replay.deleteRequestDigest === deleteRequestDigest && replay.replayExpiresAt > now
          ? new Response(null, { headers: { "cache-control": "no-store, private" }, status: 204 })
          : publicError("journey_expired");
      }
      const snapshot = await stub.snapshot(session.bindingDigest);
      if (snapshot === undefined) {
        return publicError("not_found");
      }
      if (now >= snapshot.expiresAt) {
        return publicError("journey_expired");
      }
      if (snapshot.sequence !== expectedSequence) {
        return publicError("sequence_conflict");
      }
      intent = await repository.prepare({
        deleteRequestDigest,
        expectedSequence,
        journeyDigest,
        now,
        sessionBindingDigest: session.bindingDigest,
      });
    }
    if (intent.delete_request_digest !== deleteRequestDigest) {
      return publicError("journey_expired");
    }
    if (intent.stage === "pending" && intent.expected_sequence === null) {
      return publicError("service_unavailable");
    }
    const result = await runDeletionSaga({
      advance: (stage) => repository.advance(intent, stage),
      beginDeletion: async () => {
        if (intent.expected_sequence === null) {
          throw new Error("Legacy pending deletion intent has no sequence fence");
        }
        return stub.beginDeletion({
          deleteRequestDigest: intent.delete_request_digest,
          expectedSequence: intent.expected_sequence,
        });
      },
      cleanupBindings: () => repository.cleanupBindings(intent),
      complete: () => repository.complete(intent),
      deleteObject: async () => {
        if (intent.expected_sequence === null) {
          const legacySnapshot = await stub.snapshot(intent.session_binding_digest);
          if (legacySnapshot !== undefined) {
            const legacyGate = await stub.beginDeletion({
              deleteRequestDigest: intent.delete_request_digest,
              expectedSequence: legacySnapshot.sequence,
            });
            if (legacyGate !== "fenced") {
              throw new Error("Legacy tombstoned deletion could not fence the Durable Object");
            }
          } else {
            const legacyGate = await stub.resumeLegacyDeletion({
              deleteRequestDigest: intent.delete_request_digest,
            });
            if (legacyGate !== "fenced") {
              throw new Error("Legacy tombstoned deletion gate identity changed");
            }
          }
        }
        await stub.deleteAfterTombstone({
          deleteRequestDigest: intent.delete_request_digest,
          durable: true,
          replayStatus: 204,
        });
      },
      inventory: () => repository.inventory(intent),
      loadStage: async () => intent.stage,
      finalizeCompletion: () =>
        repository.finalizeCompletion(intent, dependencies.writeEpoch, dependencies.now()),
      writeTombstone: () =>
        repository.writeTombstone(intent, dependencies.writeEpoch, dependencies.now()),
    });
    if (result.kind === "sequence-conflict") {
      await repository.abandonPending(intent);
      return publicError("sequence_conflict");
    }
    return result.kind === "complete"
      ? new Response(null, {
          headers: { "cache-control": "no-store, private" },
          status: 204,
        })
      : publicError("service_unavailable");
  } catch (error) {
    if (error instanceof Error) {
      return publicError("service_unavailable");
    }
    throw error;
  }
}
