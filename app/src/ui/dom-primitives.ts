import type { JourneyApplicationSnapshot } from "../application/journey-application";

export function element<K extends keyof HTMLElementTagNameMap>(
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

export function actionButton(label: string, action: string, variant: string): HTMLButtonElement {
  const button = element("button", `button ${variant}`, label);
  button.type = "button";
  button.dataset.action = action;
  return button;
}

export function instrumentHeader(snapshot: JourneyApplicationSnapshot): HTMLElement {
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

export function safetyControls(includeReveal = true): HTMLElement {
  const wrapper = element("div", "safety-controls");
  const row = element("div", "safety-row");
  if (includeReveal) {
    row.append(actionButton("Reveal", "reveal", "button--secondary"));
  }
  row.append(actionButton("Give up", "give-up", "button--caution"));
  wrapper.append(row, actionButton("Reroll", "reroll", "button--quiet button--wide"));
  return wrapper;
}

export function compass(
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
