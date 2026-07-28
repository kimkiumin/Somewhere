import "./styles.css";

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

function button(label: string, variant: string): HTMLButtonElement {
  const node = element("button", `button ${variant}`, label);
  node.type = "button";
  return node;
}

function compass(variant: "live" | "paused" | "arrived"): HTMLElement {
  const stage = element(
    "section",
    `compass-stage${variant === "live" ? "" : ` compass-stage--${variant}`}`,
  );
  stage.setAttribute("aria-label", `Compass ${variant} state`);
  stage.append(element("span", "compass-cardinal", "N"));
  const needle = element("span", "compass-needle");
  needle.setAttribute("aria-hidden", "true");
  stage.append(needle, element("span", "compass-hub"));
  const readout = element("div", "compass-readout");
  readout.append(
    element("strong", "distance", variant === "arrived" ? "Arrived" : "184 m"),
    element(
      "span",
      "small-copy",
      variant === "paused" ? "Direction paused" : "Keep to public paths",
    ),
  );
  stage.append(readout);
  return stage;
}

const root = document.querySelector<HTMLElement>("#showcase");
if (root === null) {
  throw new Error("Showcase root is missing.");
}

const main = element("main", "showcase");
const header = element("header", "showcase-section");
header.append(
  element("p", "eyebrow", "Somewhere v0.2"),
  element("h1", undefined, "Primitive showcase"),
  element(
    "p",
    "lead muted",
    "A quiet field instrument for hidden-destination walks. Every journey state starts here.",
  ),
);

const controls = element("section", "showcase-section");
controls.append(element("h2", undefined, "Controls & status"));
const controlGrid = element("div", "showcase-grid");
const buttons = element("div", "panel stack");
buttons.append(
  element("h3", undefined, "Button variants"),
  button("Start adventure", "button--primary"),
  button("Reveal destination", "button--secondary"),
  button("Reroll", "button--quiet"),
  button("Give up safely", "button--caution"),
);
const statuses = element("div", "panel stack");
statuses.append(element("h3", undefined, "Signal states"));
for (const [label, variant] of [
  ["Signals ready", ""],
  ["Finding direction", " status-pill--acquiring"],
  ["Direction paused", " status-pill--paused"],
  ["Arrived", " status-pill--arrived"],
] as const) {
  statuses.append(element("span", `status-pill${variant}`, label));
}
controlGrid.append(buttons, statuses);
controls.append(controlGrid);

const instruments = element("section", "showcase-section");
instruments.append(element("h2", undefined, "Compass states"));
const compassGrid = element("div", "showcase-grid");
compassGrid.append(compass("live"), compass("paused"), compass("arrived"));
instruments.append(compassGrid);

const surfaces = element("section", "showcase-section");
surfaces.append(element("h2", undefined, "Trust surfaces"));
const surfaceGrid = element("div", "showcase-grid");
const hidden = element("article", "panel hidden-panel");
hidden.append(
  element("span", "hidden-mark", "?"),
  element("p", "eyebrow", "Destination hidden"),
  element("h3", undefined, "Still water holds the sky."),
);
const meta = element("div", "meta-grid");
for (const [label, value] of [
  ["Approx. distance", "640 m"],
  ["Walking time", "8 min"],
] as const) {
  const item = element("div", "meta-item");
  item.append(element("span", "label muted", label), element("strong", undefined, value));
  meta.append(item);
}
hidden.append(meta);
const safety = element("div", "safety-row");
safety.append(button("Reveal", "button--secondary"), button("Give up", "button--caution"));
hidden.append(safety);

const diagnostics = element("article", "panel diagnostics");
diagnostics.append(
  element("p", "eyebrow", "Field diagnostics"),
  element("h3", undefined, "Memory-only trace"),
  element(
    "p",
    "small-copy muted",
    "Exports contain exact coordinates. Download only when you intend to keep them.",
  ),
);
for (const [label, value] of [
  ["Location", "Live · ±12 m"],
  ["Heading", "Live · ±7°"],
  ["Wake Lock", "Active"],
] as const) {
  const row = element("div", "diagnostic-row small-copy");
  row.append(element("span", "muted", label), element("strong", undefined, value));
  diagnostics.append(row);
}
diagnostics.append(button("Download trace", "button--secondary button--wide"));
surfaceGrid.append(hidden, diagnostics);
surfaces.append(surfaceGrid);

main.append(header, controls, instruments, surfaces);
root.append(main);
