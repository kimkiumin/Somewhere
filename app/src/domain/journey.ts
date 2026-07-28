export type JourneyState =
  | { readonly phase: "idle" }
  | { readonly phase: "selecting"; readonly excludeDestinationId?: string }
  | { readonly phase: "hidden"; readonly destinationId: string }
  | { readonly phase: "following"; readonly destinationId: string }
  | { readonly phase: "near"; readonly destinationId: string }
  | { readonly phase: "arrived"; readonly destinationId: string }
  | { readonly phase: "revealed"; readonly destinationId: string }
  | { readonly phase: "give-up"; readonly destinationId: string };

export type JourneyEvent =
  | { readonly type: "start" }
  | { readonly type: "destination-selected"; readonly destinationId: string }
  | { readonly type: "follow" }
  | { readonly type: "near" }
  | { readonly type: "far" }
  | { readonly type: "arrived" }
  | { readonly type: "reveal" }
  | { readonly type: "give-up" }
  | { readonly type: "reroll" }
  | { readonly type: "reset" };

function activeDestinationId(state: JourneyState): string | null {
  switch (state.phase) {
    case "hidden":
    case "following":
    case "near":
    case "arrived":
      return state.destinationId;
    case "idle":
    case "selecting":
    case "revealed":
    case "give-up":
      return null;
  }
}

export function transitionJourney(state: JourneyState, event: JourneyEvent): JourneyState {
  if (event.type === "reset") {
    return { phase: "idle" };
  }

  const destinationId = activeDestinationId(state);
  if (event.type === "reveal" && destinationId !== null) {
    return { phase: "revealed", destinationId };
  }
  if (event.type === "give-up" && destinationId !== null) {
    return { phase: "give-up", destinationId };
  }
  if (event.type === "reroll" && destinationId !== null) {
    return { phase: "selecting", excludeDestinationId: destinationId };
  }

  switch (state.phase) {
    case "idle":
      return event.type === "start" ? { phase: "selecting" } : state;
    case "selecting":
      return event.type === "destination-selected"
        ? { phase: "hidden", destinationId: event.destinationId }
        : state;
    case "hidden":
      return event.type === "follow"
        ? { phase: "following", destinationId: state.destinationId }
        : state;
    case "following":
      if (event.type === "near") {
        return { phase: "near", destinationId: state.destinationId };
      }
      if (event.type === "arrived") {
        return { phase: "arrived", destinationId: state.destinationId };
      }
      return state;
    case "near":
      if (event.type === "far") {
        return { phase: "following", destinationId: state.destinationId };
      }
      if (event.type === "arrived") {
        return { phase: "arrived", destinationId: state.destinationId };
      }
      return state;
    case "arrived":
    case "revealed":
    case "give-up":
      return state;
  }
}
