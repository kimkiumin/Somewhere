import type { z } from "zod";
import { JourneyCreateBodyV1Schema } from "../../../contracts/src/journey";

import type { JourneyDurableObject } from "../journey/durable-object";
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
  const parsed = await parseMutationBody(request, dependencies.requestPolicy, 4_096, CREATE_KEYS);
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
  }
  const reservation =
    dependencies.reserveNewWork === undefined
      ? undefined
      : await dependencies.reserveNewWork(rawIdempotencyKey);
  if (dependencies.reserveNewWork !== undefined && reservation === undefined) {
    return publicError("service_unavailable");
  }
  return runReservedNewWork(reservation, () =>
    createReservedJourney({
      body: body.data,
      bodyDigest,
      dependencies,
      env,
      journeyDigest,
      journeyId,
      now,
      session,
      stub,
    }),
  );
}

export async function runReservedNewWork(
  reservation: Awaited<ReturnType<NonNullable<JourneyControllerDependencies["reserveNewWork"]>>>,
  operation: () => Promise<Response>,
): Promise<Response> {
  let response: Response;
  try {
    response = await operation();
  } catch (error) {
    await reservation?.release();
    throw error;
  }
  if (response.status >= 400) {
    await reservation?.release();
  } else {
    await reservation?.finalize();
  }
  return response;
}

async function createReservedJourney(
  input: Readonly<{
    body: z.infer<typeof JourneyCreateBodyV1Schema>;
    bodyDigest: string;
    dependencies: JourneyControllerDependencies;
    env: Env;
    journeyDigest: string;
    journeyId: string;
    now: number;
    session: Awaited<ReturnType<typeof authenticateMutation>>;
    stub: DurableObjectStub<JourneyDurableObject>;
  }>,
): Promise<Response> {
  if (input.session === undefined) {
    return publicError("session_expired");
  }
  if (input.body.recoveryCapability !== null) {
    const capabilityDigest = await hmacDigest(
      input.dependencies.hmacKey,
      `${input.body.recoveryCapability}\0${JSON.stringify(input.body.constraints)}`,
    );
    if (
      !(await consumeRecoveryDigest({
        bindingDigest: input.session.bindingDigest,
        database: input.env.DB,
        digest: capabilityDigest,
        now: input.now,
      }))
    ) {
      return publicError("capability_invalid");
    }
  }
  const prepared = await buildJourneyPreparation({
    body: input.body,
    journeyId: input.journeyId,
    now: new Date(input.now),
    requestId: `req_v1.${randomBase64Url(16)}`,
  });
  if (prepared.kind === "error") {
    return publicError(prepared.code);
  }
  if (
    !(await persistPreparation({
      bindingDigest: input.session.bindingDigest,
      bodyDigest: input.bodyDigest,
      database: input.env.DB,
      journeyDigest: input.journeyDigest,
      now: input.now,
      prepared,
    }))
  ) {
    return publicError("invalid_transition");
  }
  await input.stub.initialize({
    browserBindingDigest: input.session.bindingDigest,
    expiresAt: input.now + 24 * 60 * 60 * 1_000,
    journeyId: input.journeyId,
    preparedRoute: {
      geometry: prepared.route.geometry,
      originZoneRef: prepared.route.originZoneRef,
      routeDigest: prepared.route.routeDigest.slice(7),
    },
    selectedSnapshot: {
      createRequestDigest: input.bodyDigest,
      destinationSnapshotCiphertext: await sealForSession(prepared, input.session.sessionToken),
      disclosure: {
        category: input.body.constraints.category,
        hint: prepared.disclosure.representativeCategories.join(" / "),
      },
      receiptDigest: prepared.receipt.receiptDigest,
      selectionReceiptId: prepared.receipt.receiptId,
    },
    sequence: 1,
    writeEpoch: input.dependencies.writeEpoch,
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
