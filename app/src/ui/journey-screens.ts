import type { JourneyApplicationSnapshot } from "../application/journey-application";
import { actionButton, compass, element, safetyControls } from "./dom-primitives";
import type { UiState } from "./render";

function hiddenPanel(snapshot: JourneyApplicationSnapshot): HTMLElement {
  const panel = element("article", "panel hidden-panel");
  panel.append(
    element("span", "hidden-mark", "?"),
    element("p", "eyebrow", "Destination hidden"),
    element("h2", undefined, snapshot.hiddenDestination?.hint ?? "A quiet place is waiting."),
  );
  const meta = element("div", "meta-grid");
  const time = element("div", "meta-item");
  time.append(
    element("span", "label muted", "Walking estimate"),
    element(
      "strong",
      undefined,
      snapshot.hiddenDestination === null
        ? "Unknown"
        : `About ${snapshot.hiddenDestination.estimatedMinutes} min`,
    ),
  );
  const trust = element("div", "meta-item");
  trust.append(
    element("span", "label muted", "Field area"),
    element("strong", undefined, "Seoul Forest"),
  );
  meta.append(time, trust);
  panel.append(
    meta,
    element(
      "p",
      "small-copy muted",
      "Direction is not a route. Stay on public paths and follow crossings.",
    ),
  );
  return panel;
}

export function idleScreen(main: HTMLElement, uiState: UiState): void {
  const hero = element("section", "hero");
  hero.append(
    element("p", "eyebrow", "A quiet field instrument"),
    element("h1", undefined, "Follow the unknown."),
    element(
      "p",
      "lead muted",
      "Choose a hidden place, then walk with only direction and distance.",
    ),
  );
  main.append(
    hero,
    compass("idle", "?", "Destination stays hidden"),
    actionButton("Start adventure", "start", "button--primary button--wide"),
    element(
      "p",
      "small-copy muted centered",
      "Screen-on field test · Seoul Forest · No background navigation",
    ),
  );
  if (uiState.updateAvailable) {
    const update = element("aside", "update-notice");
    update.append(
      element("p", "small-copy", "A verified Somewhere update is ready."),
      actionButton("Update Somewhere", "accept-update", "button--secondary"),
    );
    main.append(update);
  }
}

export function hiddenScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
  const heading = element("section", "state-heading");
  heading.append(
    element("span", "status-pill", "Ready when you are"),
    element("h1", undefined, "Your destination is hidden."),
    element("p", "body-copy muted", "You can reveal or leave at any time."),
  );
  main.append(
    heading,
    hiddenPanel(snapshot),
    actionButton("Begin walk", "begin", "button--primary button--wide"),
    safetyControls(),
  );
}

function pauseCopy(snapshot: JourneyApplicationSnapshot): string {
  if (snapshot.sensors.heading.status === "denied") {
    return "Compass access was not allowed.";
  }
  const reasons = snapshot.guidance.status === "paused" ? snapshot.guidance.reasons : [];
  if (reasons.includes("location-inaccurate")) {
    return "Location is too uncertain right now.";
  }
  if (reasons.includes("location-stale")) {
    return "Location has not refreshed yet.";
  }
  if (reasons.includes("heading-stale")) {
    return "Compass has not refreshed yet.";
  }
  if (reasons.includes("visibility-hidden")) {
    return "Return to this screen to refresh direction.";
  }
  if (reasons.includes("heading-uncalibrated")) {
    return "Move the phone gently to help the compass calibrate.";
  }
  return "The direction signal needs a moment.";
}

export function activeJourneyScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
  if (snapshot.journey.phase === "arrived") {
    const heading = element("section", "state-heading");
    heading.append(
      element("span", "status-pill status-pill--arrived", "Journey complete"),
      element("h1", undefined, "Arrived."),
      element("p", "body-copy muted", "Ready to discover where the signal brought you?"),
    );
    main.append(
      heading,
      compass("arrived", "Arrived", "Take in your surroundings"),
      actionButton("Reveal destination", "reveal", "button--primary button--wide button--warm"),
      safetyControls(false),
    );
    return;
  }

  const live = snapshot.guidance.status === "live";
  const acquiring = snapshot.guidance.status === "acquiring";
  const near = snapshot.journey.phase === "near";
  const heading = element("section", "state-heading state-heading--compact");
  heading.append(
    element(
      "span",
      `status-pill${live ? "" : acquiring ? " status-pill--acquiring" : " status-pill--paused"}`,
      live ? (near ? "Very close" : "Signals ready") : acquiring ? "Finding direction" : "Paused",
    ),
    element(
      "h1",
      "journey-title",
      live
        ? near
          ? "You are getting closer."
          : "Keep following the quiet signal."
        : acquiring
          ? "Finding your direction…"
          : "Direction paused.",
    ),
  );
  main.append(heading);

  if (live) {
    main.append(
      compass(
        "live",
        `${Math.max(0, Math.round(snapshot.guidance.distanceM))} m`,
        near ? "Move carefully" : "Keep to public paths",
      ),
    );
  } else {
    main.append(
      compass(
        "paused",
        acquiring ? "…" : "Paused",
        acquiring ? "Waiting for fresh signals" : pauseCopy(snapshot),
      ),
    );
    if (!acquiring) {
      main.append(actionButton("Retry signals", "retry", "button--secondary button--wide"));
    }
  }
  main.append(safetyControls());
}

export function revealedScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
  const revealed = snapshot.revealedDestination;
  const gaveUp = snapshot.journey.phase === "give-up";
  const article = element("article", `reveal-panel${gaveUp ? " reveal-panel--neutral" : ""}`);
  const name = element("h1", undefined, revealed?.name ?? "Destination unavailable");
  if (revealed !== null) {
    name.lang = revealed.language;
  }
  article.append(
    element("p", "eyebrow", gaveUp ? "Walk ended safely" : "Somewhere, revealed"),
    name,
    element("p", "label reveal-category", revealed?.category ?? "Unknown place"),
    element("p", "lead", revealed?.description ?? "No description is available."),
    element(
      "p",
      "small-copy muted",
      revealed?.curationNote ?? "Check current access before approaching.",
    ),
    actionButton("Start again", "restart", "button--primary button--wide"),
  );
  main.append(article);
}
