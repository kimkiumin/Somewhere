import { methodNotAllowed, publicError } from "./http-response";
import { createJourney } from "./journey-create";
import { deleteJourney, getJourney, mutateJourney } from "./journey-mutation";
import type { JourneyControllerDependencies } from "./journey-request";

const JOURNEY_PATH = /^\/api\/v1\/journeys\/(j_v1\.[A-Za-z0-9_-]{22})(?:\/(commit|reveal))?$/;

export type { JourneyControllerDependencies } from "./journey-request";

export async function handleJourneyApi(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname === "/api/v1/journeys" && request.method === "POST") {
    return createJourney(request, env, dependencies);
  }
  if (url.pathname === "/api/v1/journeys") {
    return methodNotAllowed("POST");
  }
  const match = JOURNEY_PATH.exec(url.pathname);
  if (match === null) {
    return undefined;
  }
  const journeyId = match[1];
  const action = match[2];
  if (journeyId === undefined) {
    return publicError("invalid_request");
  }
  if (request.method === "GET" && action === undefined) {
    return getJourney(request, env, dependencies, journeyId);
  }
  if (request.method === "DELETE" && action === undefined) {
    return deleteJourney(request, env, dependencies, journeyId);
  }
  if (request.method === "POST" && (action === "commit" || action === "reveal")) {
    return mutateJourney(request, env, dependencies, journeyId, action);
  }
  return methodNotAllowed(action === undefined ? "GET, DELETE" : "POST");
}
