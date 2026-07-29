import type { JourneyApplicationSnapshot } from "../application/journey-application";
import { diagnosticsPanel } from "./diagnostics-panel";
import { element, instrumentHeader } from "./dom-primitives";
import { activeJourneyScreen, hiddenScreen, idleScreen, revealedScreen } from "./journey-screens";

export type UiState = {
  readonly diagnosticsOpen: boolean;
  readonly environmentLabel: "open-sky" | "urban-canyon" | "indoor" | "other";
  readonly updateAvailable: boolean;
};

export function renderSomewhere(
  root: HTMLElement,
  snapshot: JourneyApplicationSnapshot,
  uiState: UiState,
): void {
  const main = element("main", "app-shell app-shell--journey");
  main.dataset.appVersion = "v0.2";
  main.dataset.appScreen = "";
  main.append(instrumentHeader(snapshot));

  switch (snapshot.journey.phase) {
    case "idle":
      idleScreen(main, uiState);
      break;
    case "selecting":
      main.append(
        element("p", "eyebrow", "Choosing quietly"),
        element("h1", undefined, "Finding somewhere…"),
      );
      break;
    case "hidden":
      hiddenScreen(main, snapshot);
      break;
    case "following":
    case "near":
    case "arrived":
      activeJourneyScreen(main, snapshot);
      break;
    case "revealed":
    case "give-up":
      revealedScreen(main, snapshot);
      break;
  }

  if (uiState.diagnosticsOpen) {
    main.append(diagnosticsPanel(snapshot, uiState));
  }
  const previousScreen = root.querySelector<HTMLElement>(":scope > main[data-app-screen]");
  if (previousScreen === null) {
    root.prepend(main);
  } else {
    previousScreen.replaceWith(main);
  }
  let live = root.querySelector<HTMLElement>(":scope > [data-app-live]");
  if (live === null) {
    live = element("p", "sr-only");
    live.dataset.appLive = "";
    live.setAttribute("aria-live", "polite");
    root.append(live);
  }
  live.textContent =
    snapshot.journey.phase === "near"
      ? "You are getting closer."
      : snapshot.journey.phase === "arrived"
        ? "Arrived."
        : "";
}

export function renderKey(snapshot: JourneyApplicationSnapshot, uiState: UiState): string {
  const roundedDistance =
    snapshot.guidance.status === "live" ? Math.round(snapshot.guidance.distanceM) : null;
  const reasons = snapshot.guidance.status === "paused" ? snapshot.guidance.reasons.join(",") : "";
  return JSON.stringify({
    phase: snapshot.journey.phase,
    destinationId:
      snapshot.journey.phase === "idle" || snapshot.journey.phase === "selecting"
        ? null
        : snapshot.journey.destinationId,
    guidance: snapshot.guidance.status,
    roundedDistance,
    reasons,
    location: snapshot.sensors.location.status,
    heading: snapshot.sensors.heading.status,
    wakeLock: snapshot.sensors.wakeLock.status,
    diagnosticsOpen: uiState.diagnosticsOpen,
    environmentLabel: uiState.environmentLabel,
    updateAvailable: uiState.updateAvailable,
    diagnosticEventCount: uiState.diagnosticsOpen ? snapshot.diagnosticEventCount : null,
  });
}
