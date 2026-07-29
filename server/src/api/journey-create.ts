import { JourneyCreateBodyV1Schema } from "../../../contracts/src/journey";

import { hmacDigest, isCanonicalToken, randomBase64Url } from "../security/tokens";
import { jsonResponse, publicError } from "./http-response";
import { buildJourneyPreparation } from "./journey-composition";
import { consumeRecoveryDigest, findGuard, persistPreparation } from "./journey-persistence";
import { projectLifecycleJourney } from "./journey-projection";
import {
  authError,
  authenticateMutation,
  deriveJourneyId,
  type JourneyControllerDependencies,
  parseMutationBody,
  projectSnapshot,
  sha256,
} from "./journey-request";
import { sealForSession } from "./session-cipher";

const CREATE_KEYS = new Set([
  "contractVersion",
  "constraints",
  "origin",
  "disclosureLevel",
  "recoveryCapability",
]);

export async function createJourney(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
): Promise<Response> {
  const parsed = await parseMutationBody(request, 4_096, CREATE_KEYS);
  if ("error" in parsed) {
    return publicError(parsed.error);
  }
  const body = JourneyCreateBodyV1Schema.safeParse(parsed.value);
  if (!body.success) {
    return publicError("schema_invalid");
  }
  const session = await authenticateMutation(request, dependencies);
  if (session === undefined) {
    return authError(request);
  }
  const rawIdempotencyKey = request.headers.get("idempotency-key");
  if (rawIdempotencyKey === null || !isCanonicalToken(rawIdempotencyKey, "ik_v1", 32)) {
    return publicError("idempotency_conflict");
  }
  const bodyDigest = await sha256(parsed.body);
  const journeyId = await deriveJourneyId(
    dependencies.hmacKey,
    session.bindingDigest,
    rawIdempotencyKey,
  );
  const journeyDigest = await hmacDigest(dependencies.hmacKey, journeyId);
  const stub = env.JOURNEYS.getByName(journeyId);
  const existing = await stub.snapshot(session.bindingDigest);
  if (existing !== undefined) {
    return existing.selectedSnapshot.createRequestDigest === bodyDigest
      ? projectSnapshot(existing, session, 201)
      : publicError("idempotency_conflict");
  }
  const guard = await findGuard(env.DB, session.bindingDigest);
  if (guard?.active_journey_digest !== undefined && guard.active_journey_digest !== null) {
    return publicError("invalid_transition");
  }
  const now = dependencies.now();
  if (body.data.recoveryCapability === null) {
    if (
      guard?.previous_candidate_digest !== null &&
      guard?.previous_candidate_digest !== undefined &&
      guard.last_stopped_at !== null &&
      now < guard.last_stopped_at + 300_000
    ) {
      return publicError("recovery_review_required");
    }
  } else {
    const constraints = JSON.stringify(body.data.constraints);
    const capabilityDigest = await hmacDigest(
      dependencies.hmacKey,
      `${body.data.recoveryCapability}\0${constraints}`,
    );
    if (
      guard?.recovery_capability_digest !== capabilityDigest ||
      guard.recovery_consumed_at !== null ||
      guard.last_stopped_at === null
    ) {
      return publicError("capability_invalid");
    }
    if (now > guard.last_stopped_at + 120_000) {
      return publicError("capability_expired");
    }
    if (
      !(await consumeRecoveryDigest({
        bindingDigest: session.bindingDigest,
        database: env.DB,
        digest: capabilityDigest,
        now,
      }))
    ) {
      return publicError("capability_invalid");
    }
  }
  const prepared = await buildJourneyPreparation({
    body: body.data,
    journeyId,
    now: new Date(now),
    requestId: `req_v1.${randomBase64Url(16)}`,
  });
  if (prepared.kind === "error") {
    return publicError(prepared.code);
  }
  if (
    !(await persistPreparation({
      bindingDigest: session.bindingDigest,
      bodyDigest,
      database: env.DB,
      journeyDigest,
      now,
      prepared,
    }))
  ) {
    return publicError("invalid_transition");
  }
  await stub.initialize({
    browserBindingDigest: session.bindingDigest,
    expiresAt: now + 24 * 60 * 60 * 1_000,
    journeyId,
    preparedRoute: {
      geometry: prepared.route.geometry,
      originZoneRef: prepared.route.originZoneRef,
      routeDigest: prepared.route.routeDigest.slice(7),
    },
    selectedSnapshot: {
      createRequestDigest: bodyDigest,
      destinationSnapshotCiphertext: await sealForSession(prepared, session.sessionToken),
      disclosure: {
        category: body.data.constraints.category,
        hint: prepared.disclosure.representativeCategories.join(" / "),
      },
      receiptDigest: prepared.receipt.receiptDigest,
      selectionReceiptId: prepared.receipt.receiptId,
    },
    sequence: 1,
    writeEpoch: 1,
  });
  return jsonResponse(
    projectLifecycleJourney(prepared, {
      activeRoute: undefined,
      feedback: undefined,
      openStop: undefined,
      phase: "ready",
      revealed: false,
      routeRepair: undefined,
      sequence: 1,
    }),
    201,
  );
}
