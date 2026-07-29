import type { JourneyState } from "../domain/journey";
import type { CuratedDestination } from "../platform/curated-destinations";

export type HiddenDestinationView = {
  readonly hint: string;
  readonly estimatedMinutes: number;
};

export type RevealedDestinationView = {
  readonly name: string;
  readonly language: "ko" | "en";
  readonly category: string;
  readonly description: string;
  readonly curationNote: string;
};

export function activeDestinationId(journey: JourneyState): string | null {
  switch (journey.phase) {
    case "hidden":
    case "following":
    case "near":
    case "arrived":
    case "revealed":
    case "give-up":
      return journey.destinationId;
    case "idle":
    case "selecting":
      return null;
  }
}

export function activeDestination(
  journey: JourneyState,
  destinations: readonly CuratedDestination[],
): CuratedDestination | null {
  const id = activeDestinationId(journey);
  if (id === null) {
    return null;
  }
  return destinations.find((destination) => destination.id === id) ?? null;
}

export function hiddenDestinationView(
  journey: JourneyState,
  selected: CuratedDestination | null,
): HiddenDestinationView | null {
  if (
    selected === null ||
    journey.phase === "idle" ||
    journey.phase === "selecting" ||
    journey.phase === "revealed" ||
    journey.phase === "give-up"
  ) {
    return null;
  }
  return {
    hint: selected.hint,
    estimatedMinutes: selected.estimatedMinutes,
  };
}

export function revealedDestinationView(
  journey: JourneyState,
  selected: CuratedDestination | null,
): RevealedDestinationView | null {
  if (selected === null || (journey.phase !== "revealed" && journey.phase !== "give-up")) {
    return null;
  }
  return {
    name: selected.reveal.name,
    language: selected.reveal.language,
    category: selected.reveal.category,
    description: selected.reveal.description,
    curationNote: selected.curation.note,
  };
}
