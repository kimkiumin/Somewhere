import { methodNotAllowed, publicError } from "./http-response";
import { createJourney } from "./journey-create";
import type { LifecycleMutationAction } from "./journey-lifecycle-body";
import { deleteJourney, getJourney, mutateJourney } from "./journey-mutation";
import { handleRecovery } from "./journey-recovery";
import type { JourneyControllerDependencies } from "./journey-request";

const JOURNEY_PATH =
  /^\/api\/v1\/journeys\/(j_v1\.[A-Za-z0-9_-]{22})(?:\/(commit|reveal|stop\/request|stop\/cancel|stop\/confirm|stop\/reason|route\/recover|arrival|recovery|recovery\/confirm))?$/;

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
  const mutationAction = lifecycleAction(action);
  if (request.method === "POST" && mutationAction !== undefined) {
    return mutateJourney(request, env, dependencies, journeyId, mutationAction);
  }
  if (request.method === "POST" && (action === "recovery" || action === "recovery/confirm")) {
    return handleRecovery(
      request,
      env,
      dependencies,
      journeyId,
      action === "recovery" ? "intent" : "confirm",
    );
  }
  return methodNotAllowed(action === undefined ? "GET, DELETE" : "POST");
}

function lifecycleAction(action: string | undefined): LifecycleMutationAction | undefined {
  switch (action) {
    case "arrival":
    case "commit":
    case "reveal":
      return action;
    case "route/recover":
      return "route-recover";
    case "stop/cancel":
      return "continue";
    case "stop/confirm":
      return "confirm-stop";
    case "stop/reason":
      return "stop-reason";
    case "stop/request":
      return "stop-request";
    default:
      return undefined;
  }
}
