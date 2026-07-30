import { hmacDigest } from "../security/tokens";
import { publicError } from "./http-response";
import { findDeleteReplay } from "./journey-persistence";
import { type JourneyControllerDependencies, projectSnapshot } from "./journey-request";

export async function getJourney(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
  journeyId: string,
): Promise<Response> {
  const session = await dependencies.sessionService.authenticateCookie(
    request.headers.get("cookie") ?? undefined,
    dependencies.now(),
  );
  if (session === undefined) {
    return publicError("session_expired");
  }
  if (
    (await findDeleteReplay(
      env.DB,
      await hmacDigest(dependencies.hmacKey, journeyId),
      dependencies.now(),
    )) !== undefined
  ) {
    return publicError("journey_expired");
  }
  const snapshot = await env.JOURNEYS.getByName(journeyId).snapshot(session.bindingDigest);
  if (snapshot !== undefined && dependencies.now() >= snapshot.expiresAt) {
    return publicError("journey_expired");
  }
  return projectSnapshot(snapshot, session);
}
