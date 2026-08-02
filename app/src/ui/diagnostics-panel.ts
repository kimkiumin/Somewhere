import type { JourneyApplicationSnapshot } from "../application/journey-application";
import { actionButton, element } from "./dom-primitives";

export function diagnosticsPanel(snapshot: JourneyApplicationSnapshot): HTMLElement {
  const panel = element("section", "panel diagnostics");
  panel.setAttribute("aria-labelledby", "diagnostics-title");
  const title = element("h1", undefined, "Field diagnostics");
  title.id = "diagnostics-title";
  panel.append(
    element("p", "eyebrow", "Somewhere field surface"),
    title,
    element(
      "p",
      "small-copy privacy-warning",
      "Sensitive: a local export may contain exact coordinates. Nothing uploads automatically.",
    ),
  );
  const location =
    snapshot.sensors.location.status === "live"
      ? `live · ±${Math.round(snapshot.sensors.location.sample.accuracyM)} m`
      : snapshot.sensors.location.status;
  const heading =
    snapshot.sensors.heading.status === "live"
      ? `live · ${snapshot.sensors.heading.sample.reference} · ${
          snapshot.sensors.heading.sample.accuracyDeg === null
            ? "accuracy unknown"
            : `±${Math.round(snapshot.sensors.heading.sample.accuracyDeg)}°`
        }`
      : snapshot.sensors.heading.status;
  const guidance =
    snapshot.guidance.status === "live" && snapshot.guidance.distanceM !== null
      ? `live · ${Math.round(snapshot.guidance.distanceM)} m`
      : snapshot.guidance.status;
  for (const [label, value] of [
    ["Safe phase", snapshot.projection?.phase ?? snapshot.journey.phase],
    ["Location", location],
    ["Heading", heading],
    ["Guidance", guidance],
    ["Visibility", snapshot.sensors.visibility],
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
  const actions = element("div", "button-row");
  actions.append(
    actionButton("Start sensors", "field-start", "button--primary"),
    actionButton("Retry", "field-retry"),
    actionButton("Export local JSON", "field-export"),
    actionButton("Discard trace", "field-discard", "button--caution"),
  );
  panel.append(actions);
  return panel;
}
