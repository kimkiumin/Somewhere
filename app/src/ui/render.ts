import type { JourneyApplicationSnapshot } from "../application/journey-application";

export type UiState = {
  readonly diagnosticsOpen: boolean;
  readonly environmentLabel: "open-sky" | "urban-canyon" | "indoor" | "other";
  readonly updateAvailable: boolean;
};

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function actionButton(label: string, action: string, variant: string): HTMLButtonElement {
  const button = element("button", `button ${variant}`, label);
  button.type = "button";
  button.dataset.action = action;
  return button;
}

function instrumentHeader(snapshot: JourneyApplicationSnapshot): HTMLElement {
  const header = element("header", "instrument-header");
  const brand = element("p", "wordmark", "Somewhere");
  const diagnostics = actionButton(
    `Field data · ${snapshot.diagnosticEventCount}`,
    "open-diagnostics",
    "button--quiet button--compact",
  );
  diagnostics.setAttribute("aria-label", "Open field diagnostics");
  header.append(brand, diagnostics);
  return header;
}

function safetyControls(includeReveal = true): HTMLElement {
  const wrapper = element("div", "safety-controls");
  const row = element("div", "safety-row");
  if (includeReveal) {
    row.append(actionButton("Reveal", "reveal", "button--secondary"));
  }
  row.append(actionButton("Give up", "give-up", "button--caution"));
  wrapper.append(row, actionButton("Reroll", "reroll", "button--quiet button--wide"));
  return wrapper;
}

function compass(
  variant: "live" | "paused" | "arrived" | "idle",
  distanceText: string,
  statusText: string,
): HTMLElement {
  const variantClass = variant === "live" || variant === "idle" ? "" : ` compass-stage--${variant}`;
  const stage = element("section", `compass-stage${variantClass}`);
  stage.setAttribute("aria-label", `${statusText} ${distanceText}`.trim());
  stage.append(element("span", "compass-cardinal", "N"));
  if (variant === "live") {
    const needle = element("span", "compass-needle");
    needle.dataset.compassNeedle = "";
    needle.setAttribute("aria-hidden", "true");
    stage.append(needle);
  }
  stage.append(element("span", "compass-hub"));
  const readout = element("div", "compass-readout");
  readout.append(
    element("strong", "distance", distanceText),
    element("span", "small-copy", statusText),
  );
  stage.append(readout);
  return stage;
}

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

function idleScreen(main: HTMLElement, uiState: UiState): void {
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

function hiddenScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
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
  if (reasons.includes("visibility-hidden")) {
    return "Return to this screen to refresh direction.";
  }
  if (reasons.includes("heading-uncalibrated")) {
    return "Move the phone gently to help the compass calibrate.";
  }
  return "The direction signal needs a moment.";
}

function activeJourneyScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
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

function revealedScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
  const revealed = snapshot.revealedDestination;
  const gaveUp = snapshot.journey.phase === "give-up";
  const article = element("article", `reveal-panel${gaveUp ? " reveal-panel--neutral" : ""}`);
  article.append(
    element("p", "eyebrow", gaveUp ? "Walk ended safely" : "Somewhere, revealed"),
    element("h1", undefined, revealed?.name ?? "Destination unavailable"),
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

function diagnosticsPanel(snapshot: JourneyApplicationSnapshot, uiState: UiState): HTMLElement {
  const panel = element("section", "panel diagnostics diagnostics-panel");
  panel.setAttribute("aria-labelledby", "diagnostics-title");
  const heading = element("div", "section-heading");
  const title = element("h2", undefined, "Field diagnostics");
  title.id = "diagnostics-title";
  heading.append(
    title,
    actionButton("Close", "close-diagnostics", "button--quiet button--compact"),
  );
  panel.append(
    heading,
    element(
      "p",
      "small-copy privacy-warning",
      "Sensitive: downloaded traces contain exact coordinates. Nothing is uploaded or saved automatically.",
    ),
  );

  for (const [label, value] of [
    [
      "Location",
      snapshot.sensors.location.status === "live"
        ? `Live · ±${Math.round(snapshot.sensors.location.sample.accuracyM)} m`
        : snapshot.sensors.location.status,
    ],
    [
      "Heading",
      snapshot.sensors.heading.status === "live"
        ? `Live · ${snapshot.sensors.heading.sample.reference}`
        : snapshot.sensors.heading.status,
    ],
    ["Wake Lock", snapshot.sensors.wakeLock.status],
    [
      "Subscriptions",
      `${snapshot.sensors.subscriptionCounts.location} location · ${snapshot.sensors.subscriptionCounts.heading} heading`,
    ],
    ["Trace events", String(snapshot.diagnosticEventCount)],
  ] as const) {
    const row = element("div", "diagnostic-row small-copy");
    row.append(element("span", "muted", label), element("strong", undefined, value));
    panel.append(row);
  }

  const label = element("label", "stack small-copy");
  label.htmlFor = "environment-label";
  label.append(element("span", "label muted", "Test environment"));
  const select = element("select", "select");
  select.id = "environment-label";
  select.dataset.action = "environment";
  for (const [value, text] of [
    ["other", "Not labelled"],
    ["open-sky", "Open sky"],
    ["urban-canyon", "Urban / building canyon"],
    ["indoor", "Indoor diagnostics"],
  ] as const) {
    const option = element("option", undefined, text);
    option.value = value;
    option.selected = uiState.environmentLabel === value;
    select.append(option);
  }
  label.append(select);
  panel.append(label);
  const actions = element("div", "button-row");
  actions.append(
    actionButton("Download trace", "download-diagnostics", "button--secondary"),
    actionButton("Discard", "discard-diagnostics", "button--caution"),
  );
  panel.append(actions);
  return panel;
}

export function renderSomewhere(
  root: HTMLElement,
  snapshot: JourneyApplicationSnapshot,
  uiState: UiState,
): void {
  const main = element("main", "app-shell app-shell--journey");
  main.dataset.appVersion = "v0.2";
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
  const live = element("p", "sr-only");
  live.setAttribute("aria-live", "polite");
  live.textContent =
    snapshot.journey.phase === "near"
      ? "You are getting closer."
      : snapshot.journey.phase === "arrived"
        ? "Arrived."
        : "";
  main.append(live);
  root.replaceChildren(main);
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
