import type { JourneyApplicationSnapshot } from "../application/journey-application";
import { actionButton, element } from "./dom-primitives";
import type { UiState } from "./render";

export function diagnosticsPanel(
  snapshot: JourneyApplicationSnapshot,
  uiState: UiState,
): HTMLElement {
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
