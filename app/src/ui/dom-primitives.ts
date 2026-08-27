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

export function actionButton(
  label: string,
  action: string,
  variant = "button--secondary",
): HTMLButtonElement {
  const button = element("button", `button ${variant}`, label);
  button.type = "button";
  button.dataset.action = action;
  return button;
}

export function instrumentHeader(): HTMLElement {
  const header = element("header", "instrument-header");
  header.append(
    element("p", "wordmark", "Somewhere"),
    element("p", "header-note", "한 곳만, 조용히"),
  );
  return header;
}

export function infoRows(distance: string, category: string, price: string): HTMLElement {
  const list = element("dl", "info-rows");
  for (const [label, value] of [
    ["거리", distance],
    ["메뉴", category],
    ["가격", price],
  ] as const) {
    const row = element("div", "info-row");
    row.append(element("dt", undefined, label), element("dd", undefined, value));
    list.append(row);
  }
  return list;
}

export function compass(
  variant: "live" | "paused" | "arrived" | "idle",
  distanceText: string,
  statusText: string,
): HTMLElement {
  const suffix = variant === "live" || variant === "idle" ? "" : ` compass-stage--${variant}`;
  const stage = element("section", `compass-stage${suffix}`);
  stage.setAttribute("aria-label", `${statusText} ${distanceText}`.trim());
  stage.append(element("span", "compass-cardinal", "N"));
  if (variant === "live") {
    const needle = element("span", "compass-needle");
    needle.dataset.compassNeedle = "";
    needle.setAttribute("aria-hidden", "true");
    stage.append(needle);
  }
  if (variant !== "idle") {
    stage.append(element("span", "compass-hub"));
  }
  const readout = element("div", "compass-readout");
  readout.append(
    element("strong", "distance", distanceText),
    element("span", "small-copy", statusText),
  );
  stage.append(readout);
  return stage;
}

export function safetyControls(canReveal: boolean): HTMLElement {
  const row = element("div", "safety-row");
  if (canReveal) {
    row.append(actionButton("목적지 확인", "reveal"));
  }
  row.append(actionButton("중단", "stop", "button--caution"));
  return row;
}
